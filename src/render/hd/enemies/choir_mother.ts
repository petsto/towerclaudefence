// Choir Mother (organic boss): a centaur-like brood queen. An upright armoured torso with a crested, many-eyed head
// and folded scythe arms rises from a huge shingle-plated birthing abdomen lined with glowing sacs. Her signature is
// the "choir": a fan of hollow chitin pipes on her back, each mouth glowing. Six legs on a slow ripple gait.
import * as THREE from 'three';
import { C, PI, finalize, kit, sph, torus, tube, type Built, type V3 } from '../kit';
import { SINEW, bioSac, limb, rib, stride } from './chorus';

const AB = { x: -0.3, y: 0.46, rx: 0.42, ry: 0.3, rz: 0.34 }; // abdomen ellipsoid
const cross = (dx: number): number => Math.sqrt(Math.max(0.05, 1 - (dx / AB.rx) ** 2));
const PLATE = 0x3c2050; // glossy black-violet dorsal armour

export function choirMother(phase: number): Built {
  const k = kit();
  const bob = 0.012 * Math.cos(phase * PI * 4);
  const sway = 0.025 * Math.sin(phase * PI * 2 - 1);

  // --- abdomen around its centre: shingled dorsal plates with ochre rims, keel spines, side birthing sacs ---
  const nA = k.raw.length;
  k.add(sph(1, 36, 24), 'chitin', C.chBody, { s: [AB.rx, AB.ry, AB.rz] });
  [0.24, 0.08, -0.08, -0.23, -0.35].forEach((dx) => {
    const e = cross(dx);
    k.add(new THREE.SphereGeometry(1, 28, 8, 0, PI * 2, 0, PI * 0.34), 'chitin', PLATE, {
      p: [dx, 0.01, 0], r: [0, 0, 0.22 - dx * 0.5], s: [0.12 + 0.02 * e, AB.ry * e * 1.07, AB.rz * e * 1.05],
    });
    rib(k, [dx - 0.075, 0, 0], AB.rz * cross(dx - 0.075) * 1.02, AB.ry * cross(dx - 0.075) * 1.02, 0.013, C.chPlate, 1.5);
    k.rod([dx, AB.ry * e * 1.05, 0], [dx - 0.08, AB.ry * e * 1.05 + 0.07, 0], 0.02, 'chitin', C.chBone, 0, 10); // keel spine
  });
  for (const s of [-1, 1]) {
    for (const [dx, r] of [[0.18, 0.06], [0.02, 0.075], [-0.14, 0.072], [-0.29, 0.056]] as const) {
      const e = cross(dx), a = 1.3;
      const n: V3 = [0, Math.cos(a), s * Math.sin(a)];
      bioSac(k, [dx, n[1] * AB.ry * e * 0.96, n[2] * AB.rz * e * 0.96], n, r);
    }
  }
  // ovipositor: glowing birth pore at the tail, ringed by bone hooks
  bioSac(k, [-AB.rx + 0.01, -0.05, 0], [-1, 0, 0], 0.06);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2;
    k.rod([-AB.rx, -0.05 + Math.cos(a) * 0.07, Math.sin(a) * 0.07], [-AB.rx - 0.04, -0.05 + Math.cos(a) * 0.1, Math.sin(a) * 0.1], 0.014, 'chitin', C.chBone, 0, 8);
  }
  for (const r of k.raw.slice(nA)) r.geo.rotateX(sway).translate(AB.x, AB.y + bob * 1.3, 0);

  // --- torso, head, scythe arms, choir pipes ---
  const nT = k.raw.length;
  k.add(sph(0.12, 24, 16), 'chitin', SINEW, { p: [0.1, 0.5, 0], s: [1.2, 0.9, 1] }); // waist
  for (const [x, y, r, t] of [[0.19, 0.6, 0.17, -0.5], [0.28, 0.8, 0.155, -0.7], [0.35, 0.97, 0.14, -0.9]] as const) {
    k.add(sph(r, 24, 16), 'chitin', C.chDark, { p: [x, y, 0], r: [0, 0, t], s: [0.9, 0.8, 1.1] });
    k.add(new THREE.SphereGeometry(r * 1.06, 28, 8, 0, PI * 2, 0, PI * 0.36), 'chitin', C.chPlate, { p: [x + 0.01, y, 0], r: [0, 0, t - 0.9], s: [0.9, 0.85, 1.12] });
  }
  // head: long crested skull, three eye pairs, mandibles
  const H: V3 = [0.47, 1.07, 0];
  k.add(sph(0.095, 28, 18), 'chitin', C.chDark, { p: H, r: [0, 0, -0.25], s: [1.45, 0.8, 0.95] });
  k.add(new THREE.SphereGeometry(0.1, 28, 8, 0, PI * 2, 0, PI * 0.4), 'chitin', C.chBone, { p: [H[0] - 0.01, H[1] + 0.01, 0], r: [0, 0, -0.35], s: [1.45, 0.75, 0.9] });
  limb(k, [[H[0] - 0.02, H[1] + 0.06, 0], [H[0] - 0.14, H[1] + 0.12, 0], [H[0] - 0.27, H[1] + 0.12, 0]], [0.04, 0.025, 0], [C.chBone]); // crest
  for (const s of [-1, 1]) {
    for (const [ex, ey, ez, er] of [[0.11, 0.0, 0.04, 0.018], [0.07, 0.03, 0.065, 0.015], [0.02, 0.04, 0.08, 0.012]] as const) {
      k.glow(sph(er, 10, 8), C.chGlow, { p: [H[0] + ex, H[1] + ey, s * ez] }, 8);
    }
    limb(k, [[H[0] + 0.1, H[1] - 0.05, s * 0.03], [H[0] + 0.15, H[1] - 0.1, s * 0.055], [H[0] + 0.17, H[1] - 0.12, s * 0.015]], [0.014, 0.01, 0], [C.chBone]);
    // scythe arms folded mantis-style in front of the chest, serrated blades
    limb(k, [[0.36, 0.9, s * 0.15], [0.48, 0.66, s * 0.25], [0.63, 0.88, s * 0.22], [0.67, 0.74, s * 0.18]], [0.05, 0.04, 0.03, 0], [C.chDark, C.chBone, C.chBone]);
    for (let i = 1; i <= 3; i++) {
      const b: V3 = [0.48 + i * 0.04, 0.66 + i * 0.055, s * (0.25 - i * 0.008)];
      k.rod(b, [b[0] - 0.02, b[1] + 0.035, b[2]], 0.008, 'chitin', C.chBone, 0, 6);
    }
    k.add(tube([[H[0] - 0.05, H[1] - 0.03, s * 0.05], [0.36, 1.0, s * 0.11], [0.3, 0.88, s * 0.14]], 0.013, 8), 'chitin', SINEW); // neck cords
    k.add(tube([[0.16, 0.66, s * 0.12], [0.06, 0.62, s * 0.2], [-0.04, 0.68, s * 0.24]], 0.015, 8), 'chitin', SINEW); // waist cords
  }
  // the choir: five hollow pipes fanning up and back from the shoulders, bone-ringed, glowing mouths
  for (const [z, h] of [[0, 1], [0.1, 0.88], [-0.1, 0.88], [0.2, 0.72], [-0.2, 0.72]] as const) {
    const ps = sway * 0.8;
    const a: V3 = [0.14, 0.78, z * 0.5], b: V3 = [0.04 + ps, 0.8 + 0.2 * h, z * 1.2], c: V3 = [-0.06 + ps * 1.5, 0.8 + 0.36 * h, z * 1.6];
    k.add(tube([a, b, c], 0.034, 12), 'chitin', C.chDark);
    for (const t of [0.4, 0.75]) k.add(torus(0.037, 0.009, 12), 'chitin', C.chBone, { p: [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t], r: [PI / 2, 0, 0.6] });
    const dir = [c[0] - b[0], c[1] - b[1], c[2] - b[2]], l = Math.hypot(...dir);
    const m: V3 = [c[0] + (dir[0]! / l) * 0.04, c[1] + (dir[1]! / l) * 0.04, c[2] + (dir[2]! / l) * 0.04];
    k.rod(c, m, 0.034, 'chitin', C.chBone, 0.052, 16); // flared mouth
    k.glow(sph(0.042, 14, 10), C.chGlow, { p: m, s: [1, 0.55, 1] }, 8);
    k.glow(sph(0.022, 10, 8), 0xffc0ec, { p: [m[0], m[1] + 0.012, m[2]] }, 3);
  }
  for (const r of k.raw.slice(nT)) r.geo.translate(0, bob, 0);

  // --- six legs, slow ripple: each leg swings in turn, front to back down a side, sides half a cycle apart ---
  const LEGS: [V3, V3, V3, number][] = [
    [[0.16, 0.46, 0.14], [0.31, 0.66, 0.4], [0.4, 0, 0.47], 0],
    [[-0.13, 0.38, 0.26], [-0.11, 0.6, 0.54], [-0.09, 0, 0.6], 0.25],
    [[-0.45, 0.36, 0.24], [-0.49, 0.56, 0.46], [-0.52, 0, 0.47], 0.5],
  ];
  for (const [hip0, knee0, foot0, off] of LEGS) {
    for (const s of [-1, 1]) {
      const { dx, lift } = stride(phase + off + (s > 0 ? 0 : 0.5), 0.75);
      const sx = dx * 0.16, ly = lift * 0.1;
      const hip: V3 = [hip0[0], hip0[1] + bob, s * hip0[2]];
      const knee: V3 = [knee0[0] + sx * 0.4, knee0[1] + bob + ly * 0.5, s * knee0[2]];
      const ankle: V3 = [foot0[0] + sx * 0.9 - 0.02, 0.12 + ly, s * (foot0[2] - 0.02)];
      const foot: V3 = [foot0[0] + sx, ly, s * foot0[2]];
      k.add(sph(0.062, 12, 8), 'chitin', SINEW, { p: hip });
      limb(k, [hip, knee, ankle, foot], [0.05, 0.04, 0.026, 0.004], [C.chDark, C.chBone, C.chBone]);
      k.rod(knee, [knee[0] - 0.05, knee[1] + 0.1, knee[2] + s * 0.03], 0.022, 'chitin', C.chBone, 0, 10); // knee spur
    }
  }
  for (const r of k.raw) r.geo.translate(0.05, 0, 0); // centre the mass on the origin: keeps the bake cell compact
  return finalize(k, 0);
}
