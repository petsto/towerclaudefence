// Shared HD modelling kit: bevelled primitives with box-projected UVs (so the tileable PBR sets apply without
// unwrapping), vertex tint + baked height/part AO in the colour attribute, merged per (material, turret) so each model
// is a handful of draw calls. Plus the shared tower plinth / turret ring / rank dress. Contract: ./index.ts.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type MatId = 'metal' | 'paint' | 'hazard' | 'chitin' | 'glow';
export type Level = 1 | 2 | 3;
export type G = THREE.BufferGeometry;
export type V3 = readonly [number, number, number];
/** p = position, r = Euler XYZ rotation, s = scale. */
export interface Xf { p?: V3; r?: V3; s?: V3 | number }
export interface Part { geo: G; mat: MatId; turret: boolean }
/** A finished model: merged parts; `turret` parts are relative to (0, pivot, 0) and rotate with yaw. */
export interface Built { parts: Part[]; pivot: number; tris: number }
interface Raw { geo: G; mat: MatId; color: number; gain: number; turret: boolean }

export const PI = Math.PI;
const UV_DENSITY = 1 / 0.8; // texture tiles per world unit
const UP = new THREE.Vector3(0, 1, 0);

/** Shared palette (sRGB hex). Glow colours go through `k.glow` (gain > 1). */
export const C = {
  gun: 0x7a818b, gunD: 0x434850, steel: 0xb4bcc4, chrome: 0xe4e8ec, team: 0x3f78c8, deck: 0x7d868f,
  rubber: 0x18191b, bore: 0x050505, red: 0xa8261a,
  amber: 0xffa020, cyan: 0x60d0ff, green: 0x40ff70, redGlow: 0xff2a1a, pip: 0xffe6a0,
  rust: 0x8a4a2a, rmGun: 0x4a5058, rmSteel: 0x2e3238,
  chDark: 0x2a1634, chBody: 0x5a3270, chPlate: 0x8a5a24, chBone: 0xc8b890, chGlow: 0xff20a8,
} as const;

// --- primitive constructors (untransformed; pass them to k.add with an Xf) -------------------------------------------
export const rbox = (w: number, h: number, d: number, r = 0.015, seg = 1): G =>
  new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
export const cyl = (rt: number, rb: number, h: number, seg = 24): G => new THREE.CylinderGeometry(rt, rb, h, seg);
export const sph = (r: number, ws = 24, hs = 16): G => new THREE.SphereGeometry(r, ws, hs);
export const torus = (R: number, r: number, ts = 24, arc = PI * 2): G => new THREE.TorusGeometry(R, r, 8, ts, arc);
/** Tube along a smooth curve through the points. */
export const tube = (pts: V3[], r: number, seg = 10): G =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, 6);

export function xfm(xf: Xf): THREE.Matrix4 {
  const s = xf.s ?? 1;
  const sv = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(xf.r ?? [0, 0, 0])));
  return new THREE.Matrix4().compose(new THREE.Vector3(...(xf.p ?? [0, 0, 0])), q, sv);
}
/** Matrix placing a Y-aligned primitive of length |b-a| between a and b. */
function between(a: V3, b: V3): { m: THREE.Matrix4; len: number } {
  const va = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(va);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
  return { m: new THREE.Matrix4().compose(va.addScaledVector(d, 0.5), q, new THREE.Vector3(1, 1, 1)), len };
}

