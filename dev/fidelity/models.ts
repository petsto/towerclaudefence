// HD rebuilds of Picket Autocannon, Breacher Missile Pod, Husk Crawler and Rivet Walker. Kitbashed from bevelled
// primitives with box-projected UVs (so the tileable PBR sets apply without unwrapping), vertex tint + baked
// height/part AO in the colour attribute, merged per (material, turret) so each model is a handful of draw calls.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { chitin, hardSurface } from './textures';

export type MatId = 'metal' | 'paint' | 'hazard' | 'chitin' | 'glow';
export type Kind = 'picket' | 'breacher' | 'husk' | 'rivet';
type G = THREE.BufferGeometry;
type V3 = readonly [number, number, number];
interface Xf { p?: V3; r?: V3; s?: V3 | number }
interface Raw { geo: G; mat: MatId; color: number; gain: number; turret: boolean }
export interface Built { parts: { geo: G; mat: MatId; turret: boolean }[]; pivot: number; tris: number }

const PI = Math.PI;
const UV_DENSITY = 1 / 0.8; // texture tiles per world unit
const UP = new THREE.Vector3(0, 1, 0);

// palette (sRGB hex)
const C = {
  gun: 0x7a818b, gunD: 0x434850, steel: 0xb4bcc4, chrome: 0xe4e8ec, team: 0x3f78c8, deck: 0x7d868f,
  rubber: 0x18191b, bore: 0x050505, red: 0xa8261a,
  amber: 0xffa020, cyan: 0x60d0ff, green: 0x40ff70, redGlow: 0xff2a1a,
  rust: 0x8a4a2a, rmGun: 0x4a5058, rmSteel: 0x2e3238,
  chDark: 0x2a1634, chBody: 0x5a3270, chPlate: 0x8a5a24, chBone: 0xc8b890, chGlow: 0xff20a8,
} as const;

// --- primitive constructors ---------------------------------------------------------------------------------------
const rbox = (w: number, h: number, d: number, r = 0.015, seg = 1): G =>
  new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
const cyl = (rt: number, rb: number, h: number, seg = 24): G => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r: number, ws = 24, hs = 16): G => new THREE.SphereGeometry(r, ws, hs);
const torus = (R: number, r: number, ts = 24, arc = PI * 2): G => new THREE.TorusGeometry(R, r, 8, ts, arc);

function xfm(xf: Xf): THREE.Matrix4 {
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

// --- kit -----------------------------------------------------------------------------------------------------------
function kit() {
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
    glow: (geo: G, color: number, xf: Xf | THREE.Matrix4 = {}, gain = 8): G => add(geo, 'glow', color, xf, gain),
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
type Kit = ReturnType<typeof kit>;

function finalize(k: Kit, pivot: number): Built {
  const groups = new Map<string, G[]>();
  const col = new THREE.Color();
  const bb = new THREE.Box3();
  let tris = 0;
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
  const parts: Built['parts'] = [];
  for (const [key, geos] of groups) {
    const geo = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    if (!geo) throw new Error(`merge failed: ${key}`);
    geo.computeBoundingSphere();
    tris += geo.attributes.position!.count / 3;
    const [t, mat] = key.split(':') as [string, MatId];
    parts.push({ geo, mat, turret: t === '1' });
  }
  return { parts, pivot, tris };
}

// --- shared tower plinth ------------------------------------------------------------------------------------------
const DECK = 0.205;
function plinth(k: Kit): void {
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
  k.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.2, DECK + 0.02, -0.17), new THREE.Vector3(-0.17, DECK + 0.01, -0.1), new THREE.Vector3(-0.15, DECK + 0.02, -0.05)]), 8, 0.01, 6), 'metal', C.rubber);
}

function turretRing(k: Kit): void {
  k.add(cyl(0.25, 0.265, 0.05, 32), 'metal', C.gunD, { p: [0, 0.025, 0] });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2;
    k.add(cyl(0.011, 0.011, 0.012, 6), 'metal', C.steel, { p: [Math.cos(a) * 0.235, 0.054, Math.sin(a) * 0.235] });
  }
}

