// Stasis Projector: glowing cryo core held in a three-prong field cage over a hex emitter housing, forward projector
// horn with a cyan lens, frost-white coolant tanks behind. L2: bigger core, field halo, second tank, longer horn.
// L3: three horns (the beam forks to 3), twin halos, taller cage, rear cryo pylons on the plinth.
import * as THREE from 'three';
import { C, DECK, PI, cyl, finalize, kit, plinth, rbox, sph, torus, tube, turretRing, type Built, type G, type Kit, type Level } from '../kit';

const CORE = 0x1aa8ff; // deep cyan: reads cyan (not white) after the glow gain
const FROST = 0xd6e2e8; // frost-white coolant paint

/** Projector horn pointing +X at height y: mount, finned stem, flared bell, cyan lens. Returns its geometries. */
function horn(k: Kit, len: number, y: number, fins: number): G[] {
  const out: G[] = [];
  const A = (g: G): void => void out.push(g);
  const X: [number, number, number] = [0, 0, -PI / 2]; // cylinder +Y -> +X
  A(k.add(rbox(0.11, 0.09, 0.12, 0.02, 2), 'metal', C.gunD, { p: [0.17, y, 0] }));
  A(k.add(rbox(0.09, 0.012, 0.07, 0.004), 'hazard', 0xffffff, { p: [0.17, y + 0.048, 0] }));
  A(k.add(cyl(0.03, 0.034, len, 16), 'metal', C.gun, { p: [0.2 + len / 2, y, 0], r: X }));
  for (let i = 0; i < fins; i++) A(k.add(cyl(0.048, 0.048, 0.012, 16), 'metal', C.steel, { p: [0.25 + i * 0.03, y, 0], r: X }));
  A(k.glow(rbox(len - 0.04, 0.008, 0.012, 0.003), C.cyan, { p: [0.21 + len / 2, y + 0.034, 0] }, 3));
  const x = 0.2 + len;
  A(k.add(cyl(0.085, 0.036, 0.09, 24), 'paint', C.team, { p: [x, y, 0], r: X }));
  A(k.glow(torus(0.083, 0.009, 24), C.cyan, { p: [x + 0.045, y, 0], r: [0, PI / 2, 0] }, 3));
  A(k.glow(cyl(0.075, 0.075, 0.006, 24), CORE, { p: [x + 0.04, y, 0], r: X }, 2.5));
  A(k.glow(sph(0.026, 12, 8), C.cyan, { p: [x + 0.045, y, 0] }, 4));
  return out;
}

