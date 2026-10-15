// Foundry Colossus (machine boss): a walking smelter. Rust chassis on four tracked bogies splayed in an X, each on a
// hydraulic leg; a banded furnace tower crowned by a glowing crucible, a grilled furnace mouth and a red optic
// cluster up front, twin smokestacks behind. Cycle: treads scroll, bogies work their suspension, hull heaves and
// rolls, the furnace glow breathes.
import * as THREE from 'three';
import { C, PI, cyl, finalize, kit, rbox, sph, torus, tube, type Built, type V3 } from '../kit';
import { track, xformFrom } from './anvil_tread';

const HOT = 0xff5a1a;

export function foundryColossus(phase: number): Built {
  const k = kit();
  const a = phase * PI * 2;
  const heat = 2.4 + 0.7 * Math.sin(a); // furnace glow gain: breathes, stays molten orange rather than clipping white
  // --- bogies: tracked pods in an X, each on a hydraulic leg ------------------------------------------------------
  let bi = 0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const n = k.raw.length;
    const sus = 0.008 * Math.sin(a + bi++ * PI / 2); // suspension travel
    track(k, 0, 0.4, 0.07, 0.14, phase);
    k.add(rbox(0.14, 0.05, 0.1, 0.012), 'metal', C.rmGun, { p: [0, 0.165, 0] });
    k.add(rbox(0.1, 0.012, 0.16, 0.004), 'hazard', 0xffffff, { p: [0, 0.195, 0] });
    for (const z of [-0.08, 0.08]) k.add(cyl(0.022, 0.022, 0.02, 12), 'metal', C.steel, { p: [0, 0.16, z], r: [PI / 2, 0, 0] });
    // leg: housing down from the chassis, chrome piston into the bogie
    k.add(rbox(0.09, 0.1, 0.09, 0.015), 'metal', C.rmSteel, { p: [0, 0.3 - sus, 0] });
    k.rod([0, 0.19, 0], [0, 0.26 - sus, 0], 0.024, 'metal', C.chrome, 0.024, 14);
    k.add(cyl(0.034, 0.034, 0.02, 14), 'metal', C.rmGun, { p: [0, 0.255 - sus, 0] });
    const m = new THREE.Matrix4().makeTranslation(sx * 0.31, sus, sz * 0.27).multiply(new THREE.Matrix4().makeRotationY(-sx * sz * 0.5));
    xformFrom(k, n, m);
  }
  const n0 = k.raw.length;
  // --- chassis -----------------------------------------------------------------------------------------------------
  k.add(rbox(0.6, 0.08, 0.42, 0.02), 'metal', C.rmSteel, { p: [0, 0.29, 0] });
  k.add(rbox(0.84, 0.3, 0.62, 0.04, 2), 'paint', C.rust, { p: [0, 0.45, 0] });
  k.add(rbox(0.86, 0.035, 0.64, 0.01), 'hazard', 0xffffff, { p: [0, 0.555, 0] });
  k.add(rbox(0.8, 0.03, 0.58, 0.01), 'metal', C.gun, { p: [0, 0.6, 0] });
  for (const s of [-1, 1]) {
    // riveted side armour and a heat vent
    for (const x of [-0.2, 0.12]) {
      k.add(rbox(0.26, 0.18, 0.025, 0.01), 'metal', C.rmGun, { p: [x, 0.44, s * 0.315] });
      for (const y of [0.37, 0.51]) for (let i = 0; i < 6; i++) k.add(cyl(0.008, 0.008, 0.008, 6), 'metal', C.steel, { p: [x - 0.11 + i * 0.044, y, s * 0.33], r: [PI / 2, 0, 0] });
    }
    k.add(rbox(0.1, 0.1, 0.012, 0.004), 'metal', C.gunD, { p: [-0.04, 0.44, s * 0.33] });
    k.glow(rbox(0.08, 0.08, 0.004, 0.002), HOT, { p: [-0.04, 0.44, s * 0.335] }, heat * 0.6);
    for (let j = 0; j < 5; j++) k.add(rbox(0.09, 0.008, 0.012, 0.002), 'metal', C.steel, { p: [-0.04, 0.405 + j * 0.018, s * 0.34] });
  }
  // front: furnace mouth behind a grille, armoured cheeks, optic cluster
  k.add(rbox(0.05, 0.2, 0.4, 0.012), 'metal', C.rmSteel, { p: [0.42, 0.43, 0] });
  k.glow(rbox(0.02, 0.14, 0.32, 0.004), HOT, { p: [0.44, 0.42, 0] }, heat);
  for (let i = 0; i < 8; i++) k.add(rbox(0.016, 0.16, 0.014, 0.004), 'metal', C.rmGun, { p: [0.455, 0.42, -0.14 + i * 0.04] });
  k.add(rbox(0.06, 0.03, 0.42, 0.008), 'metal', C.steel, { p: [0.45, 0.515, 0] });
  for (const s of [-1, 1]) {
    k.add(rbox(0.12, 0.26, 0.11, 0.02), 'metal', C.rmGun, { p: [0.4, 0.42, s * 0.27], r: [0, s * 0.35, 0] });
    k.add(rbox(0.02, 0.18, 0.09, 0.006), 'hazard', 0xffffff, { p: [0.455, 0.42, s * 0.29], r: [0, s * 0.35, 0] });
  }
  // --- furnace tower ------------------------------------------------------------------------------------------------
  const fx = -0.06;
  k.add(rbox(0.46, 0.36, 0.44, 0.03, 2), 'paint', C.rust, { p: [fx, 0.79, 0] });
  for (const y of [0.68, 0.8, 0.92]) k.add(rbox(0.475, 0.025, 0.455, 0.008), 'metal', C.rmSteel, { p: [fx, y, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(rbox(0.04, 0.38, 0.04, 0.01), 'metal', C.steel, { p: [fx + sx * 0.225, 0.79, sz * 0.215] });
  // furnace door: glowing slot with louvres
  k.add(rbox(0.03, 0.22, 0.16, 0.008), 'metal', C.rmSteel, { p: [fx + 0.235, 0.79, 0] });
  k.glow(rbox(0.006, 0.18, 0.11, 0.002), HOT, { p: [fx + 0.252, 0.79, 0] }, heat);
  for (let j = 0; j < 6; j++) k.add(rbox(0.02, 0.008, 0.13, 0.002), 'metal', C.gunD, { p: [fx + 0.26, 0.715 + j * 0.03, 0], r: [0, 0, -0.5] });
  // optic cluster above the mouth
  k.add(rbox(0.08, 0.06, 0.24, 0.012), 'metal', C.rmSteel, { p: [0.2, 0.64, 0] });
  k.add(rbox(0.1, 0.016, 0.26, 0.005), 'metal', C.rmGun, { p: [0.21, 0.677, 0] });
  for (const z of [-0.075, 0, 0.075]) {
    const r = z === 0 ? 0.024 : 0.016;
    k.add(cyl(r + 0.006, r + 0.008, 0.02, 16), 'metal', C.gunD, { p: [0.245, 0.64, z], r: [0, 0, -PI / 2] });
    k.glow(cyl(r, r, 0.006, 16), C.redGlow, { p: [0.256, 0.64, z], r: [0, 0, -PI / 2] });
  }
  // crucible crown: molten pool in a banded ring
  k.add(cyl(0.17, 0.2, 0.08, 16), 'metal', C.rmSteel, { p: [fx, 1.0, 0] });
  k.add(torus(0.17, 0.016, 32), 'metal', C.steel, { p: [fx, 1.04, 0], r: [PI / 2, 0, 0] });
  k.glow(cyl(0.15, 0.15, 0.006, 24), HOT, { p: [fx, 1.036, 0] }, heat);
  k.glow(cyl(0.08, 0.08, 0.008, 20), 0xffa040, { p: [fx, 1.039, 0] }, heat * 0.75);
  for (let i = 0; i < 8; i++) {
    const b = (i / 8) * PI * 2;
    k.add(rbox(0.03, 0.09, 0.03, 0.006), 'metal', C.rmGun, { p: [fx + Math.cos(b) * 0.2, 0.99, Math.sin(b) * 0.2], r: [0, -b, 0] });
  }
  // --- smokestacks and pipework -------------------------------------------------------------------------------------
  for (const s of [-1, 1]) {
    const sx = -0.33, sz = s * 0.19;
    k.add(cyl(0.055, 0.068, 0.62, 16), 'metal', C.rmSteel, { p: [sx, 0.92, sz] });
    for (const y of [0.75, 0.95, 1.15]) k.add(cyl(0.064, 0.064, 0.022, 16), 'metal', C.steel, { p: [sx, y, sz] });
    k.add(cyl(0.07, 0.06, 0.04, 16), 'metal', C.rmGun, { p: [sx, 1.245, sz] });
    k.add(cyl(0.048, 0.048, 0.004, 16), 'metal', C.bore, { p: [sx, 1.266, sz] });
    k.glow(cyl(0.03, 0.03, 0.004, 12), HOT, { p: [sx, 1.268, sz] }, heat * 0.6);
    k.add(rbox(0.04, 0.12, 0.012, 0.004), 'hazard', 0xffffff, { p: [sx + 0.05, 1.05, sz], r: [0, 0, 0] });
    k.add(tube([[fx - 0.23, 0.86, s * 0.12], [sx + 0.02, 0.88, s * 0.15], [sx + 0.02, 0.98, sz]], 0.014), 'metal', C.rmGun);
  }
  // rear radiator block
  k.add(rbox(0.1, 0.18, 0.4, 0.015), 'metal', C.rmGun, { p: [-0.41, 0.46, 0] });
  for (let j = 0; j < 7; j++) k.add(rbox(0.02, 0.008, 0.36, 0.002), 'metal', C.rmSteel, { p: [-0.468, 0.39 + j * 0.022, 0] });
  // beacon mast
  const mt: V3 = [fx - 0.18, 0.97, -0.17];
  k.rod(mt, [mt[0] - 0.02, mt[1] + 0.22, mt[2]], 0.006, 'metal', C.steel, 0.004, 6);
  k.glow(sph(0.014, 10, 8), C.redGlow, { p: [mt[0] - 0.02, mt[1] + 0.225, mt[2]] });
  // hull heaves twice per cycle and rolls once
  const m = new THREE.Matrix4().makeTranslation(0, 0.008 * Math.cos(2 * a), 0).multiply(new THREE.Matrix4().makeRotationX(0.012 * Math.sin(a)));
  xformFrom(k, n0, m);
  return finalize(k, 0);
}