/** Box-projected UVs in the part's local space (dominant normal axis), with a random offset per part. */
function boxUV(geo: G, seed: number): void {
  const pos = geo.attributes.position!, nrm = geo.attributes.normal!;
  const uv = new Float32Array(pos.count * 2);
  const ou = (Math.sin(seed * 12.9898) * 43758.5453) % 1, ov = (Math.sin(seed * 78.233) * 12543.123) % 1;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const [u, v] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [x, z] : [x, y];
    uv[i * 2] = u * UV_DENSITY + ou;
    uv[i * 2 + 1] = v * UV_DENSITY + ov;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// --- kit -------------------------------------------------------------------------------------------------------------
/** Accumulates parts; everything added after `setTurret(true)` is turret-relative (origin at the pivot). */
export function kit() {
  const raw: Raw[] = [];
  let turret = false;
  let n = 0;
  const add = (geo: G, mat: MatId, color: number, xf: Xf | THREE.Matrix4 = {}, gain = 1): G => {
    boxUV(geo, ++n);
    geo.applyMatrix4(xf instanceof THREE.Matrix4 ? xf : xfm(xf));
    raw.push({ geo, mat, color, gain, turret });
    return geo;
  };
  return {
    raw,
    add,
    /** Unlit emissive part; gain > 1 makes it read hot after the bake clamp. */
    glow: (geo: G, color: number, xf: Xf | THREE.Matrix4 = {}, gain = 8): G => add(geo, 'glow', color, xf, gain),
    /** Cylinder from a (radius r) to b (radius rB, default r; 0 = spike at b). */
    rod: (a: V3, b: V3, r: number, mat: MatId, color: number, rB = r, seg = 12): G => {
      const { m, len } = between(a, b);
      return add(cyl(rB, r, len, seg), mat, color, m);
    },
    /** Rounded box spanning a -> b along its local Y. */
    strut: (a: V3, b: V3, w: number, d: number, mat: MatId, color: number, r = 0.012): G => {
      const { m, len } = between(a, b);
      return add(rbox(w, len, d, r), mat, color, m);
    },
    setTurret: (t: boolean) => void (turret = t),
  };
}
export type Kit = ReturnType<typeof kit>;

export function finalize(k: Kit, pivot: number): Built {
  const groups = new Map<string, G[]>();
  const col = new THREE.Color();
  const bb = new THREE.Box3();
  for (const p of k.raw) {
    const pos = p.geo.attributes.position!;
    bb.setFromBufferAttribute(pos as THREE.BufferAttribute);
    const ph = bb.max.y - bb.min.y;
    col.setHex(p.color); // sRGB hex -> linear
    const arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      let ao = 1;
      if (p.mat !== 'glow') {
        const y = pos.getY(i) + (p.turret ? pivot : 0);
        ao = 0.6 + 0.4 * THREE.MathUtils.smoothstep(y, -0.02, 0.24); // ground contact darkening
        if (ph > 0.03) ao *= 0.72 + 0.28 * ((pos.getY(i) - bb.min.y) / ph); // each part darker toward its base
      }
      arr[i * 3] = col.r * ao * p.gain;
      arr[i * 3 + 1] = col.g * ao * p.gain;
      arr[i * 3 + 2] = col.b * ao * p.gain;
    }
    p.geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    const key = `${p.turret ? 1 : 0}:${p.mat}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p.geo);
  }
  const parts: Part[] = [];
  for (const [key, geos] of groups) {
    const geo = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    if (!geo) throw new Error(`merge failed: ${key}`);
    geo.computeBoundingSphere();
    const [t, mat] = key.split(':') as [string, MatId];
    parts.push({ geo, mat, turret: t === '1' });
  }
  return { parts, pivot, tris: countTris(parts) };
}

export const countTris = (parts: Part[]): number =>
  parts.reduce((n, p) => n + (p.geo.index ? p.geo.index.count : p.geo.attributes.position!.count) / 3, 0);

// --- shared tower pieces -------------------------------------------------------------------------------------------
/** Deck height of the standard plinth: use as the turret pivot. */
export const DECK = 0.205;

/** Standard 0.88² armoured plinth: hazard band, vents and status lights on the camera face (+Z), fan, cabling. */
export function plinth(k: Kit): void {
  k.add(rbox(0.88, 0.05, 0.88, 0.015), 'metal', C.gunD, { p: [0, 0.025, 0] });
  k.add(rbox(0.82, 0.14, 0.82, 0.035, 2), 'metal', C.gun, { p: [0, 0.11, 0] });
  k.add(rbox(0.7, 0.03, 0.7, 0.012), 'paint', C.deck, { p: [0, 0.19, 0] });
  // front face (+Z, toward the camera): hazard band, vent grilles, status lights, conduit
  k.add(rbox(0.74, 0.03, 0.012, 0.004), 'hazard', 0xffffff, { p: [0, 0.158, 0.412] });
  for (const gx of [-0.22, 0.03]) {
    k.add(rbox(0.19, 0.06, 0.012, 0.005), 'metal', C.gunD, { p: [gx, 0.105, 0.412] });
    for (let i = 0; i < 4; i++) k.add(rbox(0.17, 0.007, 0.016, 0.002), 'metal', C.steel, { p: [gx, 0.087 + i * 0.012, 0.418], r: [-0.6, 0, 0] });
  }
  k.glow(rbox(0.035, 0.016, 0.006, 0.003), C.amber, { p: [0.24, 0.112, 0.416] });
  k.glow(rbox(0.035, 0.016, 0.006, 0.003), C.green, { p: [0.3, 0.112, 0.416] });
  k.rod([-0.38, 0.068, 0.428], [0.38, 0.068, 0.428], 0.014, 'metal', C.steel);
  for (const x of [-0.3, 0, 0.3]) k.add(rbox(0.03, 0.03, 0.03, 0.006), 'metal', C.gunD, { p: [x, 0.068, 0.425] });
  // side faces: vent grilles
  for (const s of [-1, 1]) {
    k.add(rbox(0.012, 0.06, 0.3, 0.005), 'metal', C.gunD, { p: [s * 0.412, 0.105, 0] });
    for (let i = 0; i < 4; i++) k.add(rbox(0.016, 0.007, 0.28, 0.002), 'metal', C.steel, { p: [s * 0.418, 0.087 + i * 0.012, 0], r: [0, 0, s * 0.6] });
  }
  // deck corners: hex bolts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.add(cyl(0.02, 0.02, 0.016, 6), 'metal', C.steel, { p: [sx * 0.375, 0.188, sz * 0.375] });
    k.add(cyl(0.032, 0.032, 0.006, 16), 'metal', C.gunD, { p: [sx * 0.375, 0.182, sz * 0.375] });
  }
  // cooling fan, rear right of the deck
  const fx = 0.27, fz = -0.27, fy = DECK;
  k.add(torus(0.085, 0.014), 'metal', C.gun, { p: [fx, fy + 0.008, fz], r: [PI / 2, 0, 0] });
  k.add(cyl(0.08, 0.08, 0.006, 24), 'metal', C.bore, { p: [fx, fy - 0.002, fz] });
  for (let i = 0; i < 6; i++) k.add(rbox(0.07, 0.004, 0.026, 0.002), 'metal', C.steel, { p: [fx + Math.cos((i * PI) / 3) * 0.04, fy + 0.006, fz + Math.sin((i * PI) / 3) * 0.04], r: [0.35, -(i * PI) / 3, 0] });
  k.add(cyl(0.02, 0.022, 0.014, 16), 'metal', C.gunD, { p: [fx, fy + 0.008, fz] });
  // rear left: auxiliary vent box with cables to the turret ring
  k.add(rbox(0.16, 0.05, 0.2, 0.012), 'paint', C.team, { p: [-0.27, DECK + 0.02, -0.25] });
  for (let i = 0; i < 4; i++) k.add(rbox(0.13, 0.006, 0.02, 0.002), 'metal', C.gunD, { p: [-0.27, DECK + 0.047, -0.31 + i * 0.04] });
  k.add(tube([[-0.2, DECK + 0.02, -0.17], [-0.17, DECK + 0.01, -0.1], [-0.15, DECK + 0.02, -0.05]], 0.01, 8), 'metal', C.rubber);
}

/** Bolted slewing ring at the pivot (call after setTurret(true)). */
export function turretRing(k: Kit): void {
  k.add(cyl(0.25, 0.265, 0.05, 32), 'metal', C.gunD, { p: [0, 0.025, 0] });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2;
    k.add(cyl(0.011, 0.011, 0.012, 6), 'metal', C.steel, { p: [Math.cos(a) * 0.235, 0.054, Math.sin(a) * 0.235] });
  }
}

/**
 * Rank dress on the standard plinth (call while setTurret(false)): 1/2/3 lit pips on the front base slab,
 * L2+ amber strips along the sides, L3 two rear beacon masts. Placeholder until each tower gets bespoke upgrades.
 */
export function rankDress(k: Kit, level: Level): void {
  for (let i = 0; i < level; i++) k.glow(rbox(0.05, 0.026, 0.008, 0.003), C.pip, { p: [(i - (level - 1) / 2) * 0.07, 0.025, 0.443] }, 4);
  if (level === 1) return;
  for (const s of [-1, 1]) k.glow(rbox(0.008, 0.012, 0.5, 0.003), C.amber, { p: [s * 0.443, 0.03, 0] }, 6);
  if (level === 2) return;
  for (const s of [-1, 1]) {
    k.add(rbox(0.045, 0.36, 0.045, 0.01), 'metal', C.gunD, { p: [s * 0.37, DECK + 0.18, -0.37] });
    k.glow(rbox(0.05, 0.04, 0.05, 0.008), C.amber, { p: [s * 0.37, DECK + 0.38, -0.37] }, 6);
  }
}
