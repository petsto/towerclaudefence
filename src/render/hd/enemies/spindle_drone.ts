// Spindle Drone (machine, light): lathe-turned spindle hull hovering on two ducted lift fans, sensor ball with a red
// optic up front, tail fin and stabilisers. Hover cycle: bob, a lazy pitch/roll wobble, fan blades spinning.
import * as THREE from 'three';
import { C, PI, cyl, finalize, kit, rbox, sph, torus, type Built } from '../kit';

const HULL = [[0, -0.19], [0.012, -0.17], [0.03, -0.12], [0.05, -0.06], [0.062, 0], [0.064, 0.04], [0.058, 0.08], [0.045, 0.11], [0.03, 0.125], [0, 0.13]]
  .map(([r, y]) => new THREE.Vector2(r, y));

export function spindleDrone(phase: number): Built {
  const k = kit();
  const a = phase * PI * 2;
  const y = 0.3 + 0.018 * Math.sin(a); // hover bob
  // hull: spindle along X (lathe axis Y rotated onto +X), slightly flattened
  k.add(new THREE.LatheGeometry(HULL, 20), 'metal', C.gun, { p: [0, y, 0], r: [0, 0, -PI / 2], s: [0.85, 1, 1] });
  k.add(torus(0.064, 0.008, 24), 'metal', C.steel, { p: [0.03, y, 0], r: [0, PI / 2, 0], s: [1, 0.85, 1] });
  k.add(torus(0.05, 0.006, 20), 'metal', C.rmSteel, { p: [-0.07, y, 0], r: [0, PI / 2, 0], s: [1, 0.85, 1] });
  // dorsal armour plate with hazard stripe and vent slats
  k.add(rbox(0.17, 0.022, 0.085, 0.008), 'paint', C.rust, { p: [0.0, y + 0.052, 0] });
  for (const s of [-1, 1]) k.add(rbox(0.12, 0.006, 0.014, 0.002), 'hazard', 0xffffff, { p: [0.01, y + 0.064, s * 0.034] });
  for (let i = 0; i < 3; i++) k.add(rbox(0.008, 0.008, 0.05, 0.002), 'metal', C.rmSteel, { p: [-0.05 + i * 0.018, y + 0.066, 0] });
  k.glow(rbox(0.012, 0.004, 0.03, 0.001), C.redGlow, { p: [-0.032, y + 0.062, 0] }, 4);
  // sensor ball, hood and optic
  k.add(sph(0.045, 20, 14), 'metal', C.rmSteel, { p: [0.115, y - 0.005, 0] });
  k.add(new THREE.SphereGeometry(0.05, 20, 8, 0, PI * 2, 0, PI * 0.4), 'metal', C.rmGun, { p: [0.11, y, 0], r: [0, 0, -0.5] });
  k.add(cyl(0.032, 0.036, 0.016, 20), 'metal', C.gunD, { p: [0.155, y - 0.006, 0], r: [0, 0, -PI / 2] });
  k.glow(cyl(0.026, 0.026, 0.006, 20), C.redGlow, { p: [0.164, y - 0.006, 0], r: [0, 0, -PI / 2] });
  k.glow(cyl(0.01, 0.01, 0.004, 12), 0xffb0a0, { p: [0.168, y - 0.006, 0], r: [0, 0, -PI / 2] }, 3);
  for (const s of [-1, 1]) k.glow(sph(0.006, 8, 6), C.redGlow, { p: [0.145, y + 0.022, s * 0.025] }, 5);
  k.glow(rbox(0.03, 0.004, 0.012, 0.001), C.redGlow, { p: [0.125, y + 0.046, 0], r: [0, 0, -0.5] }, 4); // reads from above
  // chin guns
  for (const s of [-1, 1]) {
    k.add(rbox(0.05, 0.02, 0.02, 0.005), 'metal', C.rmSteel, { p: [0.08, y - 0.052, s * 0.025] });
    k.add(cyl(0.005, 0.005, 0.07, 8), 'metal', C.chrome, { p: [0.13, y - 0.054, s * 0.025], r: [0, 0, -PI / 2] });
  }
  // tail: fin, stabilisers, antenna, exhaust nozzle glow
  k.add(rbox(0.07, 0.06, 0.008, 0.004), 'paint', C.rust, { p: [-0.13, y + 0.04, 0], r: [0, 0, 0.5] });
  for (const s of [-1, 1]) k.add(rbox(0.06, 0.006, 0.05, 0.003), 'metal', C.rmGun, { p: [-0.12, y, s * 0.04], r: [s * 0.25, 0, 0] });
  k.rod([-0.03, y + 0.06, -0.02], [-0.06, y + 0.17, -0.03], 0.004, 'metal', C.steel, 0.002, 6);
  k.glow(sph(0.008, 8, 6), C.redGlow, { p: [-0.06, y + 0.172, -0.03] });
  k.glow(cyl(0.012, 0.012, 0.004, 12), 0xff5a1a, { p: [-0.192, y, 0], r: [0, 0, PI / 2] }, 5);
  // ducted lift fans on pylons: blades turn one blade spacing per cycle (3-fold), so phase 0 and 1 match
  for (const s of [-1, 1]) {
    const fz = s * 0.15, fy = y - 0.005;
    k.add(rbox(0.05, 0.02, 0.1, 0.006), 'metal', C.rmSteel, { p: [-0.005, y, s * 0.085] });
    k.add(torus(0.056, 0.014, 28), 'metal', C.rmGun, { p: [-0.005, fy, fz], r: [PI / 2, 0, 0], s: [1, 1, 1.6] });
    k.add(torus(0.07, 0.005, 28), 'metal', C.steel, { p: [-0.005, fy + 0.012, fz], r: [PI / 2, 0, 0] });
    k.add(rbox(0.024, 0.008, 0.016, 0.003), 'hazard', 0xffffff, { p: [0.06, fy + 0.012, fz] });
    k.glow(cyl(0.05, 0.05, 0.004, 24), 0xff3a12, { p: [-0.005, fy - 0.012, fz] }, 1.6);
    k.add(cyl(0.014, 0.016, 0.02, 12), 'metal', C.rmSteel, { p: [-0.005, fy, fz] });
    for (let i = 0; i < 3; i++) {
      const b = (i / 3 + phase / 3) * PI * 2 * s;
      const bm = new THREE.Matrix4().makeTranslation(-0.005 + Math.cos(b) * 0.03, fy + 0.002, fz + Math.sin(b) * 0.03)
        .multiply(new THREE.Matrix4().makeRotationY(-b)).multiply(new THREE.Matrix4().makeRotationX(0.4));
      k.add(rbox(0.05, 0.003, 0.016, 0.0015), 'metal', C.steel, bm);
    }
    for (const x of [-0.04, 0.03]) k.rod([x, fy - 0.01, fz], [x, fy - 0.04, fz], 0.003, 'metal', C.rmSteel, 0.003, 6);
  }
  // lazy pitch / roll wobble about the hull centre; whole drone at 0.85 to sit in the light size class
  const m = new THREE.Matrix4().makeTranslation(0, y, 0).multiply(new THREE.Matrix4().makeScale(0.85, 0.85, 0.85))
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.06 * Math.cos(a), 0, 0.05 * Math.sin(a + 0.8))))
    .multiply(new THREE.Matrix4().makeTranslation(0, -y, 0));
  for (const r of k.raw) r.geo.applyMatrix4(m);
  return finalize(k, 0);
}
