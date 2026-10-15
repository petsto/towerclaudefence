// Husk Crawler (organic): four chitin-plated segments, three leg pairs on an alternating tripod gait, raptorial
// claws, glowing tail bio-sac.
import * as THREE from 'three';
import { C, PI, finalize, kit, sph, torus, type Built, type V3 } from '../kit';

export function huskCrawler(phase: number): Built {
  const k = kit();
  const segs: [number, number][] = [[0.17, 0.11], [0.0, 0.135], [-0.16, 0.115], [-0.29, 0.085]];
  const cy = 0.16 + 0.006 * Math.cos(phase * PI * 4); // body dips at each tripod's contact
  segs.forEach(([x, r], si) => {
    const tilt = -x * 0.7;
    k.add(sph(r, 28, 20), 'chitin', C.chBody, { p: [x, cy, 0], s: [1.05, 0.78, 0.95] });
    k.add(new THREE.SphereGeometry(r * 1.07, 28, 12, 0, PI * 2, 0, PI * 0.42), 'chitin', C.chPlate, { p: [x, cy + r * 0.04, 0], r: [0, 0, tilt], s: [1.12, 0.82, 1.0] });
    k.add(torus(r * 0.86, r * 0.07, 28), 'chitin', C.chDark, { p: [x, cy + r * 0.42, 0], r: [PI / 2, tilt, 0], s: [1.12, 1, 1] });
    k.rod([x, cy + r * 0.8, 0], [x - 0.07, cy + r * 0.8 + 0.09 - si * 0.012, 0], 0.017, 'chitin', C.chBone, 0, 10);
    for (const s of [-1, 1]) {
      k.rod([x, cy + r * 0.35, s * r * 0.85], [x - 0.04, cy + r * 0.6, s * (r + 0.07)], 0.012, 'chitin', C.chBone, 0, 8);
      if (si === 3) continue;
      // tripod gait: legs alternate sides along the body; swing forward with the foot lifted, stance sweeps back
      const a = (phase + ((si + (s > 0 ? 0 : 1)) % 2) * 0.5) * PI * 2;
      const dx = 0.04 * Math.cos(a), lift = 0.035 * Math.max(0, Math.sin(a));
      const hip: V3 = [x, cy - 0.03, s * r * 0.75], knee: V3 = [x + 0.03 + dx * 0.5, 0.23 + lift, s * (r + 0.11)], foot: V3 = [x + 0.06 + dx, lift, s * (r + 0.21)];
      k.add(sph(0.026, 12, 8), 'chitin', C.chDark, { p: hip });
      k.rod(hip, knee, 0.02, 'chitin', C.chDark, 0.015, 10);
      k.add(sph(0.017, 10, 8), 'chitin', C.chDark, { p: knee });
      k.rod(knee, foot, 0.015, 'chitin', C.chBone, 0.003, 10);
    }
  });
  // head, eyes, mandibles, raptorial claws (mandibles work open/shut with the gait)
  const hy = cy - 0.01;
  const jaw = 0.012 * Math.sin(phase * PI * 4);
  k.add(sph(0.078, 24, 16), 'chitin', C.chDark, { p: [0.285, hy, 0], s: [1.1, 0.85, 1] });
  for (const s of [-1, 1]) {
    k.glow(sph(0.014, 10, 8), C.chGlow, { p: [0.345, hy + 0.03, s * 0.03] });
    k.glow(sph(0.01, 10, 8), C.chGlow, { p: [0.33, hy + 0.05, s * 0.055] });
    k.rod([0.33, hy - 0.03, s * 0.04], [0.4, hy - 0.05, s * (0.065 + jaw)], 0.018, 'chitin', C.chBone, 0.012, 10);
    k.rod([0.4, hy - 0.05, s * (0.065 + jaw)], [0.445, hy - 0.06, s * (0.02 + jaw)], 0.012, 'chitin', C.chBone, 0, 10);
    k.rod([0.21, cy + 0.03, s * 0.09], [0.29, cy + 0.12, s * 0.15], 0.022, 'chitin', C.chDark, 0.016, 10);
    k.add(sph(0.018, 10, 8), 'chitin', C.chDark, { p: [0.29, cy + 0.12, s * 0.15] });
    k.rod([0.29, cy + 0.12, s * 0.15], [0.39, cy - 0.04, s * 0.12], 0.016, 'chitin', C.chBone, 0, 10);
  }
  // glowing bio-sac on the tail, cinched by dark chitin bands
  k.glow(sph(0.068, 24, 16), C.chGlow, { p: [-0.33, cy + 0.075, 0] }, 5);
  for (const a of [0.5, -0.5]) k.add(torus(0.066, 0.009, 24), 'chitin', C.chDark, { p: [-0.33, cy + 0.075, 0], r: [PI / 2 + a, 0, 0] });
  return finalize(k, 0);
}
