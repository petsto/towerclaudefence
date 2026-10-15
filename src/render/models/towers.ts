// Procedural tower models. Static base + a 'turret' pivot; each split into a lit hull mesh and an unlit glow mesh.
import * as THREE from 'three';
import type { TowerId } from '../../data/types';
import { box, cyl, merge, octa, rod, torus, type G } from './parts';

const C = {
  gun: 0x2e3540, gunD: 0x1c2128, steel: 0x4a6f9a, steelD: 0x38577a, steelL: 0x6f93bd,
  metal: 0x9aa6b4, black: 0x0c0e12, haz: 0xa87a28, frost: 0xa8c8dc,
  amber: 0xffb030, teal: 0x38e0d0, plasma: 0xd0ecff,
} as const;
const PI = Math.PI;

const hullMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });

type Lv = 1 | 2 | 3;
interface Kit { base: G[]; baseGlow: G[]; tur: G[]; turGlow: G[]; pivot: number }

function squareBase(k: Kit, w: number, h: number): void {
  const o = w / 2 - 0.05;
  k.base.push(box(w, h, w, C.gun, { p: [0, h / 2, 0] }), box(w - 0.12, 0.04, w - 0.12, C.steel, { p: [0, h + 0.02, 0] }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.base.push(box(0.05, 0.03, 0.05, C.gunD, { p: [sx * o, h + 0.015, sz * o] }));
  for (const x of [-0.2, -0.08, 0.04]) k.base.push(box(0.08, 0.03, 0.01, C.black, { p: [x, h * 0.5, w / 2 + 0.005] }));
  k.baseGlow.push(box(0.07, 0.04, 0.012, C.amber, { p: [w / 2 - 0.11, h * 0.5, w / 2 + 0.006] }));
}

/** n-gon plinth with a flat face toward +Z (the camera). */
function polyBase(k: Kit, r: number, h: number, seg: number): void {
  const ry = PI / seg;
  k.base.push(cyl(r, r * 1.04, h, seg, C.gun, { p: [0, h / 2, 0], r: [0, ry, 0] }));
  k.base.push(cyl(r * 0.8, r * 0.84, 0.04, seg, C.steel, { p: [0, h + 0.02, 0], r: [0, ry, 0] }));
  const apo = r * Math.cos(ry);
  k.base.push(box(0.16, 0.03, 0.01, C.black, { p: [-0.08, h * 0.5, apo + 0.005] }));
  k.baseGlow.push(box(0.06, 0.04, 0.012, C.amber, { p: [0.1, h * 0.5, apo + 0.006] }));
}

function antenna(arr: G[], glow: G[], x: number, y: number, z: number, h: number): void {
  arr.push(rod([x, y, z], [x, y + h, z], 0.01, C.gunD));
  glow.push(box(0.03, 0.03, 0.03, C.amber, { p: [x, y + h, z] }));
}

// --- Picket Autocannon: squat bunker, boxy turret, twin (L3: quad) barrels.
function picket(k: Kit, lv: Lv): void {
  squareBase(k, 0.8, 0.18);
  if (lv >= 2) for (const z of [-0.42, 0.42]) k.base.push(box(0.62, 0.12, 0.04, C.steelL, { p: [0, 0.1, z] }));
  if (lv === 3) for (const x of [-0.42, 0.42]) k.base.push(box(0.04, 0.12, 0.62, C.steelL, { p: [x, 0.1, 0] }));
  k.pivot = 0.22;
  const t = k.tur;
  t.push(cyl(0.22, 0.24, 0.06, 8, C.gun, { p: [0, 0.03, 0] }));
  t.push(box(0.34, 0.17, 0.32, C.steel, { p: [-0.05, 0.145, 0] }));
  t.push(box(0.24, 0.03, 0.26, C.steelL, { p: [-0.08, 0.245, 0] }));
  t.push(box(0.06, 0.14, 0.26, C.gun, { p: [0.14, 0.14, 0] }));
  k.turGlow.push(box(0.04, 0.02, 0.16, C.amber, { p: [0.08, 0.235, 0] }));
  const ys = lv === 3 ? [0.105, 0.175] : [0.14];
  const len = lv === 1 ? 0.28 : 0.32;
  for (const y of ys) for (const z of [-0.075, 0.075]) {
    t.push(cyl(0.038, 0.038, len, 6, C.metal, { p: [0.17 + len / 2, y, z], r: [0, 0, -PI / 2] }));
    t.push(cyl(0.042, 0.042, 0.06, 6, lv === 1 ? C.metal : C.gunD, { p: [0.15 + len, y, z], r: [0, 0, -PI / 2] }));
  }
  if (lv >= 2) {
    for (const z of [-0.175, 0.175]) t.push(box(0.3, 0.15, 0.03, C.steelL, { p: [-0.06, 0.15, z] }));
    t.push(cyl(0.075, 0.075, 0.08, 8, C.gunD, { p: [-0.14, 0.13, -0.23], r: [PI / 2, 0, 0] }));
  }
  if (lv === 3) t.push(cyl(0.075, 0.075, 0.08, 8, C.gunD, { p: [-0.14, 0.13, 0.23], r: [PI / 2, 0, 0] }));
  antenna(t, k.turGlow, -0.18, 0.26, 0.1, lv === 1 ? 0.18 : 0.26);
  if (lv === 3) antenna(t, k.turGlow, -0.18, 0.26, -0.1, 0.18);
}

// --- Thumper Mortar: round emplacement, fat stubby tubes pitched steeply up (1/2/3 tubes).
function thumper(k: Kit, lv: Lv): void {
  polyBase(k, 0.46, 0.16, 8);
  if (lv >= 2) for (let i = 0; i < 4; i++) {
    const a = PI / 4 + (i * PI) / 2;
    k.base.push(box(0.16, 0.08, 0.1, C.steelD, { p: [Math.cos(a) * 0.36, 0.2, Math.sin(a) * 0.36], r: [0, -a, 0] }));
  }
  k.pivot = 0.2;
  const t = k.tur;
  t.push(cyl(0.27, 0.29, 0.07, 8, C.steel, { p: [0, 0.035, 0] }));
  const zs = lv === 1 ? [0] : lv === 2 ? [-0.1, 0.1] : [-0.15, 0, 0.15];
  const r = lv === 1 ? 0.12 : lv === 2 ? 0.095 : 0.08;
  const tilt = 0.6;
  const dx = Math.sin(tilt), dy = Math.cos(tilt);
  for (const z of zs) {
    const at = (s: number): [number, number, number] => [0.02 + dx * s, 0.2 + dy * s, z];
    t.push(cyl(r, r * 1.1, 0.42, 8, C.gun, { p: at(0.06), r: [0, 0, -tilt] }));
    t.push(cyl(r + 0.02, r + 0.02, 0.06, 8, C.steelL, { p: at(0.0), r: [0, 0, -tilt] }));
    t.push(cyl(r * 0.8, r * 0.8, 0.01, 8, C.black, { p: at(0.272), r: [0, 0, -tilt] }));
    if (lv === 3) t.push(rod(at(-0.1), at(0.15), 0.012, C.metal));
  }
  const cz = (zs[zs.length - 1] ?? 0) + r + 0.04;
  for (const z of [-cz, cz]) {
    t.push(box(0.26, 0.2, 0.04, C.steel, { p: [-0.02, 0.17, z] }));
    k.turGlow.push(box(0.04, 0.04, 0.012, C.amber, { p: [0.05, 0.2, z + Math.sign(z) * 0.022] }));
  }
  if (lv === 3) t.push(box(0.1, 0.12, cz * 2, C.steelD, { p: [-0.18, 0.12, 0] }));
}

// --- Stasis Projector: cryo tanks on the base, column, glowing teal crystal held by three claws.
function stasis(k: Kit, lv: Lv): void {
  squareBase(k, 0.78, 0.14);
  for (const z of [-0.25, 0.25]) {
    k.base.push(cyl(0.08, 0.08, 0.5, 8, C.frost, { p: [0, 0.22, z], r: [0, 0, PI / 2] }));
    for (const x of [-0.17, 0.17]) k.base.push(cyl(0.088, 0.088, 0.03, 8, C.steelD, { p: [x, 0.22, z], r: [0, 0, PI / 2] }));
    if (lv >= 2) k.baseGlow.push(box(0.2, 0.012, 0.03, C.teal, { p: [0, 0.3, z] }));
  }
  k.base.push(cyl(0.1, 0.13, 0.32, 6, C.steelD, { p: [0, 0.3, 0] }));
  for (const y of lv === 1 ? [0.3] : [0.25, 0.37]) k.baseGlow.push(cyl(0.13, 0.13, 0.025, 6, C.teal, { p: [0, y, 0] }));
  k.pivot = 0.46;
  const t = k.tur, tg = k.turGlow;
  t.push(cyl(0.15, 0.12, 0.06, 6, C.steel, { p: [0, 0.03, 0] }));
  const cs = lv === 3 ? 1.8 : 1.5;
  tg.push(octa(lv === 1 ? 0.1 : 0.115, C.teal, { p: [0, 0.2, 0], s: [1, cs, 1] }));
  const reach = lv === 1 ? 0.33 : 0.37;
  for (let i = 0; i < 3; i++) {
    const a = PI / 3 + (i * 2 * PI) / 3;
    const ca = Math.cos(a), sa = Math.sin(a);
    t.push(rod([ca * 0.1, 0.05, sa * 0.1], [ca * 0.19, 0.19, sa * 0.19], 0.028, C.steelL));
    t.push(rod([ca * 0.19, 0.19, sa * 0.19], [ca * 0.09, reach, sa * 0.09], 0.024, C.steelL, 4, 0.012));
  }
  const nozzles = lv === 3 ? [-0.55, 0, 0.55] : [0];
  for (const a of nozzles) {
    const ca = Math.cos(a), sa = Math.sin(a);
    t.push(rod([ca * 0.1, 0.1, sa * 0.1], [ca * 0.24, 0.1, sa * 0.24], 0.06, C.gun, 6, 0.03));
    tg.push(box(0.03, 0.04, 0.04, C.teal, { p: [ca * 0.25, 0.1, sa * 0.25], r: [0, -a, 0] }));
  }
  if (lv >= 2) tg.push(torus(0.17, 0.016, C.teal, { p: [0, 0.2, 0], r: [PI / 2, 0, 0] }));
  if (lv === 3) tg.push(torus(0.2, 0.014, C.teal, { p: [0, 0.24, 0], r: [PI / 2 - 0.4, 0, 0] }));
}

// --- Longshot Railgun: tall four-legged gantry with a long twin-rail gun on top.
function longshot(k: Kit, lv: Lv): void {
  const b = k.base, H = 0.62;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.push(rod([sx * 0.34, 0, sz * 0.34], [sx * 0.17, H, sz * 0.17], 0.035, C.gun));
    b.push(box(0.13, 0.04, 0.13, C.gunD, { p: [sx * 0.33, 0.02, sz * 0.33] }));
  }
  const hw = 0.34 - 0.17 * (0.3 / H);
  for (const s of [-1, 1]) {
    b.push(box(hw * 2, 0.03, 0.03, C.steelD, { p: [0, 0.3, s * hw] }), box(0.03, 0.03, hw * 2, C.steelD, { p: [s * hw, 0.3, 0] }));
    b.push(rod([-0.32, 0.04, s * 0.32], [0.18, 0.58, s * 0.18], 0.014, C.steelD), rod([s * 0.32, 0.04, 0.32], [s * 0.18, 0.58, -0.18], 0.014, C.steelD));
  }
  if (lv === 3) for (const s of [-1, 1]) b.push(box(0.3, 0.2, 0.025, C.steelL, { p: [0, 0.15, s * 0.31] }));
  b.push(box(0.46, 0.06, 0.46, C.steel, { p: [0, H + 0.03, 0] }));
  k.baseGlow.push(box(0.06, 0.03, 0.012, C.amber, { p: [0.12, H + 0.03, 0.236] }));
  if (lv === 3) antenna(b, k.baseGlow, -0.19, H + 0.06, 0.19, 0.3);
  k.pivot = H + 0.06;
  const t = k.tur, L = lv === 1 ? 0.48 : 0.54;
  t.push(cyl(0.14, 0.16, 0.05, 8, C.gun, { p: [0, 0.025, 0] }));
  t.push(box(0.28, 0.12, 0.2, C.steel, { p: [-0.08, 0.11, 0] }));
  t.push(box(0.12, 0.11, 0.16, C.gunD, { p: [-0.26, 0.1, 0] }));
  t.push(box(L * 0.9, 0.03, 0.06, C.gun, { p: [-0.04 + L * 0.45, 0.085, 0] }));
  for (const z of [-0.045, 0.045]) t.push(box(L, 0.04, 0.03, C.metal, { p: [-0.04 + L / 2, 0.12, z] }));
  k.turGlow.push(box(L * 0.8, 0.012, 0.04, C.amber, { p: [-0.04 + L * 0.45, 0.11, 0] }));
  if (lv >= 2) {
    t.push(cyl(0.025, 0.025, 0.14, 6, C.gunD, { p: [-0.08, 0.2, -0.06], r: [0, 0, PI / 2] }));
    for (const x of lv === 3 ? [0.12, 0.24, 0.36] : [0.18, 0.34]) {
      if (lv === 3) k.turGlow.push(box(0.035, 0.085, 0.14, C.amber, { p: [x, 0.115, 0] }));
      else t.push(box(0.035, 0.085, 0.14, C.steelL, { p: [x, 0.115, 0] }));
    }
  }
  if (lv === 3) for (const z of [-0.12, 0.12]) t.push(box(0.2, 0.08, 0.02, C.steelL, { p: [-0.1, 0.12, z] }));
}

// --- Breacher Missile Pod: launcher pods pitched up so the amber warhead grid faces the sky (and the camera).
function breacher(k: Kit, lv: Lv): void {
  squareBase(k, 0.8, 0.2);
  for (const x of [-0.25, -0.15, -0.05, 0.05, 0.15, 0.25]) k.base.push(box(0.04, 0.012, 0.06, C.haz, { p: [x, 0.226, 0.3], r: [0, 0.6, 0] }));
  k.pivot = 0.24;
  const t = k.tur;
  t.push(cyl(0.2, 0.22, 0.06, 8, C.gun, { p: [0, 0.03, 0] }));
  t.push(box(0.2, 0.18, 0.16, C.steelD, { p: [-0.06, 0.14, 0] }));
  const pods = lv === 1 ? [{ z: 0, w: 0.3 }] : [{ z: -0.15, w: 0.17 }, { z: 0.15, w: 0.17 }];
  const ph = lv === 3 ? 0.3 : 0.24, py = 0.22;
  const rows = lv === 3 ? [-0.09, 0, 0.09] : [-0.055, 0.055];
  const pod: G[] = [], podGlow: G[] = [];
  for (const { z, w } of pods) {
    pod.push(box(0.3, ph, w, C.steel, { p: [0, py, z] }));
    pod.push(box(0.012, ph - 0.04, w - 0.04, C.black, { p: [0.151, py, z] }));
    pod.push(box(0.2, 0.012, w + 0.01, C.steelL, { p: [-0.03, py + ph / 2 + 0.006, z] }));
    const cols = w > 0.2 ? [-0.07, 0, 0.07] : lv === 3 ? [-0.04, 0.04] : [-0.04, 0.04];
    for (const y of rows) for (const dz of cols) {
      podGlow.push(cyl(0.01, 0.034, 0.07, 6, C.amber, { p: [0.18, py + y, z + dz], r: [0, 0, -PI / 2] }));
    }
  }
  // pitch the pods up 35° around the trunnion
  const m = new THREE.Matrix4().makeTranslation(0, py, 0).multiply(new THREE.Matrix4().makeRotationZ(0.6)).multiply(new THREE.Matrix4().makeTranslation(0, -py, 0));
  for (const g of pod) t.push(g.applyMatrix4(m));
  for (const g of podGlow) k.turGlow.push(g.applyMatrix4(m));
  if (lv >= 2) for (const z of [-0.26, 0.26]) t.push(box(0.16, 0.12, 0.03, C.steelL, { p: [-0.12, 0.13, z] }));
  if (lv === 3) {
    t.push(rod([-0.2, 0.2, 0], [-0.2, 0.44, 0], 0.015, C.gunD));
    t.push(cyl(0.1, 0.02, 0.05, 8, C.steelL, { p: [-0.2, 0.46, 0], r: [0, 0, 0.5] }));
    k.turGlow.push(box(0.03, 0.03, 0.03, C.amber, { p: [-0.2, 0.5, 0] }));
  }
}

// --- Arc Coil: hex plinth with capacitor canisters, ribbed tapering coil, glowing plasma orb + arc prongs.
function arcCoil(k: Kit, lv: Lv): void {
  const b = k.base;
  b.push(cyl(0.44, 0.46, 0.14, 6, C.gun, { p: [0, 0.07, 0], r: [0, PI / 6, 0] }));
  b.push(cyl(0.34, 0.37, 0.04, 6, C.steel, { p: [0, 0.16, 0], r: [0, PI / 6, 0] }));
  for (let i = 0; i < 3; i++) {
    const a = PI / 2 + (i * 2 * PI) / 3;
    const x = Math.cos(a) * 0.28, z = Math.sin(a) * 0.28;
    b.push(cyl(0.065, 0.065, 0.22, 8, C.steelD, { p: [x, 0.29, z] }));
    k.baseGlow.push(cyl(0.045, 0.045, 0.02, 8, C.amber, { p: [x, 0.41, z] }));
    if (lv >= 2) k.baseGlow.push(cyl(0.07, 0.07, 0.02, 8, C.plasma, { p: [x, 0.3, z] }));
  }
  const H = 0.35 + 0.1 * (lv - 1), n = 2 + lv;
  b.push(cyl(0.06, 0.09, H, 6, C.steelD, { p: [0, 0.18 + H / 2, 0] }));
  for (let i = 0; i < n; i++) {
    const r = 0.24 - (i * 0.12) / (n - 1);
    b.push(cyl(r, r, 0.035, 8, i % 2 ? C.gun : C.metal, { p: [0, 0.24 + (i * (H - 0.1)) / (n - 1), 0] }));
  }
  k.pivot = 0.18 + H;
  const t = k.tur, tg = k.turGlow;
  t.push(cyl(0.08, 0.1, 0.05, 6, C.gun, { p: [0, 0.025, 0] }));
  tg.push(octa(0.1 + 0.015 * (lv - 1), C.plasma, { p: [0, 0.15, 0], s: [1, 1.2, 1] }));
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * PI) / 3;
    const ca = Math.cos(a), sa = Math.sin(a);
    t.push(rod([ca * 0.06, 0.04, sa * 0.06], [ca * 0.17, 0.2, sa * 0.17], 0.016, C.metal));
    if (lv >= 2) tg.push(box(0.035, 0.035, 0.035, C.plasma, { p: [ca * 0.17, 0.2, sa * 0.17] }));
  }
  if (lv === 3) tg.push(torus(0.2, 0.012, C.plasma, { p: [0, 0.15, 0], r: [PI / 2, 0, 0] }));
}