export function stasis(level: Level): Built {
  const k = kit();
  plinth(k);
  for (let i = 0; i < level; i++) k.glow(rbox(0.05, 0.026, 0.008, 0.003), C.pip, { p: [(i - (level - 1) / 2) * 0.07, 0.025, 0.443] }, 4);
  if (level >= 2) for (const s of [-1, 1]) k.glow(rbox(0.008, 0.012, 0.5, 0.003), C.cyan, { p: [s * 0.443, 0.03, 0] }, 4);
  if (level === 3) for (const s of [-1, 1]) {
    // rear cryo pylons: frost canister on a gun-metal post, cyan band, emitter node on top
    k.add(rbox(0.07, 0.03, 0.07, 0.01), 'metal', C.gunD, { p: [s * 0.37, DECK + 0.015, -0.37] });
    k.add(cyl(0.032, 0.036, 0.26, 16), 'paint', FROST, { p: [s * 0.37, DECK + 0.16, -0.37] });
    for (const y of [0.08, 0.22]) k.add(torus(0.035, 0.007, 16), 'metal', C.gunD, { p: [s * 0.37, DECK + y, -0.37], r: [PI / 2, 0, 0] });
    k.glow(cyl(0.037, 0.037, 0.03, 16), CORE, { p: [s * 0.37, DECK + 0.15, -0.37] }, 2.5);
    k.add(cyl(0.022, 0.03, 0.03, 12), 'metal', C.gun, { p: [s * 0.37, DECK + 0.305, -0.37] });
    k.glow(sph(0.018, 12, 8), C.cyan, { p: [s * 0.37, DECK + 0.33, -0.37] }, 4);
  }

  k.setTurret(true);
  turretRing(k);
  // hex emitter housing
  k.add(cyl(0.17, 0.205, 0.13, 6), 'paint', C.deck, { p: [0, 0.115, 0], r: [0, PI / 6, 0] });
  k.add(cyl(0.15, 0.17, 0.03, 6), 'paint', C.team, { p: [0, 0.195, 0], r: [0, PI / 6, 0] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    k.add(cyl(0.008, 0.008, 0.01, 6), 'metal', C.steel, { p: [Math.cos(a) * 0.158, 0.212, Math.sin(a) * 0.158] });
    // vent grille on every other hex face
    if (i % 2) k.add(rbox(0.012, 0.06, 0.12, 0.004), 'metal', C.gunD, { p: [Math.cos(a) * 0.186, 0.11, Math.sin(a) * 0.186], r: [0, -a, 0.18] });
  }
  // cryo core in its seat, clamp rings, top cap
  const cr = 0.05 + level * 0.008, cl = 0.08 + level * 0.025, cy = 0.24 + cr + cl / 2;
  k.add(cyl(cr + 0.03, cr + 0.05, 0.05, 24), 'metal', C.gunD, { p: [0, 0.225, 0] });
  k.add(torus(cr + 0.035, 0.008, 24), 'metal', C.steel, { p: [0, 0.25, 0], r: [PI / 2, 0, 0] });
  k.glow(new THREE.CapsuleGeometry(cr, cl, 8, 24), CORE, { p: [0, cy, 0] }, 2.4);
  for (const t of level === 1 ? [0] : [-0.3, 0.3]) k.add(torus(cr + 0.004, 0.007, 24), 'metal', C.gunD, { p: [0, cy + t * cl, 0], r: [PI / 2, 0, 0] });
  const top = cy + cl / 2 + cr;
  k.add(cyl(cr * 0.3, cr * 0.55, 0.03, 16), 'metal', C.gun, { p: [0, top, 0] }); // small cap: leave the dome glowing from above
  k.rod([0, top + 0.02, 0], [0, top + 0.07 + level * 0.015, 0], 0.008, 'metal', C.steel, 0, 8);
  // field cage: three prongs rising from the housing, bending in over the core, glowing emitter tips
  const reach = 0.17 + level * 0.015;
  for (let i = 0; i < 3; i++) {
    const a = PI / 3 + (i * 2 * PI) / 3, ca = Math.cos(a), sa = Math.sin(a);
    const p0: [number, number, number] = [ca * 0.13, 0.2, sa * 0.13];
    const p1: [number, number, number] = [ca * reach, cy - 0.02, sa * reach];
    const p2: [number, number, number] = [ca * (cr + 0.035), top + 0.01, sa * (cr + 0.035)];
    k.add(rbox(0.06, 0.04, 0.06, 0.012), 'metal', C.gunD, { p: [ca * 0.13, 0.215, sa * 0.13], r: [0, -a, 0] });
    k.strut(p0, p1, 0.05, 0.05, 'paint', C.team, 0.012);
    k.add(sph(0.034, 16, 10), 'metal', C.steel, { p: p1 });
    k.strut(p1, p2, 0.032, 0.032, 'metal', C.steel, 0.01);
    k.glow(sph(0.022, 12, 8), C.cyan, { p: p2 }, 4);
    k.add(tube([[ca * 0.1, 0.205, sa * 0.1], [ca * (reach - 0.03), cy - 0.08, sa * (reach - 0.03)], [ca * (reach - 0.01), cy - 0.035, sa * (reach - 0.01)]], 0.007, 8), 'metal', C.rubber);
  }
  // field halos (L2+): read as rings around the core from above
  if (level >= 2) k.glow(torus(reach + 0.01, 0.007, 40), C.cyan, { p: [0, cy, 0], r: [PI / 2, 0, 0] }, 3);
  if (level === 3) k.glow(torus(reach + 0.04, 0.006, 40), C.cyan, { p: [0, cy + 0.07, 0], r: [PI / 2 - 0.35, 0, 0] }, 3);
  // projector horn(s), fed by a glowing conduit from the core seat
  const hornLen = 0.12 + level * 0.025;
  const angles = level === 3 ? [-0.6, 0, 0.6] : [0];
  for (const a of angles) {
    const geos = horn(k, a === 0 ? hornLen : hornLen - 0.04, 0.12, level + 1);
    const m = new THREE.Matrix4().makeRotationY(a);
    for (const g of geos) g.applyMatrix4(m);
  }
  k.glow(tube([[0.05, 0.23, 0], [0.12, 0.2, 0], [0.16, 0.17, 0]], 0.01, 8), C.cyan, {}, 3);
  // coolant tanks behind the housing (one per level, max 2), hazard-banded end caps
  const tanks = level === 1 ? [0] : [-0.075, 0.075];
  for (const z of tanks) {
    k.add(cyl(0.05, 0.05, 0.16, 20), 'paint', FROST, { p: [-0.25, 0.1, z], r: [0, 0, PI / 2] });
    for (const x of [-0.33, -0.17]) k.add(cyl(0.052, 0.052, 0.022, 20), 'hazard', 0xffffff, { p: [x, 0.1, z], r: [0, 0, PI / 2] });
    k.glow(rbox(0.08, 0.008, 0.014, 0.003), C.cyan, { p: [-0.25, 0.15, z] }, 3);
  }
  k.add(rbox(0.05, 0.05, tanks.length * 0.15 + 0.03, 0.01), 'metal', C.gunD, { p: [-0.18, 0.05, 0] });
  return finalize(k, DECK);
}
