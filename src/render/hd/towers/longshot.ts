// Longshot Railgun: braced four-leg gantry on the plinth, platform on top carrying a long twin mag-rail gun with an
// amber charge channel, rear power pack and side scope. Per level the gantry rises, the rails lengthen, and parts add
// up: L2 armour skirts, side capacitors, rangefinder; L3 radiator wings, muzzle accelerator rings, beacon mast, full skirts.
import { C, DECK, PI, cyl, finalize, kit, plinth, rbox, sph, torus, tube, type Built, type Level, type V3 } from '../kit';

const X: V3 = [0, 0, -PI / 2]; // cylinder +Y -> +X
const CHARGE = 0xff7a10; // rail charge channel: deep amber so it reads orange, not white, after the gain

export function longshot(level: Level): Built {
  const k = kit();
  plinth(k);
  for (let i = 0; i < level; i++) k.glow(rbox(0.05, 0.026, 0.008, 0.003), C.pip, { p: [(i - (level - 1) / 2) * 0.07, 0.025, 0.443] }, 4);
  if (level >= 2) for (const s of [-1, 1]) k.glow(rbox(0.008, 0.012, 0.5, 0.003), C.amber, { p: [s * 0.443, 0.03, 0] }, 6);

  // --- gantry: four splayed legs from the deck corners to the platform, X-braced faces ---
  const H = 0.52 + level * 0.04; // platform top = turret pivot: 0.56 / 0.60 / 0.64
  const F = 0.36, T = 0.18, top = H - 0.045, rise = top - DECK;
  const leg = (sx: number, sz: number, t: number): V3 => {
    const s = F + (T - F) * t;
    return [sx * s, DECK + rise * t, sz * s];
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.add(rbox(0.09, 0.03, 0.09, 0.01), 'metal', C.gunD, { p: [sx * F, DECK + 0.015, sz * F] });
    k.strut(leg(sx, sz, 0), leg(sx, sz, 1), 0.05, 0.05, 'paint', C.team, 0.012);
    k.strut(leg(sx, sz, 0.02), leg(sx, sz, 0.16), 0.056, 0.056, 'hazard', 0xffffff, 0.012);
    k.add(rbox(0.07, 0.03, 0.07, 0.008), 'metal', C.gunD, { p: leg(sx, sz, 0.5) });
  }
  const bands = level === 1 ? [[0.06, 0.5], [0.5, 0.94]] : [[0.06, 0.36], [0.36, 0.66], [0.66, 0.94]];
  // faces: pairs of legs, [sx, sz] for each end
  const faces: [number, number, number, number][] = [[-1, 1, 1, 1], [-1, -1, 1, -1], [1, -1, 1, 1], [-1, -1, -1, 1]];
  for (const [ax, az, bx, bz] of faces) {
    for (const [t0, t1] of bands) {
      k.strut(leg(ax, az, t0!), leg(bx, bz, t1!), 0.018, 0.018, 'metal', C.chrome, 0.005);
      k.strut(leg(bx, bz, t0!), leg(ax, az, t1!), 0.018, 0.018, 'metal', C.chrome, 0.005);
    }
    k.strut(leg(ax, az, 0.5), leg(bx, bz, 0.5), 0.03, 0.03, 'paint', C.team, 0.008);
  }
  // power trunk up the middle, cables
  k.add(cyl(0.045, 0.06, rise, 16), 'metal', C.gun, { p: [0, DECK + rise / 2, 0] });
  for (let i = 1; i < 4; i++) k.add(torus(0.05, 0.008, 16), 'metal', C.steel, { p: [0, DECK + (rise * i) / 4, 0], r: [PI / 2, 0, 0] });
  for (let i = 0; i < level; i++) k.glow(cyl(0.056, 0.056, 0.02, 16), CHARGE, { p: [0, DECK + rise * (0.36 + i * 0.12), 0] }, 2.5);
  for (const sx of [-1, 1]) k.glow(rbox(0.05, 0.008, 0.02, 0.003), C.pip, { p: [sx * 0.12, top - 0.006, 0.12] }, 3);
  k.add(tube([[0.05, DECK + 0.02, 0.05], [0.07, DECK + rise * 0.5, 0.03], [0.04, top - 0.02, 0.02]], 0.01, 10), 'metal', C.rubber);
  // armour skirts (L2: front + sides, L3: all four), leaning with the legs
  if (level >= 2) {
    const lean = Math.atan2(F - T, rise), t = 0.2, s = F + (T - F) * t, w = 2 * s - 0.05, h = rise * 0.3;
    const y = DECK + rise * t;
    const skirt = (p: V3, r: V3, wide: boolean): void => {
      k.add(rbox(wide ? w : 0.016, h, wide ? 0.016 : w, 0.008), 'paint', C.team, { p, r });
      k.add(rbox(wide ? w * 0.9 : 0.02, 0.02, wide ? 0.02 : w * 0.9, 0.004), 'hazard', 0xffffff, { p: [p[0], p[1] + h * 0.36, p[2]], r });
    };
    skirt([0, y, s], [-lean, 0, 0], true);
    for (const sx of [-1, 1]) skirt([sx * s, y, 0], [0, 0, sx * lean], false);
    if (level === 3) skirt([0, y, -s], [lean, 0, 0], true);
  }
  // platform
  k.add(rbox(0.44, 0.045, 0.44, 0.014), 'metal', C.gun, { p: [0, top + 0.0225 - 0.01, 0] });
  k.add(rbox(0.39, 0.012, 0.39, 0.006), 'paint', C.deck, { p: [0, H - 0.006, 0] });
  k.add(rbox(0.42, 0.022, 0.012, 0.004), 'hazard', 0xffffff, { p: [0, top + 0.012, 0.222] });
  for (const sx of [-1, 1]) k.glow(rbox(0.03, 0.014, 0.006, 0.003), C.amber, { p: [sx * 0.17, top + 0.012, 0.23] }, 6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(cyl(0.012, 0.012, 0.012, 6), 'metal', C.steel, { p: [sx * 0.195, H, sz * 0.195] });

  // --- turret: receiver, power pack, twin mag-rails ---
  k.setTurret(true);
  // slewing ring sized to the platform (the shared turretRing overhangs it)
  k.add(cyl(0.165, 0.18, 0.045, 32), 'metal', C.gunD, { p: [0, 0.0225, 0] });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2;
    k.add(cyl(0.009, 0.009, 0.01, 6), 'metal', C.steel, { p: [Math.cos(a) * 0.155, 0.049, Math.sin(a) * 0.155] });
  }
  const L = 0.42 + level * 0.04; // rail length 0.46 / 0.50 / 0.54
  const x0 = 0.1, x1 = x0 + L, y = 0.12;
  k.add(rbox(0.3, 0.12, 0.2, 0.03, 2), 'paint', C.team, { p: [-0.04, 0.11, 0] });
  k.add(rbox(0.24, 0.02, 0.1, 0.006), 'metal', C.gunD, { p: [-0.05, 0.178, 0] });
  k.add(rbox(0.035, 0.006, 0.18, 0.002), 'hazard', 0xffffff, { p: [0.07, 0.172, 0] });
  for (const s of [-1, 1]) {
    k.add(rbox(0.26, 0.1, 0.02, 0.008), 'metal', C.gun, { p: [-0.05, 0.11, s * 0.108] });
    for (const yy of [0.075, 0.145]) for (let i = 0; i < 5; i++) k.add(cyl(0.006, 0.006, 0.008, 8), 'metal', C.steel, { p: [-0.15 + i * 0.05, yy, s * 0.119], r: [PI / 2, 0, 0] });
  }
  // rear power pack with radiator fins and a charge light
  k.add(rbox(0.13, 0.14, 0.2, 0.025, 2), 'metal', C.gunD, { p: [-0.25, 0.11, 0] });
  for (let i = 0; i < 5; i++) k.add(rbox(0.1, 0.02, 0.01, 0.003), 'metal', C.steel, { p: [-0.25, 0.19, -0.07 + i * 0.035] });
  k.glow(rbox(0.006, 0.05, 0.12, 0.002), C.amber, { p: [-0.318, 0.12, 0] }, 5);
  // mantlet, twin rails framing a glowing charge channel, U-clamps, muzzle block
  k.add(rbox(0.08, 0.11, 0.15, 0.02), 'metal', C.gunD, { p: [x0, y, 0] });
  for (const z of [-0.034, 0.034]) k.add(rbox(L, 0.04, 0.02, 0.006), 'metal', C.steel, { p: [x0 + L / 2, y, z] });
  k.glow(rbox(L - 0.02, 0.01, 0.022, 0.003), CHARGE, { p: [x0 + L / 2, y + 0.004, 0] }, 2.2);
  k.add(rbox(L - 0.02, 0.01, 0.048, 0.003), 'metal', C.bore, { p: [x0 + L / 2, y - 0.004, 0] });
  for (const z of [-0.034, 0.034]) k.add(rbox(L - 0.01, 0.006, 0.012, 0.002), 'metal', C.chrome, { p: [x0 + L / 2, y + 0.021, z] });
  k.add(rbox(L * 0.88, 0.03, 0.05, 0.008), 'metal', C.gun, { p: [x0 + L * 0.44, y - 0.035, 0] });
  const clamps = 3 + level;
  for (let i = 0; i < clamps; i++) {
    const cx = x0 + 0.07 + (i * (L - 0.14)) / (clamps - 1);
    for (const s of [-1, 1]) k.add(rbox(0.026, 0.062, 0.016, 0.004), 'metal', C.gunD, { p: [cx, y - 0.004, s * 0.052] });
    k.add(rbox(0.026, 0.016, 0.12, 0.004), 'metal', C.gunD, { p: [cx, y - 0.036, 0] });
  }
  k.add(rbox(0.05, 0.07, 0.11, 0.012), 'metal', C.gunD, { p: [x1, y, 0] });
  k.add(rbox(0.012, 0.03, 0.06, 0.003), 'metal', C.bore, { p: [x1 + 0.026, y, 0] });
  k.glow(rbox(0.004, 0.012, 0.04, 0.002), C.pip, { p: [x1 + 0.033, y + 0.004, 0] }, 6);
  if (level === 3) for (let i = 0; i < 3; i++) {
    // muzzle accelerator rings: lit square frames over the front of the rails
    const ax = x1 - 0.06 - i * 0.05;
    k.add(rbox(0.022, 0.09, 0.13, 0.006), 'metal', C.gun, { p: [ax, y + 0.005, 0] });
    k.glow(rbox(0.024, 0.008, 0.1, 0.002), C.amber, { p: [ax, y + 0.052, 0] }, 5);
  }
  // scope on a left rail mount (L2+ adds a rangefinder pod)
  k.add(rbox(0.04, 0.04, 0.03, 0.006), 'metal', C.gunD, { p: [0.0, 0.19, -0.075] });
  k.add(cyl(0.024, 0.024, 0.2, 16), 'metal', C.gun, { p: [0.02, 0.22, -0.075], r: X });
  k.add(cyl(0.03, 0.026, 0.04, 16), 'metal', C.gunD, { p: [0.13, 0.22, -0.075], r: X });
  k.glow(cyl(0.022, 0.022, 0.004, 16), C.redGlow, { p: [0.151, 0.22, -0.075], r: X }, 4);
  if (level >= 2) {
    k.add(rbox(0.08, 0.035, 0.045, 0.008), 'metal', C.gunD, { p: [-0.02, 0.255, -0.075] });
    k.glow(rbox(0.004, 0.012, 0.02, 0.002), C.redGlow, { p: [0.022, 0.258, -0.075] }, 5);
    for (const s of [-1, 1]) {
      // side capacitors with amber charge bands
      k.add(cyl(0.032, 0.032, 0.22, 16), 'metal', C.gun, { p: [-0.1, 0.075, s * 0.145], r: X });
      for (const cx of [-0.17, -0.03]) k.add(cyl(0.035, 0.035, 0.016, 16), 'metal', C.gunD, { p: [cx, 0.075, s * 0.145], r: X });
      k.glow(cyl(0.034, 0.034, 0.03, 16), C.amber, { p: [-0.1, 0.075, s * 0.145], r: X }, 4);
    }
  }
  if (level === 3) {
    // beacon mast off the power pack
    k.rod([-0.27, 0.18, 0.06], [-0.285, 0.36, 0.07], 0.008, 'metal', C.steel, 0.005, 8);
    k.add(rbox(0.006, 0.006, 0.07, 0.002), 'metal', C.steel, { p: [-0.283, 0.32, 0.07] });
    k.glow(sph(0.015, 12, 8), C.redGlow, { p: [-0.285, 0.368, 0.07] }, 6);
  }
  if (level === 3) for (const s of [-1, 1]) {
    // radiator wings flaring off the power pack
    k.add(rbox(0.16, 0.012, 0.1, 0.004), 'metal', C.gunD, { p: [-0.27, 0.16, s * 0.15], r: [s * 0.35, 0, 0] });
    for (let i = 0; i < 4; i++) k.add(rbox(0.008, 0.016, 0.09, 0.002), 'metal', C.steel, { p: [-0.33 + i * 0.04, 0.168, s * 0.15], r: [s * 0.35, 0, 0] });
  }
  return finalize(k, H);
}
