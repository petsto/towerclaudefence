// Procedural enemy geometries (docs/design/enemies.md §3). One merged, vertex-coloured geometry per type; faces +X, origin at feet.
import type * as THREE from 'three';
import type { EnemyId } from '../../data/types';
import { box, capsule, cyl, ico, merge, rod, sphere, type G, type V3 } from './parts';

const GLOW = 2.4; // colour gain so glow parts saturate under Lambert like an emissive
const CH = { dark: 0x2e1a3d, body: 0x5e3a7a, plate: 0xc8962e, bone: 0xd8c8a0, glow: 0xe05ab8 } as const;
const RM = { steel: 0x2e3238, gun: 0x4a5058, rust: 0x8a4a2a, haz: 0xd8a820, optic: 0xff2a1a } as const;
const PI = Math.PI;

/** Mirror a part pair across Z (no negative scale, so winding stays correct). */
const pair = (f: (s: number) => G): G[] => [f(-1), f(1)];
const leg = (a: V3, b: V3, r: number, c: number) => rod(a, b, r, c, 4, r * 0.5);

function skitterling(): G[] {
  const p: G[] = [
    sphere(0.12, CH.body, { p: [0, 0.13, 0], s: [1.3, 0.6, 1] }),
    sphere(0.07, CH.dark, { p: [0.15, 0.13, 0] }, 6, 4),
    ...pair((s) => sphere(0.025, CH.glow, { p: [0.205, 0.15, s * 0.035], g: GLOW }, 4, 3)),
    ...pair((s) => box(0.03, 0.04, 0.03, CH.bone, { p: [0.21, 0.09, s * 0.03] })),
  ];
  for (const x of [-0.09, 0, 0.09]) p.push(...pair((s) => leg([x, 0.11, s * 0.07], [x * 1.4 + 0.02, 0, s * 0.19], 0.022, CH.bone)));
  return p;
}

function huskCrawler(): G[] {
  const segs: [number, number][] = [[0.2, 0.14], [0, 0.16], [-0.2, 0.12]];
  const p: G[] = [];
  for (const [x, r] of segs) {
    p.push(sphere(r, CH.body, { p: [x, 0.16, 0], s: [1, 0.8, 1] }));
    p.push(box(0.18, 0.04, 0.16, CH.plate, { p: [x, 0.16 + r * 0.8, 0], r: [0, 0, -x * 0.8] }));
    p.push(...pair((s) => leg([x, 0.12, s * r * 0.8], [x + 0.03, 0, s * (r + 0.1)], 0.026, CH.dark)));
  }
  p.push(...pair((s) => leg([0.3, 0.14, s * 0.06], [0.42, 0.08, s * 0.02], 0.03, CH.bone)));
  p.push(...pair((s) => sphere(0.025, CH.glow, { p: [0.32, 0.19, s * 0.06], g: GLOW }, 4, 3)));
  p.push(sphere(0.075, CH.glow, { p: [-0.27, 0.25, 0], g: GLOW }, 6, 4));
  return p;
}

function broodCarrier(): G[] {
  const p: G[] = [
    sphere(0.3, CH.body, { p: [-0.1, 0.34, 0], s: [1.1, 0.85, 1] }),
    capsule(0.12, 0.2, CH.dark, { p: [0.25, 0.27, 0], r: [0, 0, PI / 2] }),
    ...pair((s) => sphere(0.025, CH.glow, { p: [0.4, 0.31, s * 0.06], g: GLOW }, 4, 3)),
    ...pair((s) => leg([0.42, 0.24, s * 0.05], [0.5, 0.15, s * 0.02], 0.03, CH.bone)),
  ];
  for (const [x, a] of [[-0.28, 0.7], [-0.1, 0], [0.08, -0.7]] as const) {
    p.push(box(0.16, 0.05, 0.36, CH.plate, { p: [x, 0.34 + 0.255 * Math.cos(a * 0.9) - 0.01, 0], r: [0, 0, a] }));
  }
  const sacs: V3[] = [[-0.12, 0.3, 0.3], [-0.12, 0.3, -0.3], [-0.32, 0.36, 0.2], [-0.32, 0.36, -0.2], [-0.38, 0.22, 0]];
  for (const q of sacs) p.push(sphere(0.065, CH.glow, { p: q, g: GLOW }, 6, 4));
  for (const x of [0.16, -0.22]) p.push(...pair((s) => leg([x, 0.24, s * 0.16], [x + 0.06, 0, s * 0.34], 0.045, CH.bone)));
  return p;
}

