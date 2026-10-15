// Picket Autocannon: boxy armoured turret, twin barrels with cooling shrouds and muzzle brakes, side ammo drum.
// L2: heavy shrouded barrels, bolt-on cheek armour with hazard edges, second drum, plinth corner armour.
// L3: wider turret with a quad barrel bank (two twin pairs), glowing heat vents, top sensor pod, rear ammo bin, masts.
import { C, DECK, PI, cyl, finalize, kit, plinth, rbox, sph, torus, turretRing, type Built, type Kit, type Level } from '../kit';

/** 1/2/3 lit rank pips on the front base slab (same as rankDress). */
function pips(k: Kit, level: Level): void {
  for (let i = 0; i < level; i++) k.glow(rbox(0.05, 0.026, 0.008, 0.003), C.pip, { p: [(i - (level - 1) / 2) * 0.07, 0.025, 0.443] }, 4);
}

/** One autocannon barrel along +X at (y, z); `heavy` = longer, fatter perforated shroud. */
function barrel(k: Kit, y: number, z: number, heavy: boolean, vent: boolean): void {
  const sr = heavy ? 0.037 : 0.031, sl = heavy ? 0.22 : 0.14, sx = 0.27 + sl / 2;
  k.add(rbox(0.08, 0.05, 0.05, 0.01), 'metal', C.steel, { p: [0.25, y, z] });
  k.add(cyl(0.02, 0.02, 0.36, 16), 'metal', C.chrome, { p: [0.44, y, z], r: [0, 0, -PI / 2] });
  k.add(cyl(sr, sr, sl, 16), 'metal', C.gun, { p: [sx, y, z], r: [0, 0, -PI / 2] });
  const rings = heavy ? 6 : vent ? 4 : 5;
  for (let i = 0; i < rings; i++) k.add(torus(sr, 0.004, 12), 'metal', C.bore, { p: [0.285 + i * 0.027, y, z], r: [0, PI / 2, 0] });
  if (vent) for (const dx of [0, 0.05]) k.glow(rbox(0.026, 0.006, 0.012, 0.002), C.amber, { p: [0.33 + dx, y + sr, z] }, 5);
  const bx = heavy ? 0.605 : 0.6;
  k.add(cyl(heavy ? 0.034 : 0.03, heavy ? 0.034 : 0.03, 0.05, 16), 'metal', C.gunD, { p: [bx, y, z], r: [0, 0, -PI / 2] });
  k.add(rbox(0.012, heavy ? 0.076 : 0.066, 0.022, 0.003), 'metal', C.bore, { p: [bx, y, z] });
  k.add(cyl(0.015, 0.015, 0.004, 12), 'metal', C.bore, { p: [bx + 0.026, y, z], r: [0, 0, -PI / 2] });
}

/** Ammo drum on the side at z (sign gives the facing), with bands and hub. */
function drum(k: Kit, z: number): void {
  const s = Math.sign(z);
  k.add(cyl(0.066, 0.066, 0.1, 24), 'metal', C.gun, { p: [-0.11, 0.12, z], r: [PI / 2, 0, 0] });
  for (const dz of [-0.035, 0, 0.035]) k.add(torus(0.067, 0.006, 24), 'metal', C.steel, { p: [-0.11, 0.12, z + dz] });
  k.add(cyl(0.03, 0.03, 0.012, 16), 'metal', C.gunD, { p: [-0.11, 0.12, z + s * 0.053], r: [PI / 2, 0, 0] });
  k.add(rbox(0.12, 0.03, 0.05, 0.008), 'metal', C.gunD, { p: [0.0, 0.17, z - s * 0.045] });
}