// --- Picket Autocannon ---------------------------------------------------------------------------------------------
function picket(): Built {
  const k = kit();
  plinth(k);
  k.setTurret(true);
  turretRing(k);
  k.add(rbox(0.36, 0.16, 0.32, 0.035, 2), 'paint', C.deck, { p: [-0.05, 0.13, 0] });
  k.add(rbox(0.26, 0.024, 0.26, 0.01), 'paint', C.team, { p: [-0.08, 0.222, 0] });
  k.add(rbox(0.15, 0.14, 0.3, 0.025, 2), 'metal', C.gun, { p: [0.12, 0.115, 0], r: [0, 0, -0.42] });
  k.add(rbox(0.035, 0.006, 0.24, 0.002), 'hazard', 0xffffff, { p: [0.06, 0.236, 0] });
  for (const s of [-1, 1]) {
    k.add(rbox(0.3, 0.12, 0.022, 0.008), 'metal', C.gun, { p: [-0.05, 0.12, s * 0.17] });
    for (const y of [0.08, 0.16]) for (let i = 0; i < 6; i++) k.add(cyl(0.007, 0.007, 0.008, 8), 'metal', C.steel, { p: [-0.17 + i * 0.045, y, s * 0.182], r: [PI / 2, 0, 0] });
  }
  // hatch with handle
  k.add(cyl(0.055, 0.058, 0.02, 24), 'metal', C.gun, { p: [-0.12, 0.244, -0.04] });
  k.add(torus(0.022, 0.004, 12, PI), 'metal', C.chrome, { p: [-0.12, 0.254, -0.04] });
  // ammo drum on the camera side + feed chute
  k.add(cyl(0.066, 0.066, 0.1, 24), 'metal', C.gun, { p: [-0.11, 0.12, 0.235], r: [PI / 2, 0, 0] });
  for (const z of [0.2, 0.235, 0.27]) k.add(torus(0.067, 0.006, 24), 'metal', C.steel, { p: [-0.11, 0.12, z] });
  k.add(cyl(0.03, 0.03, 0.012, 16), 'metal', C.gunD, { p: [-0.11, 0.12, 0.288], r: [PI / 2, 0, 0] });
  k.add(rbox(0.12, 0.03, 0.05, 0.008), 'metal', C.gunD, { p: [0.0, 0.17, 0.19] });
  // mantlet + twin barrels with cooling shrouds and muzzle brakes
  k.add(rbox(0.07, 0.11, 0.22, 0.02), 'metal', C.gunD, { p: [0.2, 0.13, 0] });
  for (const z of [-0.06, 0.06]) {
    k.add(rbox(0.08, 0.05, 0.05, 0.01), 'metal', C.steel, { p: [0.25, 0.13, z] });
    k.add(cyl(0.02, 0.02, 0.36, 16), 'metal', C.chrome, { p: [0.44, 0.13, z], r: [0, 0, -PI / 2] });
    k.add(cyl(0.031, 0.031, 0.14, 16), 'metal', C.gun, { p: [0.34, 0.13, z], r: [0, 0, -PI / 2] });
    for (let i = 0; i < 5; i++) k.add(torus(0.031, 0.004, 16), 'metal', C.bore, { p: [0.285 + i * 0.027, 0.13, z], r: [0, PI / 2, 0] });
    k.add(cyl(0.03, 0.03, 0.05, 16), 'metal', C.gunD, { p: [0.6, 0.13, z], r: [0, 0, -PI / 2] });
    k.add(rbox(0.012, 0.066, 0.022, 0.003), 'metal', C.bore, { p: [0.6, 0.13, z] });
    k.add(cyl(0.015, 0.015, 0.004, 12), 'metal', C.bore, { p: [0.626, 0.13, z], r: [0, 0, -PI / 2] });
  }
  // sensor, antenna, rear vent, lights
  k.add(rbox(0.07, 0.05, 0.07, 0.01), 'metal', C.gun, { p: [0.03, 0.258, 0.09] });
  k.glow(cyl(0.018, 0.018, 0.006, 16), C.cyan, { p: [0.068, 0.258, 0.09], r: [0, 0, -PI / 2] }, 8);
  k.rod([-0.19, 0.23, -0.11], [-0.21, 0.5, -0.13], 0.006, 'metal', C.steel, 0.004, 6);
  k.glow(sph(0.012, 10, 8), C.redGlow, { p: [-0.21, 0.505, -0.13] }, 8);
  k.add(rbox(0.03, 0.1, 0.22, 0.008), 'metal', C.gunD, { p: [-0.24, 0.12, 0] });
  for (let i = 0; i < 5; i++) k.add(rbox(0.036, 0.006, 0.2, 0.002), 'metal', C.steel, { p: [-0.245, 0.085 + i * 0.017, 0] });
  k.glow(rbox(0.04, 0.012, 0.004, 0.002), C.amber, { p: [-0.13, 0.18, 0.161] });
  return finalize(k, DECK);
}

