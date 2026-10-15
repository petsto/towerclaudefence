// Breacher Missile Pod: yoke-mounted missile box pitched up on a trunnion, radar mast behind.
// L1 one 3x3 pod. L2 bigger 4x4 pod with hazard-edged side skirts and roof armour, hydraulic rams, deck ammo crates.
// L3 twin 3x3 pods flanking a central targeting head with a dish mast, blast shields, hazard corner buttresses.
import * as THREE from 'three';
import { C, DECK, PI, cyl, finalize, kit, plinth, rbox, sph, tube, turretRing, type Built, type G, type Kit, type Level } from '../kit';

const TY = 0.3; // trunnion height above the pivot (L1/L3)

/**
 * One missile box centred at (0, ty, cz) with cols×rows tubes; pushes every part into `out` (pitched later).
 * armour: roof plate + rivets; skirts: sides (-1/1) that get a bolted, hazard-edged side skirt.
 */
function pod(k: Kit, out: G[], ty: number, cz: number, cols: number, rows: number, armour: boolean, skirts: number[] = []): void {
  const P = (g: G) => void out.push(g);
  const w = cols * 0.09 + 0.04, h = rows * 0.075 + 0.035;
  P(k.add(rbox(0.36, h, w, 0.035, 2), 'paint', C.team, { p: [0, ty, cz] }));
  P(k.add(rbox(0.03, h + 0.01, w + 0.01, 0.01), 'hazard', 0xffffff, { p: [-0.14, ty, cz] }));
  P(k.add(rbox(0.03, h - 0.02, w - 0.02, 0.01), 'metal', C.gun, { p: [0.18, ty, cz] }));
  for (const s of [-1, 1]) {
    const z = cz + s * (w / 2);
    P(k.add(rbox(0.24, h - 0.08, 0.012, 0.004), 'metal', C.steel, { p: [0.02, ty, z + s * 0.005] }));
    for (let i = 0; i < 5; i++) P(k.add(rbox(0.012, h - 0.1, 0.022, 0.003), 'metal', C.gunD, { p: [-0.08 + i * 0.05, ty, z + s * 0.015] }));
    P(k.glow(rbox(0.06, 0.01, 0.004, 0.002), C.amber, { p: [0.12, ty + h / 2 - 0.02, z + s * 0.002] }));
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const y = ty + (r - (rows - 1) / 2) * 0.075, z = cz + (c - (cols - 1) / 2) * 0.09;
    P(k.add(cyl(0.032, 0.032, 0.03, 12), 'metal', C.steel, { p: [0.2, y, z], r: [0, 0, -PI / 2] }));
    P(k.add(cyl(0.024, 0.024, 0.005, 12), 'metal', C.bore, { p: [0.216, y, z], r: [0, 0, -PI / 2] }));
    P(k.add(cyl(0.0, 0.019, 0.045, 12), 'paint', C.red, { p: [0.23, y, z], r: [0, 0, -PI / 2] }));
  }
  // rear exhaust grille
  P(k.add(rbox(0.02, h - 0.08, w - 0.09, 0.006), 'metal', C.gunD, { p: [-0.19, ty, cz] }));
  for (let i = 0; i < 6; i++) P(k.add(rbox(0.026, 0.006, w - 0.11, 0.002), 'metal', C.steel, { p: [-0.195, ty - (h - 0.1) / 2 + i * ((h - 0.1) / 5), cz] }));
  // seeker sensor box on the roof, offset to the camera side
  const sy = ty + h / 2 + (armour ? 0.04 : 0.02);
  P(k.add(rbox(0.1, 0.04, 0.08, 0.01), 'metal', C.gun, { p: [-0.04, sy, cz + w / 2 - 0.075] }));
  P(k.glow(rbox(0.006, 0.02, 0.05, 0.002), C.cyan, { p: [0.012, sy, cz + w / 2 - 0.075] }, 6));
  for (const s of skirts) {
    const z = cz + s * (w / 2 + 0.03);
    P(k.add(rbox(0.32, h + 0.02, 0.018, 0.006), 'paint', C.deck, { p: [-0.01, ty, z] }));
    P(k.add(rbox(0.322, 0.03, 0.02, 0.004), 'hazard', 0xffffff, { p: [-0.01, ty + h / 2 - 0.005, z] }));
    for (const y of [-0.3, 0.2]) for (let i = 0; i < 6; i++)
      P(k.add(cyl(0.007, 0.007, 0.008, 6), 'metal', C.steel, { p: [-0.14 + i * 0.052, ty + y * h, z + s * 0.01], r: [PI / 2, 0, 0] }));
    for (const x of [-0.08, 0.06]) P(k.add(rbox(0.02, 0.02, 0.03, 0.004), 'metal', C.gunD, { p: [x, ty, z - s * 0.02] }));
  }
  if (!armour) return;
  // bolted roof plate with a hazard band, rivet rows
  P(k.add(rbox(0.26, 0.022, w - 0.04, 0.008), 'paint', C.deck, { p: [-0.01, ty + h / 2 + 0.01, cz] }));
  P(k.add(rbox(0.05, 0.006, w - 0.05, 0.002), 'hazard', 0xffffff, { p: [-0.1, ty + h / 2 + 0.023, cz] }));
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++)
    P(k.add(cyl(0.006, 0.006, 0.008, 6), 'metal', C.steel, { p: [-0.12 + i * 0.044, ty + h / 2 + 0.023, cz + s * (w / 2 - 0.04)] }));
}

