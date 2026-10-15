// Picket Autocannon: boxy armoured turret, twin barrels with cooling shrouds and muzzle brakes, side ammo drum.
import { C, DECK, PI, cyl, finalize, kit, plinth, rankDress, rbox, sph, torus, turretRing, type Built, type Level } from '../kit';

export function picket(level: Level): Built {
  const k = kit();
  plinth(k);
  rankDress(k, level);
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
  k.glow(cyl(0.018, 0.018, 0.006, 16), C.cyan, { p: [0.068, 0.258, 0.09], r: [0, 0, -PI / 2] });
  k.rod([-0.19, 0.23, -0.11], [-0.21, 0.5, -0.13], 0.006, 'metal', C.steel, 0.004, 6);
  k.glow(sph(0.012, 10, 8), C.redGlow, { p: [-0.21, 0.505, -0.13] });
  k.add(rbox(0.03, 0.1, 0.22, 0.008), 'metal', C.gunD, { p: [-0.24, 0.12, 0] });
  for (let i = 0; i < 5; i++) k.add(rbox(0.036, 0.006, 0.2, 0.002), 'metal', C.steel, { p: [-0.245, 0.085 + i * 0.017, 0] });
  k.glow(rbox(0.04, 0.012, 0.004, 0.002), C.amber, { p: [-0.13, 0.18, 0.161] });
  return finalize(k, DECK);
}
