// Breacher Missile Pod: yoke-mounted 3x3 missile box pitched up on a trunnion, radar mast behind.
import * as THREE from 'three';
import { C, DECK, PI, cyl, finalize, kit, plinth, rankDress, rbox, sph, tube, turretRing, type Built, type G, type Level } from '../kit';

export function breacher(level: Level): Built {
  const k = kit();
  plinth(k);
  rankDress(k, level);
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
  k.glow(sph(0.012, 10, 8), C.redGlow, { p: [-0.152, 0.5, 0] });
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
  for (const s of [-1, 1]) k.add(tube([[-0.1, 0.12, s * 0.1], [-0.16, 0.2, s * 0.11], [-0.14, 0.28, s * 0.1]], 0.012), 'metal', C.rubber);
  return finalize(k, DECK);
}