export function picket(level: Level): Built {
  const k = kit();
  plinth(k);
  pips(k, level);
  if (level >= 2) {
    // bolt-on corner armour blocks with hazard caps on the front pair, amber rank strips along the sides
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.add(rbox(0.13, 0.13, 0.13, 0.02), 'paint', C.team, { p: [sx * 0.38, 0.1, sz * 0.38] });
      k.add(rbox(0.14, 0.02, 0.14, 0.006), sz > 0 ? 'hazard' : 'metal', sz > 0 ? 0xffffff : C.gunD, { p: [sx * 0.38, 0.172, sz * 0.38] });
      for (const d of [-0.04, 0.04]) k.add(cyl(0.008, 0.008, 0.008, 6), 'metal', C.steel, { p: [sx * 0.38 + d, 0.12, sz * 0.447], r: [PI / 2, 0, 0] });
    }
    for (const s of [-1, 1]) k.glow(rbox(0.008, 0.012, 0.5, 0.003), C.amber, { p: [s * 0.443, 0.03, 0] }, 6);
  }
  if (level === 3) {
    // twin rear signal masts
    for (const s of [-1, 1]) {
      k.add(rbox(0.04, 0.3, 0.04, 0.01), 'metal', C.gunD, { p: [s * 0.38, 0.32, -0.38] });
      k.glow(rbox(0.05, 0.035, 0.05, 0.008), C.amber, { p: [s * 0.38, 0.485, -0.38] }, 6);
    }
  }
  k.setTurret(true);
  turretRing(k);
  const w = level === 3 ? 0.2 : 0.16; // turret half-width (z)
  k.add(rbox(0.36, 0.16, w * 2, 0.035, 2), 'paint', C.deck, { p: [-0.05, 0.13, 0] });
  k.add(rbox(0.26, 0.024, w * 2 - 0.06, 0.01), 'paint', C.team, { p: [-0.08, 0.222, 0] });
  k.add(rbox(0.15, 0.14, w * 2 - 0.02, 0.025, 2), 'metal', C.gun, { p: [0.12, 0.115, 0], r: [0, 0, -0.42] });
  k.add(rbox(0.035, 0.006, w * 2 - 0.08, 0.002), 'hazard', 0xffffff, { p: [0.06, 0.236, 0] });
  for (const s of [-1, 1]) {
    k.add(rbox(0.3, 0.12, 0.022, 0.008), 'metal', C.gun, { p: [-0.05, 0.12, s * (w + 0.01)] });
    for (const y of [0.08, 0.16]) for (let i = 0; i < 6; i++) k.add(cyl(0.007, 0.007, 0.008, 8), 'metal', C.steel, { p: [-0.17 + i * 0.045, y, s * (w + 0.022)], r: [PI / 2, 0, 0] });
    if (level >= 2) {
      // cheek applique armour, angled, hazard leading edge
      k.add(rbox(0.2, 0.15, 0.03, 0.01), 'paint', C.team, { p: [0.08, 0.13, s * (w + 0.035)], r: [0, s * 0.18, 0] });
      k.add(rbox(0.03, 0.15, 0.034, 0.006), 'hazard', 0xffffff, { p: [0.185, 0.13, s * (w + 0.016)], r: [0, s * 0.18, 0] });
    }
  }
  // hatch with handle
  k.add(cyl(0.055, 0.058, 0.02, 24), 'metal', C.gun, { p: [-0.12, 0.244, -0.04] });
  k.add(torus(0.022, 0.004, 12, PI), 'metal', C.chrome, { p: [-0.12, 0.254, -0.04] });
  // ammo drums: camera side, L2+ both sides
  const dz = w + 0.075;
  drum(k, dz);
  if (level >= 2) drum(k, -dz);
  // mantlet + barrels
  k.add(rbox(0.07, level === 3 ? 0.12 : 0.11, w * 2 - 0.1, 0.02), 'metal', C.gunD, { p: [0.2, 0.13, 0] });
  const zs = level === 3 ? [-0.15, -0.055, 0.055, 0.15] : [-0.06, 0.06];
  for (const z of zs) barrel(k, 0.13, z, level === 2, level === 3);
  if (level === 3) for (const z of [-0.1, 0.1]) k.add(rbox(0.05, 0.02, 0.12, 0.006), 'metal', C.steel, { p: [0.4, 0.13, z] }); // pair clamps
  // sensor, antenna, rear vent, lights
  k.add(rbox(0.07, 0.05, 0.07, 0.01), 'metal', C.gun, { p: [0.03, 0.258, 0.09] });
  k.glow(cyl(0.018, 0.018, 0.006, 16), C.cyan, { p: [0.068, 0.258, 0.09], r: [0, 0, -PI / 2] });
  k.rod([-0.19, 0.23, -0.11], [-0.21, 0.5, -0.13], 0.006, 'metal', C.steel, 0.004, 6);
  k.glow(sph(0.012, 10, 8), C.redGlow, { p: [-0.21, 0.505, -0.13] });
  k.add(rbox(0.03, 0.1, w * 2 - 0.1, 0.008), 'metal', C.gunD, { p: [-0.24, 0.12, 0] });
  for (let i = 0; i < 5; i++) k.add(rbox(0.036, 0.006, w * 2 - 0.12, 0.002), 'metal', C.steel, { p: [-0.245, 0.085 + i * 0.017, 0] });
  k.glow(rbox(0.04, 0.012, 0.004, 0.002), C.amber, { p: [-0.13, 0.18, w + 0.001] });
  if (level >= 2) {
    // roof searchlight
    k.add(cyl(0.032, 0.036, 0.05, 20), 'metal', C.gunD, { p: [0.0, 0.27, -0.09], r: [0, 0, -PI / 2] });
    k.glow(cyl(0.026, 0.026, 0.004, 20), C.pip, { p: [0.027, 0.27, -0.09], r: [0, 0, -PI / 2] }, 5);
    k.add(rbox(0.03, 0.03, 0.02, 0.005), 'metal', C.gun, { p: [-0.01, 0.245, -0.09] });
  }
  if (level === 3) {
    // top sensor pod with twin cyan emitters, rear ammo bin with feed belts
    k.add(rbox(0.12, 0.06, 0.16, 0.015, 2), 'paint', C.team, { p: [-0.04, 0.27, 0.06] });
    for (const z of [0.02, 0.1]) k.glow(rbox(0.006, 0.02, 0.03, 0.002), C.cyan, { p: [0.022, 0.275, z] }, 7);
    k.add(rbox(0.14, 0.13, w * 2 - 0.04, 0.02, 2), 'metal', C.gun, { p: [-0.3, 0.12, 0] });
    k.add(rbox(0.145, 0.012, w * 2 - 0.035, 0.004), 'metal', C.gunD, { p: [-0.3, 0.188, 0] });
    k.add(rbox(0.012, 0.03, w * 2 - 0.06, 0.004), 'hazard', 0xffffff, { p: [-0.372, 0.13, 0] });
    for (const s of [-1, 1]) k.add(rbox(0.1, 0.012, 0.03, 0.003), 'metal', C.chrome, { p: [-0.2, 0.2, s * 0.12], r: [0, 0, 0.3] });
  }
  return finalize(k, DECK);
}
