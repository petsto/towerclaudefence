// Arc Coil: copper-wound secondary on a ceramic insulator stack, capped by a chrome toroid and a blue-white plasma orb.
// L1 one coil, two deck capacitors. L2 taller coil, lower toroid, two front satellite coils, side capacitors.
// L3 tallest coil with a spiked corona, bigger satellites and capacitor banks, two rear spark pylons arcing to the orb.
// No turret: the whole tower is static (pivot = collar top, kept for the turret contract).
import { C, DECK, PI, cyl, finalize, kit, plinth, rbox, sph, torus, tube, type Built, type Kit, type Level, type V3 } from '../kit';

const COPPER = 0xb8642c, COPPER_L = 0xf0a060, CERAMIC = 0xe2dccd, PLASMA = 0x6aa8ff, CORE = 0xf4faff;

/** Capacitor canister standing on the deck at (x, z), cabled to the drum. */
function capacitor(k: Kit, x: number, z: number, r: number, h: number): void {
  const y0 = DECK;
  k.add(cyl(r + 0.01, r + 0.012, 0.02, 16), 'metal', C.gunD, { p: [x, y0 + 0.01, z] });
  k.add(cyl(r, r, h, 20), 'paint', C.team, { p: [x, y0 + 0.02 + h / 2, z] });
  for (const f of [0.2, 0.8]) k.add(cyl(r + 0.006, r + 0.006, 0.012, 20), 'metal', C.steel, { p: [x, y0 + 0.02 + h * f, z] });
  k.add(cyl(r * 0.8, r, 0.02, 16), 'metal', C.gun, { p: [x, y0 + 0.03 + h, z] });
  k.add(cyl(r * 0.35, r * 0.4, 0.03, 8), 'paint', CERAMIC, { p: [x, y0 + 0.055 + h, z] });
  k.glow(sph(r * 0.3, 12, 8), PLASMA, { p: [x, y0 + 0.075 + h, z] }, 2);
  k.glow(rbox(0.014, h * 0.45, 0.004, 0.002), PLASMA, { p: [x, y0 + 0.02 + h * 0.5, z + r + 0.001] }, 2.5);
  k.add(tube([[x * 0.85, y0 + 0.03, z * 0.85], [x * 0.6, y0 + 0.012, z * 0.6], [x * 0.45, y0 + 0.04, z * 0.45]], 0.011, 8), 'metal', C.rubber);
}

/** Small satellite Tesla coil on the deck at (x, z). Returns its spark-ball position. */
function satellite(k: Kit, x: number, z: number, h: number): V3 {
  const y0 = DECK;
  k.add(rbox(0.11, 0.03, 0.11, 0.01), 'metal', C.gunD, { p: [x, y0 + 0.015, z] });
  k.add(cyl(0.045, 0.05, 0.02, 16), 'paint', CERAMIC, { p: [x, y0 + 0.04, z] });
  k.add(cyl(0.032, 0.032, h, 16), 'metal', COPPER, { p: [x, y0 + 0.05 + h / 2, z] });
  for (let y = 0.008; y < h; y += 0.015) k.add(cyl(0.036, 0.036, 0.007, 12), 'metal', COPPER_L, { p: [x, y0 + 0.05 + y, z] });
  const ty = y0 + 0.05 + h + 0.012;
  k.add(torus(0.045, 0.015, 20), 'metal', C.chrome, { p: [x, ty, z], r: [PI / 2, 0, 0] });
  const ball: V3 = [x, ty + 0.03, z];
  k.glow(sph(0.024, 12, 10), PLASMA, { p: ball }, 2);
  k.glow(sph(0.014, 10, 8), CORE, { p: [x, ty + 0.032, z + 0.01] }, 3);
  return ball;
}