export function breacher(level: Level): Built {
  const k = kit();
  plinth(k);
  for (let i = 0; i < level; i++) k.glow(rbox(0.05, 0.026, 0.008, 0.003), C.pip, { p: [(i - (level - 1) / 2) * 0.07, 0.025, 0.443] }, 4);
  if (level >= 2) {
    // reload crates on the front deck corners, warhead noses showing
    for (const s of [-1, 1]) {
      const x = s * 0.27;
      k.add(rbox(0.13, 0.06, 0.1, 0.01), 'paint', C.team, { p: [x, DECK + 0.03, 0.29] });
      k.add(rbox(0.135, 0.012, 0.105, 0.003), 'hazard', 0xffffff, { p: [x, DECK + 0.045, 0.29] });
      for (const dx of [-0.035, 0, 0.035]) k.add(cyl(0, 0.014, 0.03, 10), 'paint', C.red, { p: [x + dx, DECK + 0.075, 0.29] });
    }
  }
  if (level === 3) {
    // hazard-striped armoured buttresses on the plinth's front corners
    for (const s of [-1, 1]) {
      k.add(rbox(0.12, 0.17, 0.12, 0.02, 2), 'metal', C.gunD, { p: [s * 0.4, 0.085, 0.4] });
      k.add(rbox(0.125, 0.04, 0.125, 0.008), 'hazard', 0xffffff, { p: [s * 0.4, 0.13, 0.4] });
      k.glow(rbox(0.03, 0.014, 0.004, 0.002), C.amber, { p: [s * 0.4, 0.07, 0.462] }, 6);
    }
  }

  k.setTurret(true);
  turretRing(k);
  if (level >= 2) {
    // L2+: painted, hazard-rimmed traverse deck over the ring (reads as a lighter disc vs L1's bare ring)
    k.add(cyl(0.255, 0.255, 0.014, 32), 'hazard', 0xffffff, { p: [0, 0.057, 0] });
    k.add(cyl(0.225, 0.225, 0.02, 32), 'paint', C.team, { p: [0, 0.062, 0] });
  }
  const pods: G[] = [];
  const pitch = level === 3 ? 0.5 : 0.6;
  if (level < 3) {
    const n = level === 1 ? 3 : 4;
    const cheekZ = level === 1 ? 0.2 : 0.29;
    const ty = level === 1 ? TY : 0.34;
    k.add(rbox(0.26, 0.1, 0.26, 0.03, 2), 'metal', C.gun, { p: [0, 0.1, 0] });
    for (const s of [-1, 1]) {
      k.add(rbox(0.14, ty - 0.06, 0.045, 0.015, 2), 'metal', C.gun, { p: [0, ty - 0.06, s * cheekZ] });
      k.add(cyl(0.032, 0.032, 0.014, 6), 'metal', C.steel, { p: [0, ty, s * (cheekZ + 0.032)], r: [PI / 2, 0, 0] });
    }
    k.add(cyl(0.05, 0.05, cheekZ * 2 + 0.04, 24), 'metal', C.gunD, { p: [0, ty, 0], r: [PI / 2, 0, 0] });
    pod(k, pods, ty, 0, n, n, level === 2, level === 2 ? [-1, 1] : []);
    if (level === 2) {
      // hydraulic elevation rams from the yoke base to the pod belly
      for (const s of [-1, 1]) {
        k.rod([-0.13, 0.08, s * 0.14], [-0.02, 0.2, s * 0.14], 0.022, 'metal', C.gunD);
        k.rod([-0.06, 0.15, s * 0.14], [0.04, 0.24, s * 0.14], 0.012, 'metal', C.chrome);
      }
    }
  } else {
    // central pedestal: trunnion through both pods, targeting head between them
    k.add(rbox(0.3, 0.12, 0.3, 0.035, 2), 'metal', C.gun, { p: [0, 0.11, 0] });
    k.add(rbox(0.16, 0.2, 0.1, 0.02, 2), 'metal', C.gun, { p: [0, 0.24, 0] });
    k.add(cyl(0.045, 0.045, 0.74, 24), 'metal', C.gunD, { p: [0, TY, 0], r: [PI / 2, 0, 0] });
    for (const s of [-1, 1]) k.add(cyl(0.036, 0.036, 0.016, 6), 'metal', C.steel, { p: [0, TY, s * 0.375], r: [PI / 2, 0, 0] });
    pod(k, pods, TY, -0.215, 3, 3, true, [-1]);
    pod(k, pods, TY, 0.215, 3, 3, true, [1]);
    // targeting head: armoured box, cyan lens strip, hazard brow
    k.add(rbox(0.18, 0.09, 0.09, 0.015), 'paint', C.deck, { p: [0.02, 0.4, 0] });
    k.glow(rbox(0.006, 0.026, 0.06, 0.002), C.cyan, { p: [0.113, 0.405, 0] }, 7);
    k.add(rbox(0.03, 0.012, 0.094, 0.003), 'hazard', 0xffffff, { p: [0.09, 0.448, 0] });
    // rear blast deflectors behind each pod exhaust
    for (const s of [-1, 1]) {
      k.strut([-0.18, 0.06, s * 0.215], [-0.27, 0.24, s * 0.215], 0.02, 0.24, 'metal', C.gunD);
      for (let i = 0; i < 3; i++) k.add(cyl(0.006, 0.006, 0.008, 6), 'metal', C.steel, { p: [-0.23 + i * 0.03, 0.1 + i * 0.06, s * 0.215 + 0.08] });
    }
  }
  // radar mast behind the yoke (L3: taller, dish + strobe)
  const mh = level === 3 ? 0.62 : 0.48;
  k.rod([-0.12, 0.14, 0], [-0.15, mh, 0], level === 3 ? 0.011 : 0.008, 'metal', C.steel, 0.006, 8);
  k.add(new THREE.SphereGeometry(level === 3 ? 0.075 : 0.05, 20, 8, 0, PI * 2, 0, PI / 2.5), 'metal', C.steel, { p: [-0.15, mh - 0.01, 0], r: [0, 0, 1.2] });
  k.glow(sph(level === 3 ? 0.016 : 0.012, 10, 8), C.redGlow, { p: [-0.152, mh + 0.02, 0] });
  if (level >= 2) k.add(rbox(0.06, 0.035, 0.05, 0.008), 'metal', C.gun, { p: [-0.14, mh * 0.62, 0] });

  const py = level === 2 ? 0.34 : TY;
  const m = new THREE.Matrix4().makeTranslation(0, py, 0).multiply(new THREE.Matrix4().makeRotationZ(pitch)).multiply(new THREE.Matrix4().makeTranslation(0, -py, 0));
  for (const g of pods) g.applyMatrix4(m);
  // conduits from yoke into the pod belly
  const cz = level === 3 ? 0.215 : 0.1;
  for (const s of [-1, 1]) k.add(tube([[-0.1, 0.12, s * cz * 0.6], [-0.16, 0.2, s * cz], [-0.14, 0.28, s * cz]], 0.012), 'metal', C.rubber);
  return finalize(k, DECK);
}