// --- Breacher Missile Pod ------------------------------------------------------------------------------------------
function breacher(): Built {
  const k = kit();
  plinth(k);
  k.setTurret(true);
  turretRing(k);
  k.add(rbox(0.26, 0.1, 0.26, 0.03, 2), 'metal', C.gun, { p: [0, 0.1, 0] });
  for (const s of [-1, 1]) {
    k.add(rbox(0.14, 0.24, 0.045, 0.015, 2), 'metal', C.gun, { p: [0, 0.24, s * 0.2] });
    k.add(cyl(0.032, 0.032, 0.014, 6), 'metal', C.steel, { p: [0, 0.3, s * 0.232], r: [PI / 2, 0, 0] });
  }
  k.add(cyl(0.05, 0.05, 0.44, 24), 'metal', C.gunD, { p: [0, 0.3, 0], r: [PI / 2, 0, 0] });
  // radar mast behind the yoke
  k.rod([-0.12, 0.14, 0], [-0.15, 0.48, 0], 0.008, 'metal', C.steel, 0.006, 8);
  k.add(new THREE.SphereGeometry(0.05, 20, 8, 0, PI * 2, 0, PI / 2.5), 'metal', C.steel, { p: [-0.15, 0.47, 0], r: [0, 0, 1.2] });
  k.glow(sph(0.012, 10, 8), C.redGlow, { p: [-0.152, 0.5, 0] }, 8);
  // the pod, pitched up 0.6 rad about the trunnion
  const pod: G[] = [];
  const P = (g: G) => void pod.push(g);
  P(k.add(rbox(0.36, 0.26, 0.31, 0.035, 2), 'paint', C.team, { p: [0, 0.3, 0] }));
  P(k.add(rbox(0.03, 0.27, 0.32, 0.01), 'hazard', 0xffffff, { p: [-0.14, 0.3, 0] }));
  P(k.add(rbox(0.03, 0.24, 0.29, 0.01), 'metal', C.gun, { p: [0.18, 0.3, 0] }));
  for (const s of [-1, 1]) {
    P(k.add(rbox(0.24, 0.18, 0.012, 0.004), 'metal', C.steel, { p: [0.02, 0.3, s * 0.16] }));
    for (let i = 0; i < 5; i++) P(k.add(rbox(0.012, 0.16, 0.022, 0.003), 'metal', C.gunD, { p: [-0.08 + i * 0.05, 0.3, s * 0.17] }));
    P(k.glow(rbox(0.06, 0.01, 0.004, 0.002), C.amber, { p: [0.12, 0.41, s * 0.157] }));
  }
  for (const y of [-0.075, 0, 0.075]) for (const z of [-0.09, 0, 0.09]) {
    P(k.add(cyl(0.032, 0.032, 0.03, 16), 'metal', C.steel, { p: [0.2, 0.3 + y, z], r: [0, 0, -PI / 2] }));
    P(k.add(cyl(0.024, 0.024, 0.005, 16), 'metal', C.bore, { p: [0.216, 0.3 + y, z], r: [0, 0, -PI / 2] }));
    P(k.add(cyl(0.0, 0.019, 0.045, 16), 'paint', C.red, { p: [0.23, 0.3 + y, z], r: [0, 0, -PI / 2] }));
  }
  P(k.add(rbox(0.1, 0.04, 0.08, 0.01), 'metal', C.gun, { p: [-0.04, 0.45, 0.08] }));
  P(k.glow(rbox(0.006, 0.02, 0.05, 0.002), C.cyan, { p: [0.012, 0.45, 0.08] }, 6));
  P(k.add(rbox(0.02, 0.18, 0.22, 0.006), 'metal', C.gunD, { p: [-0.19, 0.3, 0] }));
  for (let i = 0; i < 6; i++) P(k.add(rbox(0.026, 0.006, 0.2, 0.002), 'metal', C.steel, { p: [-0.195, 0.235 + i * 0.026, 0] }));
  const m = new THREE.Matrix4().makeTranslation(0, 0.3, 0).multiply(new THREE.Matrix4().makeRotationZ(0.6)).multiply(new THREE.Matrix4().makeTranslation(0, -0.3, 0));
  for (const g of pod) g.applyMatrix4(m);
  // conduits from yoke into the pod belly
  for (const s of [-1, 1]) k.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.1, 0.12, s * 0.1), new THREE.Vector3(-0.16, 0.2, s * 0.11), new THREE.Vector3(-0.14, 0.28, s * 0.1)]), 10, 0.012, 6), 'metal', C.rubber);
  return finalize(k, DECK);
}