/** Jagged emissive arc from a to b (fixed zig-zag, baked): white core in a blue sheath. */
function arc(k: Kit, a: V3, b: V3, seed: number): void {
  const n = 7;
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const t = i / n, j = i === n ? 0 : 0.05;
    const p: V3 = [
      a[0] + (b[0] - a[0]) * t + Math.sin(seed + i * 2.7) * j,
      a[1] + (b[1] - a[1]) * t + Math.cos(seed + i * 1.9) * j,
      a[2] + (b[2] - a[2]) * t + Math.sin(seed * 3 + i * 1.3) * j,
    ];
    // glow is opaque: nudge the white core toward the camera so it shows on the sheath's near side
    k.rod([prev[0], prev[1] + 0.008, prev[2] + 0.006], [p[0], p[1] + 0.008, p[2] + 0.006], 0.007, 'glow', CORE, 0.007, 6);
    k.rod(prev, p, 0.014, 'glow', PLASMA, 0.014, 6);
    prev = p;
  }
}

export function arcCoil(level: Level): Built {
  const k = kit();
  plinth(k);
  for (let i = 0; i < level; i++) k.glow(rbox(0.05, 0.026, 0.008, 0.003), C.pip, { p: [(i - (level - 1) / 2) * 0.07, 0.025, 0.443] }, 4);

  // --- drum: octagonal housing, gunmetal skirt, painted body, team band (hazard from L2) ---
  const oct = { r: [0, PI / 8, 0] as V3 };
  k.add(cyl(0.23, 0.25, 0.03, 8), 'metal', C.gunD, { p: [0, DECK + 0.015, 0], ...oct });
  k.add(cyl(0.19, 0.22, 0.08, 8), 'paint', C.deck, { p: [0, DECK + 0.07, 0], ...oct });
  k.add(cyl(0.205, 0.215, 0.026, 8), level === 1 ? 'paint' : 'hazard', level === 1 ? C.team : 0xffffff, { p: [0, DECK + 0.075, 0], ...oct });
  k.add(cyl(0.15, 0.19, 0.02, 8), 'metal', C.gun, { p: [0, DECK + 0.12, 0], ...oct });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    k.add(cyl(0.009, 0.009, 0.01, 6), 'metal', C.steel, { p: [Math.cos(a) * 0.236, DECK + 0.033, Math.sin(a) * 0.236] });
  }
  k.glow(rbox(0.08, 0.012, 0.004, 0.002), PLASMA, { p: [0, DECK + 0.048, 0.226] }, 2.5);
  let y = DECK + 0.13;

  // --- insulator stack: ceramic sheds ---
  for (let i = 0; i < level + 1; i++) {
    k.add(cyl(0.1, 0.11, 0.018, 24), 'paint', CERAMIC, { p: [0, y + 0.009, 0] });
    k.add(cyl(0.07, 0.07, 0.016, 16), 'metal', C.gunD, { p: [0, y + 0.026, 0] });
    y += 0.034;
  }

  // --- secondary winding: copper core with bright wire turns, retaining bars, plasma seams ---
  const coilH = [0.24, 0.3, 0.36][level - 1]!;
  const cr = 0.064 + level * 0.007;
  k.add(cyl(cr, cr, coilH, 24), 'metal', COPPER, { p: [0, y + coilH / 2, 0] });
  for (let t = 0.008; t < coilH; t += 0.015) k.add(cyl(cr + 0.004, cr + 0.004, 0.008, 16), 'metal', COPPER_L, { p: [0, y + t, 0] });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    k.add(rbox(0.014, coilH, 0.014, 0.004), 'metal', C.gunD, { p: [Math.cos(a) * (cr + 0.01), y + coilH / 2, Math.sin(a) * (cr + 0.01)] });
  }
  for (const f of level === 1 ? [0.5] : [0.33, 0.66]) k.glow(torus(cr + 0.01, 0.005, 24), PLASMA, { p: [0, y + coilH * f, 0], r: [PI / 2, 0, 0] }, 2.2);
  y += coilH;
  k.add(cyl(cr + 0.018, cr + 0.024, 0.03, 24), 'metal', C.gun, { p: [0, y + 0.015, 0] });
  y += 0.03;

  // --- L2+: lower grading ring on three spokes ---
  const gy = y - coilH * 0.4, gr = 0.11 + (level - 2) * 0.015;
  if (level >= 2) {
    k.add(torus(gr, 0.022, 32), 'metal', C.chrome, { p: [0, gy, 0], r: [PI / 2, 0, 0] });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2 + PI / 6;
      k.rod([Math.cos(a) * gr, gy, Math.sin(a) * gr], [Math.cos(a) * (cr + 0.012), gy, Math.sin(a) * (cr + 0.012)], 0.008, 'metal', C.gunD);
    }
  }

  // --- deck equipment ---
  if (level === 1) {
    for (const s of [-1, 1]) capacitor(k, s * 0.28, 0.28, 0.055, 0.13);
  } else {
    for (const s of [-1, 1]) {
      const ball = satellite(k, s * 0.28, 0.28, level === 2 ? 0.16 : 0.2);
      // live arc from the satellite's spark ball to the grading ring (front quadrant)
      arc(k, ball, [s * gr * 0.7, gy, gr * 0.7], s * 3 + level);
      capacitor(k, s * 0.31, 0.0, level === 2 ? 0.05 : 0.06, level === 2 ? 0.13 : 0.17);
    }
  }
  const top = y; // crown base (collar top), also the pivot
  const orbY = top + 0.09;
  if (level === 3) {
    // rear spark pylons on the deck corners, live arcs to the orb
    for (const s of [-1, 1]) {
      const px = s * 0.37, pz = -0.37, ph = DECK + 0.48;
      k.add(rbox(0.08, 0.04, 0.08, 0.01), 'metal', C.gunD, { p: [px, DECK + 0.02, pz] });
      k.rod([px, DECK + 0.04, pz], [px, ph - 0.03, pz], 0.018, 'metal', C.gun, 0.012, 8);
      for (let i = 0; i < 4; i++) k.add(cyl(0.032, 0.038, 0.014, 16), 'paint', CERAMIC, { p: [px, DECK + 0.12 + i * 0.07, pz] });
      k.add(sph(0.032, 16, 12), 'metal', C.chrome, { p: [px, ph, pz] });
      k.glow(sph(0.022, 10, 8), CORE, { p: [px, ph + 0.02, pz] }, 3);
      arc(k, [px, ph + 0.02, pz], [s * 0.03, orbY, -0.03], s * 5 + 1);
    }
  }

  // --- crown: main toroid and plasma orb ---
  const R = [0.1, 0.115, 0.13][level - 1]!, rt = 0.03 + level * 0.003;
  k.add(cyl(0.045, 0.055, 0.04, 16), 'metal', C.gunD, { p: [0, top + 0.02, 0] });
  k.add(torus(R, rt, 32), 'metal', C.chrome, { p: [0, top + 0.05, 0], r: [PI / 2, 0, 0] });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    k.rod([Math.cos(a) * R, top + 0.05, Math.sin(a) * R], [Math.cos(a) * 0.04, top + 0.04, Math.sin(a) * 0.04], 0.01, 'metal', C.gunD);
  }
  k.glow(sph(0.045 + level * 0.008, 20, 14), PLASMA, { p: [0, top + 0.09, 0] }, 2);
  k.glow(sph(0.028 + level * 0.006, 16, 12), CORE, { p: [0, top + 0.1, 0.018] }, 3);
  if (level === 3) {
    // corona: spikes around the toroid, glowing crest ring
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      k.rod([Math.cos(a) * (R + rt - 0.005), top + 0.05, Math.sin(a) * (R + rt - 0.005)], [Math.cos(a) * (R + rt + 0.045), top + 0.055, Math.sin(a) * (R + rt + 0.045)], 0.008, 'metal', C.steel, 0, 6);
    }
    k.glow(torus(R, 0.007, 32), PLASMA, { p: [0, top + 0.05 + rt, 0], r: [PI / 2, 0, 0] }, 2.5);
  }
  // ponytail: no turret parts. Turret frames turn base meshes (glow too) into shadow catchers, so any yawing
  // electrode stamped a dark spot on the orb; chain lightning has no facing anyway.
  return finalize(k, top);
}
