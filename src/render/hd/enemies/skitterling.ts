// Skitterling (organic, light swarmer): tick-like body slung between six long splayed spider legs, a ridged carapace
// with back-swept spines, raised sickle forearms and big glowing eyes. Fast alternating-tripod scuttle.
import * as THREE from 'three';
import { C, PI, finalize, kit, sph, type Built, type V3 } from '../kit';
import { SINEW, bioSac, limb, stride } from './chorus';

export function skitterling(phase: number): Built {
  const k = kit();
  const cy = 0.13 + 0.008 * Math.cos(phase * PI * 4); // body drops onto each tripod
  const roll = 0.05 * Math.sin(phase * PI * 2); // weight shifts side to side between tripods
  const n0 = k.raw.length;
  // abdomen: glossy purple bulb with three shingled ochre tergites, back-swept spines, glowing spiracles on the rim
  k.add(sph(0.085, 28, 20), 'chitin', C.chBody, { p: [-0.075, 0.02, 0], r: [0, 0, 0.18], s: [1.3, 0.82, 1.05] });
  for (const [x, e] of [[-0.025, 0.9], [-0.075, 1], [-0.125, 0.82]] as const) {
    k.add(new THREE.SphereGeometry(1, 24, 8, 0, PI * 2, 0, PI * 0.34), 'chitin', C.chPlate, { p: [x, 0.025 - (1 - e) * 0.02, 0], r: [0, 0, 0.35 + x * 2], s: [0.045, 0.072 * e, 0.09 * e] });
    k.rod([x, 0.025 + 0.068 * e, 0], [x - 0.065, 0.025 + 0.068 * e + 0.06 * e, 0], 0.014, 'chitin', C.chBone, 0, 8);
  }
  for (const s of [-1, 1]) for (const x of [-0.04, -0.1]) k.glow(sph(0.011, 10, 8), C.chGlow, { p: [x, 0.03, s * 0.083] }, 6);
  bioSac(k, [-0.18, 0.03, 0], [-0.7, 0.7, 0], 0.026); // tail sac
  // thorax + head
  k.add(sph(0.05, 24, 16), 'chitin', C.chDark, { p: [0.03, 0.0, 0], s: [1.2, 0.85, 1.05] });
  k.add(new THREE.SphereGeometry(0.054, 24, 10, 0, PI * 2, 0, PI * 0.42), 'chitin', C.chPlate, { p: [0.03, 0.005, 0], s: [1.15, 0.9, 1.0] });
  k.add(sph(0.04, 22, 16), 'chitin', C.chDark, { p: [0.095, -0.005, 0], s: [1.15, 0.9, 1.0] });
  for (const s of [-1, 1]) {
    k.glow(sph(0.02, 12, 10), C.chGlow, { p: [0.122, 0.015, s * 0.024] }, 8);
    k.glow(sph(0.009, 10, 8), C.chGlow, { p: [0.108, 0.03, s * 0.036] }, 8);
    // mandibles
    k.rod([0.12, -0.02, s * 0.018], [0.155, -0.035, s * 0.03], 0.009, 'chitin', C.chBone, 0.006, 8);
    k.rod([0.155, -0.035, s * 0.03], [0.17, -0.04, s * 0.006], 0.006, 'chitin', C.chBone, 0, 8);
    // raised sickle forearms, cocked over the head
    limb(k, [[0.06, 0.01, s * 0.035], [0.1, 0.085, s * 0.06], [0.19, 0.03, s * 0.05]], [0.011, 0.009, 0], [C.chDark, C.chBone]);
    k.rod([0.1, 0.085, s * 0.06], [0.08, 0.11, s * 0.063], 0.006, 'chitin', C.chBone, 0, 6); // elbow spur
  }
  for (const r of k.raw.slice(n0)) r.geo.scale(1.2, 1.2, 1.2).rotateX(roll).translate(0, cy, 0);
  // six long legs, knees high above the body; tripods (front-left, mid-right, rear-left) alternate
  const legs: [number, number, number][] = [[0.05, 0.14, 0.05], [0.0, 0.0, 0.0], [-0.06, -0.15, -0.06]]; // hip x, foot x, knee x shift
  legs.forEach(([hx, fx, kx], li) => {
    for (const s of [-1, 1]) {
      const { dx, lift } = stride(phase + ((li + (s > 0 ? 0 : 1)) % 2) * 0.5);
      const sx = dx * 0.09, ly = lift * 0.06;
      const hip: V3 = [hx, cy - 0.01 + s * roll * 0.04, s * 0.045];
      const knee: V3 = [hx + kx + sx * 0.4, cy + 0.075 + ly * 0.6, s * 0.14];
      const ankle: V3 = [fx + sx * 0.85, 0.06 + ly, s * 0.205];
      const foot: V3 = [fx + sx, ly, s * 0.215];
      limb(k, [hip, knee, ankle, foot], [0.018, 0.014, 0.009, 0.002], [C.chDark, C.chDark, C.chBone]);
      k.add(sph(0.014, 10, 8), 'chitin', SINEW, { p: hip });
    }
  });
  return finalize(k, 0);
}