const BUILD: Record<TowerId, (k: Kit, lv: Lv) => void> = {
  picket, thumper, stasis, longshot, breacher, arc_coil: arcCoil,
};

interface Built { base: G; baseGlow: G | null; tur: G; turGlow: G | null; pivot: number }
const cache = new Map<string, Built>();
const opt = (parts: G[]) => (parts.length ? merge(parts) : null);

export function towerGeometries(defId: TowerId, level: Lv): Built {
  const key = `${defId}:${level}`;
  let b = cache.get(key);
  if (!b) {
    const k: Kit = { base: [], baseGlow: [], tur: [], turGlow: [], pivot: 0 };
    BUILD[defId](k, level);
    b = { base: merge(k.base), baseGlow: opt(k.baseGlow), tur: merge(k.tur), turGlow: opt(k.turGlow), pivot: k.pivot };
    cache.set(key, b);
  }
  return b;
}

function mesh(geo: G | null, glow: boolean, parent: THREE.Object3D): void {
  if (!geo) return;
  const m = new THREE.Mesh(geo, glow ? glowMat : hullMat);
  m.castShadow = !glow;
  parent.add(m);
}

export function createTowerModel(defId: TowerId, level: Lv): THREE.Group {
  const b = towerGeometries(defId, level);
  const g = new THREE.Group();
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.y = b.pivot;
  mesh(b.base, false, g);
  mesh(b.baseGlow, true, g);
  mesh(b.tur, false, turret);
  mesh(b.turGlow, true, turret);
  g.add(turret);
  return g;
}
