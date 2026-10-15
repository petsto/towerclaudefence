// Rivet Walker (machine): rusted riveted hull on two digitigrade piston legs, red optic, twin exhaust stacks.
import { C, PI, cyl, finalize, kit, rbox, sph, tube, type Built, type V3 } from '../kit';

export function rivetWalker(phase: number): Built {
  const k = kit();
  const bob = 0.012 * Math.cos(phase * PI * 4); // hull dips at each footfall
  const n0 = k.raw.length;
  k.add(rbox(0.3, 0.2, 0.28, 0.04, 2), 'paint', C.rust, { p: [0, 0.43, 0] });
  k.add(rbox(0.09, 0.17, 0.26, 0.025, 2), 'metal', C.rmGun, { p: [0.15, 0.42, 0], r: [0, 0, -0.35] });
  for (const s of [-1, 1]) {
    k.add(rbox(0.24, 0.15, 0.03, 0.012), 'metal', C.rmGun, { p: [-0.01, 0.42, s * 0.15] });
    for (const y of [0.365, 0.475]) for (let i = 0; i < 6; i++) k.add(cyl(0.008, 0.008, 0.008, 8), 'metal', C.steel, { p: [-0.11 + i * 0.04, y, s * 0.167], r: [PI / 2, 0, 0] });
  }
  k.add(rbox(0.2, 0.016, 0.1, 0.006), 'hazard', 0xffffff, { p: [-0.03, 0.538, 0] });
  // optic with hood
  k.add(cyl(0.055, 0.062, 0.07, 24), 'metal', C.rmSteel, { p: [0.2, 0.45, 0], r: [0, 0, -PI / 2] });
  k.glow(cyl(0.04, 0.04, 0.01, 24), C.redGlow, { p: [0.236, 0.45, 0], r: [0, 0, -PI / 2] });
  k.add(rbox(0.09, 0.02, 0.13, 0.006), 'metal', C.rmGun, { p: [0.21, 0.508, 0] });
  // exhaust stacks, antenna, chin gun
  for (const z of [-0.07, 0.07]) {
    k.add(cyl(0.022, 0.026, 0.12, 16), 'metal', C.rmSteel, { p: [-0.11, 0.58, z] });
    k.add(cyl(0.029, 0.029, 0.016, 16), 'metal', C.steel, { p: [-0.11, 0.645, z] });
    k.add(cyl(0.018, 0.018, 0.004, 12), 'metal', C.bore, { p: [-0.11, 0.654, z] });
  }
  k.rod([-0.06, 0.53, -0.1], [-0.08, 0.76, -0.12], 0.005, 'metal', C.steel, 0.003, 6);
  k.glow(sph(0.011, 10, 8), C.redGlow, { p: [-0.08, 0.765, -0.12] });
  k.add(rbox(0.08, 0.05, 0.06, 0.01), 'metal', C.rmSteel, { p: [0.14, 0.34, 0.08] });
  k.add(cyl(0.013, 0.013, 0.14, 12), 'metal', C.chrome, { p: [0.24, 0.34, 0.08], r: [0, 0, -PI / 2] });
  k.add(rbox(0.16, 0.08, 0.3, 0.02), 'metal', C.rmSteel, { p: [-0.02, 0.31, 0] });
  for (const r of k.raw.slice(n0)) r.geo.translate(0, bob, 0);
  // hips + digitigrade piston legs, half a cycle apart: swing forward with the foot lifted, stance sweeps back
  for (const s of [-1, 1]) {
    const z = s * 0.17;
    const a = (phase + (s > 0 ? 0 : 0.5)) * PI * 2;
    const dx = 0.06 * Math.cos(a), lift = 0.04 * Math.max(0, Math.sin(a));
    const hip: V3 = [-0.02, 0.31 + bob, z], knee: V3 = [0.07 + dx * 0.4, 0.17 + lift * 0.6 + bob * 0.5, z], ankle: V3 = [-0.02 + dx, 0.05 + lift, z];
    k.add(cyl(0.05, 0.05, 0.05, 20), 'metal', C.rmSteel, { p: hip, r: [PI / 2, 0, 0] });
    k.strut(hip, knee, 0.055, 0.05, 'metal', C.rmGun);
    k.add(cyl(0.034, 0.034, 0.064, 20), 'metal', C.steel, { p: knee, r: [PI / 2, 0, 0] });
    k.strut(knee, ankle, 0.045, 0.045, 'paint', C.rust);
    // piston: cylinder from the hip housing, chrome rod to just above the knee
    const mid: V3 = [(hip[0] + knee[0]) / 2 + 0.03, (hip[1] + knee[1]) / 2, s * 0.205];
    k.rod([hip[0] + 0.02, hip[1] - 0.02, s * 0.205], mid, 0.014, 'metal', C.rmSteel, 0.014, 12);
    k.rod(mid, [knee[0], knee[1] + 0.03, s * 0.205], 0.008, 'metal', C.chrome, 0.008, 12);
    k.add(cyl(0.024, 0.024, 0.056, 16), 'metal', C.rmSteel, { p: ankle, r: [PI / 2, 0, 0] });
    k.add(rbox(0.15, 0.035, 0.085, 0.012), 'metal', C.rmGun, { p: [dx, 0.0175 + lift, z] });
    for (const dz of [-0.025, 0.025]) k.add(rbox(0.045, 0.025, 0.03, 0.008), 'metal', C.rmSteel, { p: [0.09 + dx, 0.0125 + lift, z + dz] });
    k.add(tube([[-0.1, 0.36 + bob, s * 0.12], [-0.08, 0.25 + bob, s * 0.2], [knee[0] - 0.03, knee[1] + 0.01, s * 0.2]], 0.008), 'metal', C.rubber);
  }
  return finalize(k, 0);
}