// --- Husk Crawler (organic) ----------------------------------------------------------------------------------------
function husk(): Built {
  const k = kit();
  const segs: [number, number][] = [[0.17, 0.11], [0.0, 0.135], [-0.16, 0.115], [-0.29, 0.085]];
  const cy = 0.16;
  segs.forEach(([x, r], si) => {
    const tilt = -x * 0.7;
    k.add(sph(r, 28, 20), 'chitin', C.chBody, { p: [x, cy, 0], s: [1.05, 0.78, 0.95] });
    k.add(new THREE.SphereGeometry(r * 1.07, 28, 12, 0, PI * 2, 0, PI * 0.42), 'chitin', C.chPlate, { p: [x, cy + r * 0.04, 0], r: [0, 0, tilt], s: [1.12, 0.82, 1.0] });
    k.add(torus(r * 0.86, r * 0.07, 28), 'chitin', C.chDark, { p: [x, cy + r * 0.42, 0], r: [PI / 2, tilt, 0], s: [1.12, 1, 1] });
    k.rod([x, cy + r * 0.8, 0], [x - 0.07, cy + r * 0.8 + 0.09 - si * 0.012, 0], 0.017, 'chitin', C.chBone, 0, 10);
    for (const s of [-1, 1]) {
      k.rod([x, cy + r * 0.35, s * r * 0.85], [x - 0.04, cy + r * 0.6, s * (r + 0.07)], 0.012, 'chitin', C.chBone, 0, 8);
      if (si === 3) continue;
      const hip: V3 = [x, 0.13, s * r * 0.75], knee: V3 = [x + 0.03, 0.23, s * (r + 0.11)], foot: V3 = [x + 0.06, 0.0, s * (r + 0.21)];
      k.add(sph(0.026, 12, 8), 'chitin', C.chDark, { p: hip });
      k.rod(hip, knee, 0.02, 'chitin', C.chDark, 0.015, 10);
      k.add(sph(0.017, 10, 8), 'chitin', C.chDark, { p: knee });
      k.rod(knee, foot, 0.015, 'chitin', C.chBone, 0.003, 10);
    }
  });
  // head, eyes, mandibles, raptorial claws
  k.add(sph(0.078, 24, 16), 'chitin', C.chDark, { p: [0.285, 0.15, 0], s: [1.1, 0.85, 1] });
  for (const s of [-1, 1]) {
    k.glow(sph(0.014, 10, 8), C.chGlow, { p: [0.345, 0.18, s * 0.03] }, 8);
    k.glow(sph(0.01, 10, 8), C.chGlow, { p: [0.33, 0.2, s * 0.055] }, 8);
    k.rod([0.33, 0.12, s * 0.04], [0.4, 0.1, s * 0.065], 0.018, 'chitin', C.chBone, 0.012, 10);
    k.rod([0.4, 0.1, s * 0.065], [0.445, 0.09, s * 0.02], 0.012, 'chitin', C.chBone, 0, 10);
    k.rod([0.21, 0.19, s * 0.09], [0.29, 0.28, s * 0.15], 0.022, 'chitin', C.chDark, 0.016, 10);
    k.add(sph(0.018, 10, 8), 'chitin', C.chDark, { p: [0.29, 0.28, s * 0.15] });
    k.rod([0.29, 0.28, s * 0.15], [0.39, 0.12, s * 0.12], 0.016, 'chitin', C.chBone, 0, 10);
  }
  // glowing bio-sac on the tail, cinched by dark chitin bands
  k.glow(sph(0.068, 24, 16), C.chGlow, { p: [-0.33, 0.235, 0] }, 5);
  for (const a of [0.5, -0.5]) k.add(torus(0.066, 0.009, 24), 'chitin', C.chDark, { p: [-0.33, 0.235, 0], r: [PI / 2 + a, 0, 0] });
  return finalize(k, 0);
}

