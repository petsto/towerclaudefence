// Thumper Mortar: fat breech-loaded mortar tube(s) pitched steeply up on a trunnion cradle with recoil cylinders,
// shell rack with glowing fuses behind. L1 one tube; L2 twin tubes, outrigger jacks, team armour; L3 triple battery,
// autoloader hopper, heat-vented jackets, rangefinder mast.
import * as THREE from 'three';
import { C, DECK, PI, cyl, finalize, kit, plinth, rbox, sph, tube, turretRing, type Built, type Kit, type Level } from '../kit';

const TILT = 0.72; // tube tilt from vertical toward +X (~49 deg elevation)
const TY = 0.2; // trunnion height above the pivot
const TX = -0.03;

function pips(k: Kit, level: Level): void {
  for (let i = 0; i < level; i++) k.glow(rbox(0.05, 0.026, 0.008, 0.003), C.pip, { p: [(i - (level - 1) / 2) * 0.07, 0.025, 0.443] }, 4);
}

/** Mortar tube built upright at the trunnion origin (axis +Y), then tilted onto the cradle. */
function mortar(k: Kit, z: number, r: number, len: number, level: Level): void {
  const n0 = k.raw.length;
  const top = len * 0.72, bot = -len * 0.28;
  k.add(cyl(r, r * 1.08, top - bot, 28), 'paint', C.deck, { p: [0, (top + bot) / 2, 0] });
  // breech: heavy bulb and cap at the bottom
  k.add(cyl(r * 1.25, r * 1.25, 0.06, 28), 'metal', C.gunD, { p: [0, bot + 0.02, 0] });
  k.add(sph(r * 1.15, 24, 12), 'metal', C.gunD, { p: [0, bot - 0.01, 0], s: [1, 0.4, 1] });
  // reinforcing bands, hazard band near the muzzle, muzzle collar, bore
  for (const y of [bot + 0.07, 0.04, top * 0.45]) k.add(cyl(r * 1.13, r * 1.13, 0.018, 28), 'metal', C.gunD, { p: [0, y, 0] });
  k.add(cyl(r * 1.1, r * 1.1, 0.03, 28), 'hazard', 0xffffff, { p: [0, top - 0.06, 0] });
  k.add(cyl(r * 1.3, r * 1.12, 0.04, 28), 'metal', C.steel, { p: [0, top - 0.01, 0] });
  k.add(cyl(r * 0.92, r * 0.92, 0.004, 24), 'metal', C.bore, { p: [0, top + 0.009, 0] });
  // trunnion collar (axis along Z)
  k.add(cyl(r * 0.55, r * 0.55, r * 2.5, 16), 'metal', C.steel, { p: [0, 0, 0], r: [PI / 2, 0, 0] });
  // recoil cylinders under the tube (on the -X / belly side) with chrome rods
  for (const dz of [-r * 0.6, r * 0.6]) {
    k.add(cyl(0.017, 0.017, 0.16, 12), 'metal', C.gunD, { p: [-r - 0.018, -0.02, dz] });
    k.add(cyl(0.009, 0.009, 0.12, 10), 'metal', C.chrome, { p: [-r - 0.018, 0.11, dz] });
    k.add(cyl(0.016, 0.016, 0.02, 10), 'metal', C.steel, { p: [-r - 0.018, 0.17, dz] });
  }
  if (level === 3) {
    // heat-vented cooling jacket with amber slits
    k.add(cyl(r * 1.18, r * 1.18, 0.09, 28), 'metal', C.gun, { p: [0, top * 0.55, 0] });
    for (let i = 0; i < 3; i++) k.glow(rbox(0.012, 0.018, 0.014, 0.002), C.amber, { p: [r * 1.19, top * 0.55 - 0.026 + i * 0.026, 0] }, 6);
  }
  const m = new THREE.Matrix4().makeTranslation(TX, TY, z).multiply(new THREE.Matrix4().makeRotationZ(-TILT));
  for (const p of k.raw.slice(n0)) p.geo.applyMatrix4(m);
}

/** Standing shell with a glowing fuse ring. */
function shell(k: Kit, x: number, y: number, z: number): void {
  k.add(cyl(0.022, 0.022, 0.07, 14), 'paint', 0x6a6a3a, { p: [x, y + 0.035, z] });
  k.add(cyl(0.0, 0.022, 0.035, 14), 'metal', C.steel, { p: [x, y + 0.087, z] });
  k.glow(cyl(0.0235, 0.0235, 0.008, 14), C.amber, { p: [x, y + 0.068, z] }, 5);
}