function choirMother(): G[] {
  const p: G[] = [
    sphere(0.55, CH.body, { p: [-0.3, 0.55, 0], s: [1.15, 0.8, 0.95] }),
    capsule(0.2, 0.42, CH.dark, { p: [0.4, 0.68, 0], r: [0, 0, -0.35] }),
    sphere(0.17, CH.dark, { p: [0.52, 1.0, 0] }, 8, 5),
    ...pair((s) => sphere(0.035, CH.glow, { p: [0.66, 1.02, s * 0.08], g: GLOW }, 4, 3)),
    ...pair((s) => leg([0.6, 0.62, s * 0.12], [0.82, 0.42, s * 0.06], 0.05, CH.bone)),
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 2 * PI;
    const d: V3 = [0.52 + Math.cos(a) * 0.12, 1.1, Math.sin(a) * 0.13];
    p.push(leg(d, [d[0] + Math.cos(a) * 0.12 - 0.06, 1.38, d[2] + Math.sin(a) * 0.14], 0.04, CH.bone));
  }
  for (const [x, a] of [[-0.75, 0.9], [-0.5, 0.4], [-0.2, -0.05], [0.08, -0.5]] as const) {
    p.push(box(0.24, 0.07, 0.5, CH.plate, { p: [x, 0.55 + 0.42 * Math.cos(a * 0.85), 0], r: [0, 0, a] }));
  }
  for (const x of [-0.65, -0.35, -0.05]) p.push(...pair((s) => ico(0.095, CH.glow, { p: [x, 0.5, s * 0.5], g: GLOW })));
  for (const x of [0.15, -0.3, -0.7]) p.push(...pair((s) => leg([x, 0.4, s * 0.38], [x + 0.1, 0, s * 0.72], 0.06, CH.bone)));
  return p;
}

function spindleDrone(): G[] {
  const p: G[] = [
    box(0.22, 0.1, 0.16, RM.gun, { p: [0, 0.23, 0] }),
    box(0.22, 0.015, 0.05, RM.haz, { p: [0, 0.285, 0] }),
    box(0.06, 0.06, 0.1, RM.steel, { p: [0.1, 0.21, 0] }),
    sphere(0.045, RM.optic, { p: [0.14, 0.22, 0], g: GLOW }, 6, 4),
    rod([-0.08, 0.28, 0.05], [-0.1, 0.38, 0.06], 0.008, RM.steel),
  ];
  for (let i = 0; i < 3; i++) {
    const a = PI / 3 + (i * 2 * PI) / 3;
    p.push(leg([Math.cos(a) * 0.06, 0.2, Math.sin(a) * 0.06], [Math.cos(a) * 0.19, 0, Math.sin(a) * 0.17], 0.018, RM.steel));
  }
  return p;
}

function rivetWalker(): G[] {
  const p: G[] = [
    box(0.3, 0.22, 0.26, RM.rust, { p: [0, 0.39, 0] }),
    ...pair((s) => box(0.24, 0.16, 0.03, RM.gun, { p: [-0.01, 0.39, s * 0.14] })),
    box(0.04, 0.12, 0.2, RM.gun, { p: [0.15, 0.4, 0] }),
    box(0.26, 0.02, 0.06, RM.haz, { p: [-0.01, 0.51, 0] }),
    cyl(0.055, 0.055, 0.05, 6, RM.optic, { p: [0.18, 0.43, 0], r: [0, 0, PI / 2], g: GLOW }),
    cyl(0.03, 0.03, 0.1, 6, RM.steel, { p: [-0.1, 0.55, -0.08] }),
  ];
  for (const s of [-1, 1]) {
    const hip: V3 = [-0.02, 0.3, s * 0.1], knee: V3 = [0.07, 0.17, s * 0.12], ankle: V3 = [-0.02, 0.04, s * 0.12];
    p.push(rod(hip, knee, 0.04, RM.steel, 6), rod(knee, ankle, 0.03, RM.gun, 6));
    p.push(box(0.14, 0.04, 0.08, RM.steel, { p: [0.01, 0.02, s * 0.12] }));
  }
  return p;
}

