// Brood Carrier (organic, heavy): a bloated membranous egg sac caged by armoured bone ribs, glowing eggs bulging
// between them under sinew straps, carried by an armoured shovel-headed forebody with tusks on four pillar legs.
// Lumbering diagonal trot; the sac breathes and sways a beat behind the body.
import * as THREE from 'three';
import { C, PI, finalize, kit, sph, tube, type Built, type V3 } from '../kit';
import { MEMBRANE, SINEW, bioSac, limb, rib, stride } from './chorus';

const AB = { x: -0.12, y: 0.37, rx: 0.3, ry: 0.23, rz: 0.26 }; // abdomen ellipsoid
// eggs on the sac surface: [x offset, angle from the top toward +Z, radius]; mirrored unless on the dorsal line
const EGGS: [number, number, number][] = [
  [0.03, 0, 0.072], [-0.06, 0.6, 0.062], [0.07, 0.62, 0.05], [-0.01, 1.2, 0.056], [-0.2, 0.35, 0.052], [-0.2, 1.1, 0.046],
];
const RIBS = [0.16, -0.13, -0.27];

export function broodCarrier(phase: number): Built {
  const k = kit();
  const bob = 0.014 * Math.cos(phase * PI * 4);
  const breath = 1 + 0.035 * Math.sin(phase * PI * 2);
  const sway = 0.04 * Math.sin(phase * PI * 2 - 0.8); // the sac lags the stride
  // --- abdomen (built around its centre, then breathed, swayed and placed) ---
  const nA = k.raw.length;
  k.add(sph(1, 36, 24), 'chitin', MEMBRANE, { s: [AB.rx, AB.ry, AB.rz] });
  for (const [dx, a, r] of EGGS) {
    for (const s of a === 0 ? [1] : [-1, 1]) {
      const e = Math.sqrt(Math.max(0, 1 - (dx / AB.rx) ** 2));
      const n: V3 = [0, Math.cos(a), s * Math.sin(a)];
      bioSac(k, [dx, n[1] * AB.ry * e * 0.97, n[2] * AB.rz * e * 0.97], n, r);
    }
  }
  // flat bone rib bands hugging the sac, each with a dorsal spine; sinew straps run between them over the eggs
  const f = (x: number) => Math.sqrt(Math.max(0.05, 1 - (x / (AB.rx * 1.04)) ** 2));
  for (const dx of RIBS) {
    rib(k, [dx, 0, 0], AB.rz * f(dx) * 1.0, AB.ry * f(dx) * 1.0, 0.02, C.chBone, 1.35, 1.8);
    k.rod([dx, AB.ry * f(dx) + 0.01, 0], [dx - 0.06, AB.ry * f(dx) + 0.08 * f(dx), 0], 0.022, 'chitin', C.chPlate, 0, 10);
  }
  for (const s of [-1, 1]) for (let i = 0; i < RIBS.length - 1; i++) {
    const x0 = RIBS[i]!, x1 = RIBS[i + 1]!, a = 0.95;
    const P = (x: number, k2: number): V3 => [x, Math.cos(a) * AB.ry * f(x) * k2, s * Math.sin(a) * AB.rz * f(x) * k2];
    k.add(tube([P(x0, 1.0), P((x0 + x1) / 2, 1.06), P(x1, 1.0)], 0.008, 10), 'chitin', SINEW);
  }
  k.glow(sph(0.045, 16, 12), C.chGlow, { p: [-AB.rx - 0.005, -0.02, 0] }, 4); // birth pore
  k.add(new THREE.TorusGeometry(0.045, 0.013, 8, 20), 'chitin', SINEW, { p: [-AB.rx + 0.005, -0.02, 0], r: [0, PI / 2, 0] });
  for (const r of k.raw.slice(nA)) r.geo.scale(breath, breath, 1 + (breath - 1) * 0.6).rotateX(sway).translate(AB.x, AB.y + bob * 1.4, 0);

  // --- forebody: armoured thorax, shovel head shield, tusks, eye clusters ---
  const nF = k.raw.length;
  k.add(sph(0.14, 32, 22), 'chitin', C.chDark, { p: [0.17, 0.31, 0], s: [1.05, 0.82, 1.1] });
  k.add(new THREE.SphereGeometry(0.15, 32, 12, 0, PI * 2, 0, PI * 0.45), 'chitin', C.chPlate, { p: [0.16, 0.32, 0], r: [0, 0, -0.15], s: [1.05, 0.8, 1.1] });
  k.add(new THREE.SphereGeometry(0.13, 32, 12, 0, PI * 2, 0, PI * 0.4), 'chitin', C.chBone, { p: [0.3, 0.27, 0], r: [0, 0, -0.75], s: [0.7, 0.75, 1.15] });
  k.add(sph(0.08, 24, 16), 'chitin', C.chDark, { p: [0.33, 0.24, 0], s: [1.1, 0.75, 1.05] });
  for (const s of [-1, 1]) {
    for (const [ex, ey, ez, er] of [[0.39, 0.3, 0.05, 0.016], [0.37, 0.32, 0.085, 0.012], [0.4, 0.27, 0.075, 0.01]] as const) {
      k.glow(sph(er, 10, 8), C.chGlow, { p: [ex, ey, s * ez] }, 8);
    }
    limb(k, [[0.36, 0.2, s * 0.07], [0.45, 0.15, s * 0.1], [0.5, 0.2, s * 0.085]], [0.026, 0.018, 0], [C.chBone]); // tusk
    limb(k, [[0.38, 0.19, s * 0.03], [0.43, 0.13, s * 0.04], [0.46, 0.12, s * 0.02]], [0.01, 0.007, 0], [C.chBone]); // palp
    k.add(tube([[0.24, 0.3, s * 0.13], [0.12, 0.38, s * 0.16], [0.02, 0.4, s * 0.17]], 0.012, 8), 'chitin', SINEW); // neck sinew
  }
  for (const r of k.raw.slice(nF)) r.geo.translate(-0.17, -0.31, 0).scale(1.15, 1.15, 1.15).translate(0.19, 0.31 + bob, 0);

  // --- four pillar legs on a diagonal trot (front-left + rear-right, then the other pair) ---
  for (const [hx, fx, side0] of [[0.16, 0.2, 0], [-0.2, -0.24, 1]] as const) {
    for (const s of [-1, 1]) {
      const { dx, lift } = stride(phase + ((side0 + (s > 0 ? 0 : 1)) % 2) * 0.5);
      const sx = dx * 0.13, ly = lift * 0.08;
      const hip: V3 = [hx, 0.3 + bob, s * 0.16];
      const knee: V3 = [hx + sx * 0.4 + 0.02, 0.45 + bob + ly * 0.5, s * 0.37];
      const ankle: V3 = [fx + sx, 0.08 + ly, s * 0.31];
      k.add(sph(0.062, 16, 12), 'chitin', SINEW, { p: hip });
      limb(k, [hip, knee, ankle], [0.056, 0.042, 0.022], [C.chDark, C.chBone]);
      k.rod(knee, [knee[0] - 0.04, knee[1] + 0.08, knee[2] + s * 0.03], 0.024, 'chitin', C.chBone, 0, 10); // knee spur
      k.add(sph(0.03, 14, 10), 'chitin', C.chDark, { p: ankle, s: [1, 0.8, 1] });
      for (const a of [-0.6 + s * 0.4, s * 0.4, 0.6 + s * 0.4]) {
        limb(k, [ankle, [ankle[0] + 0.05 * Math.cos(a), ly + 0.02, ankle[2] + 0.05 * Math.sin(a)], [ankle[0] + 0.075 * Math.cos(a), ly, ankle[2] + 0.075 * Math.sin(a)]], [0.018, 0.012, 0], [C.chBone]);
      }
    }
  }
  for (const r of k.raw) r.geo.translate(-0.04, 0, 0); // centre the mass on the origin: keeps the bake cell compact
  return finalize(k, 0);
}