export function thumper(level: Level): Built {
  const k = kit();
  plinth(k);
  pips(k, level);
  if (level >= 2) {
    // outrigger stabiliser jacks on the diagonals: arm, hydraulic ram, foot pad
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const a = Math.atan2(sz, sx);
      k.add(rbox(0.16, 0.05, 0.07, 0.012), 'paint', C.team, { p: [sx * 0.36, 0.13, sz * 0.36], r: [0, -a, 0] });
      k.add(rbox(0.09, 0.012, 0.09, 0.004), sz > 0 ? 'hazard' : 'metal', sz > 0 ? 0xffffff : C.gunD, { p: [sx * 0.41, 0.161, sz * 0.41], r: [0, -a, 0] });
      k.add(cyl(0.022, 0.022, 0.08, 12), 'metal', C.gunD, { p: [sx * 0.41, 0.1, sz * 0.41] });
      k.add(cyl(0.012, 0.012, 0.06, 10), 'metal', C.chrome, { p: [sx * 0.41, 0.04, sz * 0.41] });
      k.add(cyl(0.045, 0.05, 0.016, 16), 'metal', C.gun, { p: [sx * 0.41, 0.008, sz * 0.41] });
    }
    for (const s of [-1, 1]) k.glow(rbox(0.008, 0.012, 0.5, 0.003), C.amber, { p: [s * 0.443, 0.03, 0] }, 6);
  }
  k.setTurret(true);
  turretRing(k);
  const zs = level === 1 ? [0] : level === 2 ? [-0.1, 0.1] : [-0.16, 0, 0.16];
  const r = level === 1 ? 0.095 : level === 2 ? 0.078 : 0.068;
  const len = level === 1 ? 0.46 : level === 2 ? 0.46 : 0.48;
  const half = (zs[zs.length - 1] ?? 0) + r * 1.4 + 0.02; // cradle half-width to the cheek plates
  // painted turntable over the ring, carriage deck and trunnion cheeks
  k.add(cyl(0.235, 0.25, 0.035, 32), 'paint', C.deck, { p: [0, 0.065, 0] });
  k.add(cyl(0.24, 0.24, 0.008, 32), 'metal', C.gunD, { p: [0, 0.084, 0] });
  k.add(rbox(0.36, 0.07, half * 2 + 0.04, 0.025, 2), 'metal', C.gun, { p: [-0.02, 0.085, 0] });
  k.add(rbox(0.3, 0.012, half * 2, 0.004), 'paint', level === 1 ? C.deck : C.team, { p: [-0.03, 0.125, 0] });
  for (const s of [-1, 1]) {
    const cz = s * (half + 0.012);
    k.add(rbox(0.2, 0.17, 0.03, 0.012, 2), 'paint', C.team, { p: [TX - 0.01, 0.165, cz] });
    k.add(rbox(0.21, 0.025, 0.034, 0.006), 'hazard', 0xffffff, { p: [TX - 0.01, 0.1, cz] });
    k.add(cyl(0.04, 0.04, 0.04, 6), 'metal', C.steel, { p: [TX, TY, cz + s * 0.012], r: [PI / 2, 0, 0] });
    k.add(cyl(0.016, 0.016, 0.046, 6), 'metal', C.chrome, { p: [TX, TY, cz + s * 0.015], r: [PI / 2, 0, 0] });
    for (const [x, y] of [[-0.1, 0.23], [0.04, 0.23], [-0.1, 0.12], [0.04, 0.12]] as const)
      k.add(cyl(0.007, 0.007, 0.008, 8), 'metal', C.steel, { p: [x, y, cz + s * 0.016], r: [PI / 2, 0, 0] });
    k.glow(rbox(0.035, 0.012, 0.004, 0.002), C.amber, { p: [0.02, 0.2, cz + s * 0.016] });
  }
  // trunnion axle through all tubes
  k.add(cyl(0.022, 0.022, half * 2, 16), 'metal', C.gunD, { p: [TX, TY, 0], r: [PI / 2, 0, 0] });
  for (const z of zs) mortar(k, z, r, len, level);
  // shell rack behind the cradle
  const rows = level === 1 ? 1 : 2, cols = level === 3 ? 4 : 3;
  const rackW = cols * 0.055;
  k.add(rbox(0.06 * rows + 0.03, 0.05, rackW + 0.02, 0.01), 'metal', C.gunD, { p: [-0.24 + (rows - 1) * 0.03, 0.08, 0] });
  k.add(rbox(0.06 * rows + 0.035, 0.014, rackW + 0.025, 0.004), 'hazard', 0xffffff, { p: [-0.24 + (rows - 1) * 0.03, 0.11, 0] });
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) shell(k, -0.24 + i * 0.06, 0.105, (j - (cols - 1) / 2) * 0.055);
  // fire-control box with cyan sight
  k.add(rbox(0.08, 0.06, 0.06, 0.01), 'metal', C.gun, { p: [0.12, 0.15, half - 0.05] });
  k.glow(cyl(0.016, 0.016, 0.006, 16), C.cyan, { p: [0.162, 0.155, half - 0.05], r: [0, 0, -PI / 2] });
  k.add(tube([[0.08, 0.13, half - 0.04], [0.02, 0.1, half - 0.02], [-0.06, 0.12, half - 0.02]], 0.008, 8), 'metal', C.rubber);
  if (level >= 2) {
    // ammo hoist chain from rack to breech
    for (const z of zs) k.add(tube([[-0.2, 0.13, z * 0.6], [-0.17, 0.2, z * 0.8], [-0.1, 0.18, z]], 0.01, 8), 'metal', C.rubber);
  }
  if (level === 3) {
    // autoloader hopper over the rack, rangefinder mast with red beacon
    k.add(rbox(0.13, 0.09, rackW + 0.04, 0.02, 2), 'paint', C.team, { p: [-0.25, 0.25, 0] });
    k.add(rbox(0.135, 0.02, rackW + 0.045, 0.005), 'metal', C.gunD, { p: [-0.25, 0.3, 0] });
    for (let j = 0; j < 4; j++) k.glow(rbox(0.004, 0.016, 0.03, 0.002), C.amber, { p: [-0.184, 0.25, (j - 1.5) * 0.055] }, 5);
    k.rod([-0.22, 0.3, -0.12], [-0.24, 0.52, -0.14], 0.007, 'metal', C.steel, 0.005, 6);
    k.add(rbox(0.05, 0.025, 0.09, 0.008), 'metal', C.gunD, { p: [-0.24, 0.52, -0.14] });
    for (const dz of [-0.035, 0.035]) k.glow(cyl(0.01, 0.01, 0.004, 12), C.cyan, { p: [-0.213, 0.52, -0.14 + dz], r: [0, 0, -PI / 2] }, 6);
    k.glow(sph(0.012, 10, 8), C.redGlow, { p: [-0.24, 0.545, -0.14] });
  }
  return finalize(k, DECK);
}