// --- Rivet Walker (machine) ----------------------------------------------------------------------------------------
function rivet(): Built {
  const k = kit();
  k.add(rbox(0.3, 0.2, 0.28, 0.04, 2), 'paint', C.rust, { p: [0, 0.43, 0] });
  k.add(rbox(0.09, 0.17, 0.26, 0.025, 2), 'metal', C.rmGun, { p: [0.15, 0.42, 0], r: [0, 0, -0.35] });
  for (const s of [-1, 1]) {
    k.add(rbox(0.24, 0.15, 0.03, 0.012), 'metal', C.rmGun, { p: [-0.01, 0.42, s * 0.15] });
    for (const y of [0.365, 0.475]) for (let i = 0; i < 6; i++) k.add(cyl(0.008, 0.008, 0.008, 8), 'metal', C.steel, { p: [-0.11 + i * 0.04, y, s * 0.167], r: [PI / 2, 0, 0] });
  }
  k.add(rbox(0.2, 0.016, 0.1, 0.006), 'hazard', 0xffffff, { p: [-0.03, 0.538, 0] });
  // optic with hood
  k.add(cyl(0.055, 0.062, 0.07, 24), 'metal', C.rmSteel, { p: [0.2, 0.45, 0], r: [0, 0, -PI / 2] });
  k.glow(cyl(0.04, 0.04, 0.01, 24), C.redGlow, { p: [0.236, 0.45, 0], r: [0, 0, -PI / 2] }, 8);
  k.add(rbox(0.09, 0.02, 0.13, 0.006), 'metal', C.rmGun, { p: [0.21, 0.508, 0] });
  // exhaust stacks, antenna, chin gun
  for (const z of [-0.07, 0.07]) {
    k.add(cyl(0.022, 0.026, 0.12, 16), 'metal', C.rmSteel, { p: [-0.11, 0.58, z] });
    k.add(cyl(0.029, 0.029, 0.016, 16), 'metal', C.steel, { p: [-0.11, 0.645, z] });
    k.add(cyl(0.018, 0.018, 0.004, 12), 'metal', C.bore, { p: [-0.11, 0.654, z] });
  }
  k.rod([-0.06, 0.53, -0.1], [-0.08, 0.76, -0.12], 0.005, 'metal', C.steel, 0.003, 6);
  k.glow(sph(0.011, 10, 8), C.redGlow, { p: [-0.08, 0.765, -0.12] }, 8);
  k.add(rbox(0.08, 0.05, 0.06, 0.01), 'metal', C.rmSteel, { p: [0.14, 0.34, 0.08] });
  k.add(cyl(0.013, 0.013, 0.14, 12), 'metal', C.chrome, { p: [0.24, 0.34, 0.08], r: [0, 0, -PI / 2] });
  // hips + digitigrade piston legs
  k.add(rbox(0.16, 0.08, 0.3, 0.02), 'metal', C.rmSteel, { p: [-0.02, 0.31, 0] });
  for (const s of [-1, 1]) {
    const z = s * 0.17;
    const hip: V3 = [-0.02, 0.31, z], knee: V3 = [0.07, 0.17, z], ankle: V3 = [-0.02, 0.05, z];
    k.add(cyl(0.05, 0.05, 0.05, 20), 'metal', C.rmSteel, { p: hip, r: [PI / 2, 0, 0] });
    k.strut(hip, knee, 0.055, 0.05, 'metal', C.rmGun);
    k.add(cyl(0.034, 0.034, 0.064, 20), 'metal', C.steel, { p: knee, r: [PI / 2, 0, 0] });
    k.strut(knee, ankle, 0.045, 0.045, 'paint', C.rust);
    k.rod([0.0, 0.29, s * 0.205], [0.045, 0.2, s * 0.205], 0.014, 'metal', C.rmSteel, 0.014, 12);
    k.rod([0.045, 0.2, s * 0.205], [0.07, 0.14, s * 0.205], 0.008, 'metal', C.chrome, 0.008, 12);
    k.add(cyl(0.024, 0.024, 0.056, 16), 'metal', C.rmSteel, { p: ankle, r: [PI / 2, 0, 0] });
    k.add(rbox(0.15, 0.035, 0.085, 0.012), 'metal', C.rmGun, { p: [0.0, 0.0175, z] });
    for (const dz of [-0.025, 0.025]) k.add(rbox(0.045, 0.025, 0.03, 0.008), 'metal', C.rmSteel, { p: [0.09, 0.0125, z + dz] });
    k.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.1, 0.36, s * 0.12), new THREE.Vector3(-0.08, 0.25, s * 0.2), new THREE.Vector3(0.04, 0.18, s * 0.2)]), 10, 0.008, 6), 'metal', C.rubber);
  }
  return finalize(k, 0);
}

export const BUILD: Record<Kind, () => Built> = { picket, breacher, husk, rivet };

export function makeMaterials(): Record<MatId, THREE.Material> {
  const std = (t: ReturnType<typeof hardSurface>, metalness = 1): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ map: t.map, roughnessMap: t.orm, metalnessMap: t.orm, normalMap: t.normal, roughness: 1, metalness, vertexColors: true });
  const ch = chitin(7);
  return {
    metal: std(hardSurface('metal', 3), 0.5),
    paint: std(hardSurface('paint', 5)),
    hazard: std(hardSurface('hazard', 9)),
    chitin: new THREE.MeshPhysicalMaterial({
      map: ch.map, normalMap: ch.normal, roughnessMap: ch.orm, roughness: 1, metalness: 0,
      clearcoat: 0.7, clearcoatRoughness: 0.15, vertexColors: true, envMapIntensity: 0.6,
    }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
}
