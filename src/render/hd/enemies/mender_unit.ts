// Mender Unit (machine, repair support): hazard-yellow octagonal drum on four crab legs (diagonal trot), welding arm
// and claw arm up front, nanite canisters on the back, and a mast-mounted repair emitter (green core, four prongs)
// that turns a quarter turn per cycle. Green is the repair tell: the priority target should read at a glance.
import * as THREE from 'three';
import { C, PI, cyl, finalize, kit, rbox, sph, torus, tube, type Built, type V3 } from '../kit';

const YEL = 0xc49a2c; // repair-crew hazard paint
const REP = 0x5cff3a; // repair glow (gains kept low so it stays green after the bake clamp)

export function menderUnit(phase: number): Built {
  const k = kit();
  const a = phase * PI * 2;
  const bob = 0.008 * Math.cos(2 * a);
  const by = 0.25 + bob; // drum centre
  // --- legs: hips on the drum, diagonal pairs half a cycle apart; swing forward lifted, stance sweeps back ---------
  for (let i = 0; i < 4; i++) {
    const ang = PI / 4 + (i * PI) / 2, cx = Math.cos(ang), cz = Math.sin(ang);
    const g = (a + (i % 2) * PI);
    const dx = 0.035 * Math.cos(g), lift = 0.03 * Math.max(0, Math.sin(g));
    const hip: V3 = [cx * 0.12, by - 0.04, cz * 0.12];
    const knee: V3 = [cx * 0.23 + dx * 0.5, 0.29 + lift * 0.7 + bob * 0.5, cz * 0.23];
    const foot: V3 = [cx * 0.27 + dx, 0.02 + lift, cz * 0.27];
    k.add(sph(0.032, 14, 10), 'metal', C.rmSteel, { p: hip });
    k.strut(hip, knee, 0.04, 0.035, 'paint', YEL);
    k.add(sph(0.026, 12, 10), 'metal', C.steel, { p: knee });
    k.strut(knee, foot, 0.03, 0.03, 'metal', C.rmGun);
    // piston along the upper leg
    const mid: V3 = [(hip[0] + knee[0]) / 2, (hip[1] + knee[1]) / 2 + 0.035, (hip[2] + knee[2]) / 2];
    k.rod([hip[0], hip[1] + 0.03, hip[2]], mid, 0.009, 'metal', C.rmSteel, 0.009, 8);
    k.rod(mid, [knee[0], knee[1] + 0.02, knee[2]], 0.005, 'metal', C.chrome, 0.005, 8);
    k.add(cyl(0.028, 0.034, 0.02, 10), 'metal', C.rmSteel, { p: [foot[0], foot[1] - 0.01, foot[2]] });
  }
  const n0 = k.raw.length;
  // --- drum hull -------------------------------------------------------------------------------------------------
  k.add(cyl(0.155, 0.165, 0.15, 8), 'paint', YEL, { p: [0, 0.25, 0], r: [0, PI / 8, 0] });
  k.add(cyl(0.17, 0.17, 0.028, 8), 'hazard', 0xffffff, { p: [0, 0.215, 0], r: [0, PI / 8, 0] });
  k.add(cyl(0.16, 0.13, 0.05, 8), 'metal', C.rmGun, { p: [0, 0.155, 0], r: [0, PI / 8, 0] });
  k.add(cyl(0.09, 0.05, 0.04, 8), 'metal', C.rmSteel, { p: [0, 0.115, 0] });
  k.add(cyl(0.135, 0.158, 0.03, 8), 'paint', YEL, { p: [0, 0.34, 0], r: [0, PI / 8, 0] });
  for (let i = 0; i < 16; i++) {
    const b = (i / 16) * PI * 2;
    k.add(cyl(0.007, 0.007, 0.008, 6), 'metal', C.steel, { p: [Math.cos(b) * 0.162, 0.3, Math.sin(b) * 0.162], r: [0, -b, PI / 2] });
  }
  // side vent grilles
  for (const s of [-1, 1]) {
    k.add(rbox(0.1, 0.05, 0.012, 0.004), 'metal', C.gunD, { p: [-0.02, 0.27, s * 0.155] });
    for (let j = 0; j < 4; j++) k.add(rbox(0.09, 0.006, 0.014, 0.002), 'metal', C.steel, { p: [-0.02, 0.254 + j * 0.011, s * 0.16] });
  }
  // --- sensor head: visor block, main optic + two pips -------------------------------------------------------------
  k.add(rbox(0.07, 0.07, 0.12, 0.012), 'metal', C.rmSteel, { p: [0.165, 0.28, 0] });
  k.add(rbox(0.05, 0.016, 0.13, 0.005), 'metal', C.rmGun, { p: [0.18, 0.322, 0] });
  k.add(cyl(0.024, 0.028, 0.02, 16), 'metal', C.gunD, { p: [0.205, 0.285, 0], r: [0, 0, -PI / 2] });
  k.glow(cyl(0.018, 0.018, 0.006, 16), C.redGlow, { p: [0.216, 0.285, 0] , r: [0, 0, -PI / 2] });
  for (const s of [-1, 1]) k.glow(sph(0.008, 8, 6), C.redGlow, { p: [0.202, 0.305, s * 0.04] }, 6);
  // --- arms: welder (left, -Z) and claw (right, +Z), working with the gait -----------------------------------------
  const w = 0.015 * Math.sin(a);
  for (const s of [-1, 1]) {
    const sh: V3 = [0.12, 0.23, s * 0.1], el: V3 = [0.2, 0.17 + s * w, s * 0.15], wr: V3 = [0.27, 0.2 - s * w, s * 0.12];
    k.add(sph(0.022, 12, 8), 'metal', C.rmSteel, { p: sh });
    k.strut(sh, el, 0.022, 0.022, 'metal', C.rmGun);
    k.add(sph(0.016, 10, 8), 'metal', C.steel, { p: el });
    k.strut(el, wr, 0.016, 0.016, 'paint', YEL);
    if (s < 0) {
      k.rod(wr, [wr[0] + 0.05, wr[1] - 0.015, wr[2]], 0.009, 'metal', C.chrome, 0.004, 8);
      k.glow(sph(0.01, 8, 6), REP, { p: [wr[0] + 0.055, wr[1] - 0.017, wr[2]] }, 2.5);
    } else {
      for (const f of [-1, 1]) k.rod(wr, [wr[0] + 0.045, wr[1] + f * 0.018, wr[2]], 0.006, 'metal', C.steel, 0.003, 6);
    }
  }
  // --- back: nanite canisters with lit gauges, hoses up to the mast -------------------------------------------------
  for (const s of [-1, 1]) {
    const cz = s * 0.06;
    k.add(cyl(0.032, 0.032, 0.12, 14), 'metal', C.rmGun, { p: [-0.165, 0.27, cz] });
    k.add(cyl(0.035, 0.035, 0.012, 14), 'metal', C.steel, { p: [-0.165, 0.33, cz] });
    k.add(cyl(0.035, 0.035, 0.012, 14), 'metal', C.steel, { p: [-0.165, 0.215, cz] });
    k.glow(rbox(0.006, 0.07, 0.016, 0.002), REP, { p: [-0.197, 0.27, cz] }, 1.6);
    k.add(tube([[-0.165, 0.335, cz], [-0.12, 0.38, cz * 0.7], [-0.03, 0.4, cz * 0.4]], 0.007), 'metal', C.rubber);
  }
  // --- mast and repair emitter --------------------------------------------------------------------------------------
  k.add(cyl(0.05, 0.065, 0.04, 12), 'metal', C.rmSteel, { p: [0, 0.37, 0] });
  k.add(cyl(0.022, 0.026, 0.1, 12), 'metal', C.steel, { p: [0, 0.43, 0] });
  k.add(cyl(0.13, 0.04, 0.035, 24), 'paint', YEL, { p: [0, 0.49, 0] });
  k.add(torus(0.13, 0.008, 32), 'metal', C.rmSteel, { p: [0, 0.508, 0], r: [PI / 2, 0, 0] });
  k.add(cyl(0.11, 0.11, 0.004, 24), 'metal', C.steel, { p: [0, 0.506, 0] });
  k.glow(sph(0.032, 16, 12), REP, { p: [0, 0.55, 0] }, 2.2);
  k.glow(sph(0.018, 12, 8), 0xd0ffc0, { p: [0, 0.556, 0.012] }, 1.6);
  k.glow(torus(0.07, 0.004, 24), REP, { p: [0, 0.512, 0], r: [PI / 2, 0, 0] }, 1.5);
  // prongs, 4-fold: a quarter turn per cycle keeps phase 0 and 1 identical
  const n1 = k.raw.length;
  for (let i = 0; i < 4; i++) {
    const b = (i / 4) * PI * 2, cx = Math.cos(b), cz = Math.sin(b);
    k.rod([cx * 0.11, 0.51, cz * 0.11], [cx * 0.075, 0.6, cz * 0.075], 0.008, 'metal', C.steel, 0.004, 8);
    k.add(rbox(0.024, 0.024, 0.024, 0.005), 'metal', C.rmSteel, { p: [cx * 0.11, 0.515, cz * 0.11] });
    k.glow(sph(0.008, 8, 6), REP, { p: [cx * 0.074, 0.603, cz * 0.074] }, 2.2);
  }
  const m = new THREE.Matrix4().makeRotationY(-phase * PI / 2);
  for (const r of k.raw.slice(n1)) r.geo.applyMatrix4(m);
  for (const r of k.raw.slice(n0)) r.geo.translate(0, bob, 0);
  return finalize(k, 0);
}
