// Anvil Tread (machine, heavy): low tracked hull with a sloped hazard-striped glacis, a hydraulic ram plate up front,
// twin red optics, engine deck with glowing grilles and exhaust stacks. Treads scroll one link per cycle, wheels turn,
// the hull rocks and rumbles.
import * as THREE from 'three';
import { C, PI, cyl, finalize, kit, rbox, sph, tube, type Built, type Kit } from '../kit';

const LINK = 0.05; // track link pitch
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d); // ponytail: unbevelled, links are too small to show a bevel

/** Apply m to every part added since raw index n0. */
export const xformFrom = (k: Kit, n0: number, m: THREE.Matrix4): void => {
  for (const r of k.raw.slice(n0)) r.geo.applyMatrix4(m);
};

/**
 * Track run along X centred at (0, 0, z), resting on y = 0: link loop (scrolls one LINK per cycle, so phase 0 and 1
 * match), toothed sprockets at both ends, road wheels along the bottom. `len` ≈ overall length, `R` = end radius.
 */
export function track(k: Kit, z: number, len: number, R: number, w: number, phase: number): void {
  const t = 0.016; // link thickness
  const n = Math.round((2 * (len - 2 * R) + 2 * PI * R) / LINK);
  const S = (n * LINK - 2 * PI * R) / 2, L = n * LINK, cy = R + t / 2;
  for (let i = 0; i < n; i++) {
    const s = (i + phase) * LINK % L;
    let x: number, y: number, tx: number, ty: number;
    if (s < S) [x, y, tx, ty] = [S / 2 - s, t / 2, -1, 0];
    else if (s < S + PI * R) {
      const f = -PI / 2 - (s - S) / R;
      [x, y, tx, ty] = [-S / 2 + R * Math.cos(f), cy + R * Math.sin(f), Math.sin(f), -Math.cos(f)];
    } else if (s < 2 * S + PI * R) [x, y, tx, ty] = [-S / 2 + (s - S - PI * R), cy + R, 1, 0];
    else {
      const f = PI / 2 - (s - 2 * S - PI * R) / R;
      [x, y, tx, ty] = [S / 2 + R * Math.cos(f), cy + R * Math.sin(f), Math.sin(f), -Math.cos(f)];
    }
    const rz = Math.atan2(ty, tx), nx = -ty, ny = tx; // outward normal
    k.add(box(LINK * 0.86, t, w), 'metal', C.rmSteel, { p: [x, y, z], r: [0, 0, rz] });
    k.add(box(LINK * 0.3, t * 0.7, w * 1.02), 'metal', C.gunD, { p: [x + nx * t * 0.6, y + ny * t * 0.6, z], r: [0, 0, rz] });
    k.add(box(LINK * 0.4, t * 0.5, w * 0.16), 'metal', C.steel, { p: [x - nx * t * 0.7, y - ny * t * 0.7, z], r: [0, 0, rz] });
  }
  // sprockets: tooth pitch = LINK, turned one tooth per cycle
  const rs = R - t * 0.6, teeth = Math.round((2 * PI * rs) / LINK);
  for (const sx of [-1, 1]) {
    const px = sx * S / 2;
    k.add(cyl(rs * 0.82, rs * 0.82, w * 0.9, 16), 'metal', C.rmGun, { p: [px, cy, z], r: [PI / 2, 0, 0] });
    k.add(cyl(rs * 0.35, rs * 0.35, w * 1.1, 12), 'metal', C.steel, { p: [px, cy, z], r: [PI / 2, 0, 0] });
    for (let i = 0; i < teeth; i++) {
      const b = ((i + phase) / teeth) * PI * 2; // top moves forward with the upper run
      k.add(box(0.016, rs * 0.3, w * 0.3), 'metal', C.steel, { p: [px + Math.sin(b) * rs * 0.92, cy + Math.cos(b) * rs * 0.92, z], r: [0, 0, -b] });
    }
  }
  // road wheels: 5 bolts each, turned one bolt spacing per cycle
  const rw = R * 0.62, nw = Math.max(2, Math.round(S / (rw * 2.3)));
  for (let j = 0; j < nw; j++) {
    const px = -S / 2 + (S * (j + 0.5)) / nw, wy = t + rw;
    for (const dz of [-1, 1]) k.add(cyl(rw, rw, w * 0.36, 14), 'metal', C.rmGun, { p: [px, wy, z + dz * w * 0.27], r: [PI / 2, 0, 0] });
    k.add(cyl(rw * 0.45, rw * 0.45, w * 1.04, 12), 'metal', C.rmSteel, { p: [px, wy, z], r: [PI / 2, 0, 0] });
    for (let i = 0; i < 5; i++) {
      const b = ((i + phase) / 5) * PI * 2;
      k.add(cyl(rw * 0.12, rw * 0.12, 0.006, 6), 'metal', C.steel, { p: [px + Math.sin(b) * rw * 0.62, wy + Math.cos(b) * rw * 0.62, z + Math.sign(z || 1) * w * 0.46], r: [PI / 2, 0, 0] }); // outer face only
    }
  }
}