function menderUnit(): G[] {
  const p: G[] = [
    cyl(0.18, 0.18, 0.18, 8, RM.gun, { p: [0, 0.22, 0] }),
    cyl(0.185, 0.185, 0.035, 8, RM.haz, { p: [0, 0.27, 0] }),
    cyl(0.14, 0.17, 0.04, 8, RM.steel, { p: [0, 0.33, 0] }),
    cyl(0.025, 0.025, 0.1, 6, RM.steel, { p: [0, 0.39, 0] }),
    cyl(0.17, 0.03, 0.07, 8, RM.haz, { p: [0, 0.47, 0] }),
    sphere(0.025, RM.optic, { p: [0, 0.5, 0], g: GLOW }, 4, 3),
    box(0.05, 0.06, 0.1, RM.steel, { p: [0.17, 0.22, 0] }),
    cyl(0.04, 0.04, 0.03, 6, RM.optic, { p: [0.2, 0.22, 0], r: [0, 0, PI / 2], g: GLOW }),
  ];
  for (let i = 0; i < 4; i++) {
    const a = PI / 4 + (i * PI) / 2;
    p.push(box(0.06, 0.14, 0.06, RM.steel, { p: [Math.cos(a) * 0.17, 0.07, Math.sin(a) * 0.17], r: [0, -a, 0] }));
  }
  return p;
}

function anvilTread(): G[] {
  const p: G[] = [
    ...pair((s) => box(0.9, 0.18, 0.2, RM.steel, { p: [0, 0.09, s * 0.27] })),
    box(0.65, 0.26, 0.5, RM.rust, { p: [-0.05, 0.3, 0] }),
    box(0.2, 0.2, 0.5, RM.gun, { p: [0.3, 0.25, 0], r: [0, 0, PI / 6] }),
    ...pair((s) => box(0.14, 0.012, 0.06, RM.haz, { p: [0.3, 0.37, s * 0.16], r: [0, 0, PI / 6] })),
    ...pair((s) => sphere(0.04, RM.optic, { p: [0.36, 0.38, s * 0.1], g: GLOW }, 6, 4)),
    box(0.3, 0.08, 0.3, RM.gun, { p: [-0.15, 0.47, 0] }),
    cyl(0.04, 0.04, 0.12, 6, RM.steel, { p: [-0.28, 0.55, 0.1] }),
  ];
  for (const x of [-0.33, -0.11, 0.11, 0.33]) p.push(...pair((s) => box(0.03, 0.02, 0.21, RM.gun, { p: [x, 0.19, s * 0.27] })));
  return p;
}

function foundryColossus(): G[] {
  const p: G[] = [
    box(1.0, 0.55, 0.8, RM.rust, { p: [0, 0.5, 0] }),
    box(0.55, 0.35, 0.5, RM.gun, { p: [-0.1, 0.95, 0] }),
    box(0.06, 0.18, 0.3, RM.optic, { p: [0.51, 0.55, 0], g: GLOW }),
    box(0.04, 0.12, 0.24, RM.optic, { p: [0.18, 0.95, 0], g: GLOW }),
    ...pair((s) => cyl(0.07, 0.08, 0.45, 6, RM.steel, { p: [-0.28, 1.25, s * 0.15] })),
    ...pair((s) => box(1.02, 0.05, 0.03, RM.haz, { p: [0, 0.66, s * 0.4] })),
    box(0.03, 0.05, 0.82, RM.haz, { p: [0.505, 0.4, 0] }),
    ...pair((s) => box(0.3, 0.2, 0.06, RM.gun, { p: [0.1, 0.5, s * 0.42] })),
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.push(box(0.55, 0.24, 0.22, RM.steel, { p: [sx * 0.42, 0.12, sz * 0.36], r: [0, -sx * sz * 0.6, 0] }));
  }
  return p;
}

// Notes sizes are scaled down to the target tile sizes (boss ~1.2-1.3).
const BUILD: Record<EnemyId, [() => G[], number]> = {
  skitterling: [skitterling, 1],
  husk_crawler: [huskCrawler, 0.92],
  brood_carrier: [broodCarrier, 0.95],
  choir_mother: [choirMother, 0.8],
  spindle_drone: [spindleDrone, 1],
  rivet_walker: [rivetWalker, 1],
  mender_unit: [menderUnit, 1],
  anvil_tread: [anvilTread, 0.92],
  foundry_colossus: [foundryColossus, 0.8],
};

const cache = new Map<EnemyId, THREE.BufferGeometry>();

export function createEnemyGeometry(defId: EnemyId): THREE.BufferGeometry {
  let geo = cache.get(defId);
  if (!geo) {
    const [build, scale] = BUILD[defId];
    geo = merge(build());
    geo.scale(scale, scale, scale);
    geo.computeBoundingSphere();
    cache.set(defId, geo);
  }
  return geo;
}