export function anvilTread(phase: number): Built {
  const k = kit();
  const a = phase * PI * 2;
  for (const s of [-1, 1]) track(k, s * 0.205, 0.78, 0.075, 0.13, phase);
  const n0 = k.raw.length;
  // lower hull between the tracks, fender deck over them
  k.add(rbox(0.66, 0.16, 0.28, 0.02), 'metal', C.rmSteel, { p: [-0.02, 0.15, 0] });
  k.add(rbox(0.7, 0.035, 0.54, 0.012), 'metal', C.rmGun, { p: [-0.02, 0.2, 0] });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 9; i++) k.add(cyl(0.007, 0.007, 0.006, 6), 'metal', C.steel, { p: [-0.34 + i * 0.075, 0.214, s * 0.268], r: [PI / 2, 0, 0] });
  }
  // casemate: rust armour with gunmetal side plates, sloped glacis
  k.add(rbox(0.42, 0.16, 0.38, 0.03, 2), 'paint', C.rust, { p: [-0.05, 0.3, 0] });
  for (const s of [-1, 1]) {
    k.add(rbox(0.36, 0.12, 0.025, 0.01), 'metal', C.rmGun, { p: [-0.06, 0.3, s * 0.195] });
    for (const y of [0.255, 0.345]) for (let i = 0; i < 7; i++) k.add(cyl(0.007, 0.007, 0.008, 6), 'metal', C.steel, { p: [-0.21 + i * 0.05, y, s * 0.21], r: [PI / 2, 0, 0] });
  }
  k.add(rbox(0.22, 0.03, 0.4, 0.012), 'metal', C.rmGun, { p: [0.22, 0.29, 0], r: [0, 0, -0.62] });
  k.add(rbox(0.16, 0.034, 0.3, 0.006), 'hazard', 0xffffff, { p: [0.225, 0.296, 0], r: [0, 0, -0.62] });
  // twin optics in hooded sockets, vision slit
  for (const s of [-1, 1]) {
    k.add(cyl(0.035, 0.04, 0.05, 20), 'metal', C.rmSteel, { p: [0.17, 0.34, s * 0.1], r: [0, 0, -PI / 2 + 0.4] });
    k.glow(cyl(0.027, 0.027, 0.008, 20), C.redGlow, { p: [0.195, 0.351, s * 0.1], r: [0, 0, -PI / 2 + 0.4] });
    k.add(rbox(0.06, 0.012, 0.08, 0.004), 'metal', C.rmGun, { p: [0.175, 0.378, s * 0.1] });
  }
  k.glow(rbox(0.006, 0.01, 0.1, 0.002), C.redGlow, { p: [0.155, 0.37, 0] }, 4);
  // roof: sensor cupola, hatch, antenna
  k.add(cyl(0.065, 0.075, 0.045, 8), 'metal', C.rmGun, { p: [0.02, 0.4, -0.05] });
  k.add(cyl(0.05, 0.05, 0.012, 8), 'metal', C.rmSteel, { p: [0.02, 0.428, -0.05] });
  k.glow(rbox(0.006, 0.012, 0.05, 0.002), C.redGlow, { p: [0.088, 0.402, -0.05] }, 4);
  k.add(rbox(0.09, 0.012, 0.09, 0.004), 'metal', C.rmSteel, { p: [-0.1, 0.386, 0.08] });
  k.rod([-0.2, 0.38, -0.14], [-0.24, 0.62, -0.16], 0.005, 'metal', C.steel, 0.003, 6);
  k.glow(sph(0.01, 8, 6), C.redGlow, { p: [-0.24, 0.625, -0.16] });
  // engine deck: grille over a glowing heat vent, exhaust stacks
  k.add(rbox(0.2, 0.09, 0.4, 0.015), 'metal', C.rmGun, { p: [-0.3, 0.27, 0] });
  k.glow(rbox(0.15, 0.004, 0.3, 0.002), 0xff3a12, { p: [-0.3, 0.315, 0] }, 1.8);
  for (let i = 0; i < 6; i++) k.add(rbox(0.012, 0.012, 0.32, 0.003), 'metal', C.rmSteel, { p: [-0.36 + i * 0.024, 0.322, 0] });
  for (const z of [-0.13, 0.13]) {
    k.add(cyl(0.024, 0.028, 0.15, 16), 'metal', C.rmSteel, { p: [-0.36, 0.37, z] });
    k.add(cyl(0.031, 0.031, 0.016, 16), 'metal', C.steel, { p: [-0.36, 0.44, z] });
    k.glow(cyl(0.02, 0.02, 0.004, 12), 0xff3a12, { p: [-0.36, 0.448, z] }, 1.5);
  }
  // ram plate on hydraulic rams
  k.add(rbox(0.06, 0.15, 0.58, 0.015, 2), 'metal', C.steel, { p: [0.43, 0.16, 0], r: [0, 0, 0.12] });
  k.add(rbox(0.02, 0.05, 0.56, 0.006), 'hazard', 0xffffff, { p: [0.462, 0.18, 0], r: [0, 0, 0.12] });
  k.add(rbox(0.035, 0.02, 0.6, 0.006), 'metal', C.rmSteel, { p: [0.45, 0.095, 0] });
  for (const z of [-0.12, 0.12]) {
    k.rod([0.28, 0.21, z], [0.36, 0.18, z], 0.02, 'metal', C.rmSteel, 0.02, 12);
    k.rod([0.36, 0.18, z], [0.41, 0.165, z], 0.011, 'metal', C.chrome, 0.011, 12);
  }
  for (const s of [-1, 1]) k.add(tube([[0.12, 0.25, s * 0.14], [0.22, 0.24, s * 0.16], [0.3, 0.21, s * 0.14]], 0.008), 'metal', C.rubber);
  // heavy hull rocks in pitch and rumbles twice per cycle
  const m = new THREE.Matrix4().makeTranslation(0, 0.004 * Math.cos(2 * a), 0).multiply(new THREE.Matrix4().makeRotationZ(0.012 * Math.sin(a)));
  xformFrom(k, n0, m);
  return finalize(k, 0);
}
