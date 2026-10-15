// Static map geometry (art-direction §4): instanced tile boxes, pad frames, biome decor, spawn portals, colony core.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Biome, MapDef, Tile } from '../data/types';
import { box as pbox, cyl, merge } from './models/parts';

export const PATH_Y = -0.08;
export const PAD_Y = 0.06;
const SKIRT = 1.5; // tile boxes extend down to y = -SKIRT so the map edge reads as a cliff into the void
const TEAM_AMBER = new THREE.Color('#ffb030');

export interface Terrain {
  readonly group: THREE.Group;
  /** Top surface height of a tile (where units/towers stand). */
  topAt(col: number, row: number): number;
  /** Occupied pads switch their frame to team amber. Keys are `col,row`. */
  setOccupied(keys: ReadonlySet<string>): void;
  update(time: number): void;
  dispose(): void;
}

// --- deterministic noise -------------------------------------------------------------------
function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s) + (hash(xi + 1, yi, s) - hash(xi, yi, s)) * u;
  const b = hash(xi, yi + 1, s) + (hash(xi + 1, yi + 1, s) - hash(xi, yi + 1, s)) * u;
  return a + (b - a) * v;
}
function seedOf(id: string): number {
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

interface Inst {
  m: THREE.Matrix4;
  c: THREE.Color;
}
function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: Inst[], shadows: boolean): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  list.forEach((it, i) => {
    mesh.setMatrixAt(i, it.m);
    mesh.setColorAt(i, it.c);
  });
  mesh.count = list.length;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
function mat(x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0): THREE.Matrix4 {
  _q.setFromEuler(_e.set(rx, ry, rz));
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// --- biome decor recipes ---------------------------------------------------------------------
interface DecorStyle {
  rock: string;
  shard: string;
  shardGlow: number; // emissive fraction for shards
  shardsPerObstacle: number;
  rocksPerObstacle: number;
  crack: string | null;
  crackChance: number;
  wreckChance: number;
}
function decorStyle(biome: Biome, p: MapDef['palette']): DecorStyle {
  switch (biome) {
    case 'badlands':
      return { rock: p.decor, shard: p.cliff, shardGlow: 0, shardsPerObstacle: 0.5, rocksPerObstacle: 2.5, crack: null, crackChance: 0, wreckChance: 0.18 };
    case 'volcanic':
      return { rock: p.decor, shard: p.accent, shardGlow: 0.9, shardsPerObstacle: 0.6, rocksPerObstacle: 2.2, crack: p.accent, crackChance: 0.22, wreckChance: 0.12 };
    case 'crystal':
      return { rock: p.cliff, shard: p.decor, shardGlow: 0.55, shardsPerObstacle: 3, rocksPerObstacle: 0.8, crack: p.accent, crackChance: 0.1, wreckChance: 0.14 };
  }
}

export function createTerrain(map: MapDef): Terrain {
  const p = map.palette;
  const seed = seedOf(map.id);
  const style = decorStyle(map.biome, p);
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const tileAt = (c: number, r: number): Tile | undefined => map.tiles[r]?.[c];

  const plateauTop = (c: number, r: number): number => 0.38 + hash(c, r, seed + 3) * 0.22;
  const topAt = (c: number, r: number): number => {
    switch (tileAt(c, r)) {
      case 'path':
      case 'spawn':
      case 'core':
        return PATH_Y;
      case 'build':
        return PAD_Y;
      case 'decor':
        return plateauTop(c, r);
      default:
        return 0;
    }
  };

  // --- one pass over the grid collects every instance; meshes are built per kind below ---------
  const ground = new THREE.Color(p.ground);
  const groundAlt = new THREE.Color(p.groundAlt);
  const pathC = new THREE.Color(p.path);
  const cliff = new THREE.Color(p.cliff);
  const pad = new THREE.Color(p.buildPad);
  const accentDim = new THREE.Color(p.accent).multiplyScalar(0.6);
  const jitter = (c: THREE.Color, k: number, amt: number): THREE.Color => c.clone().multiplyScalar(1 + (k - 0.5) * 2 * amt);
  const groundColor = (x: number, z: number, k: number): THREE.Color => {
    const n = noise(x * 0.3, z * 0.3, seed) * 0.7 + noise(x * 0.9, z * 0.9, seed + 1) * 0.3;
    const t = THREE.MathUtils.smoothstep(n, 0.45, 0.72) * 0.85;
    return jitter(ground.clone().lerp(groundAlt, t), k, 0.07);
  };
  const boxes: Inst[] = []; // tile boxes: 2x2 sub-tiles per tile, one InstancedMesh for the whole map
  const box = (x: number, z: number, w: number, top: number, color: THREE.Color): void => {
    boxes.push({ m: mat(x, top, z, w, top + SKIRT, w), c: color });
  };
  const padKeys: string[] = [];
  const frames: Inst[] = [];
  const rocks: Inst[] = [];
  const shards: Inst[] = [];
  const wrecks: Inst[] = [];
  const cracks: Inst[] = [];
  const rockC = new THREE.Color(style.rock);
  const shardC = new THREE.Color(style.shard);
  const wreckC = [new THREE.Color('#2e3540'), new THREE.Color('#4a3a30'), new THREE.Color('#3d4a58')];
  const crackC = style.crack ? new THREE.Color(style.crack) : null;
  let n = 0;
  const rnd = (): number => hash(n++, 17, seed + 9);
  const count = (avg: number): number => Math.floor(avg + rnd());
  const spawns: THREE.Vector3[] = [];
  const cores: THREE.Vector3[] = [];

  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const tile = tileAt(c, r);
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const x = c + 0.25 + sx * 0.5;
          const z = r + 0.25 + sy * 0.5;
          const k = hash(c * 2 + sx, r * 2 + sy, seed + 2);
          if (tile === 'path' || tile === 'spawn' || tile === 'core') {
            const wear = noise(x * 0.6, z * 0.6, seed + 5) * 0.16; // worn, darker patches along the lane
            box(x, z, 0.5, PATH_Y - k * 0.012, jitter(pathC, k, 0.07).multiplyScalar(1.04 - wear));
          } else if (tile === 'decor') {
            const top = plateauTop(c, r) + (k - 0.5) * 0.08;
            box(x, z, 0.5, top, jitter(cliff, k, 0.1));
          } else {
            box(x, z, 0.5, (k - 0.5) * 0.04, groundColor(x, z, k));
          }
        }
      }
      if (tile === 'build') {
        box(c + 0.5, r + 0.5, 0.86, PAD_Y, jitter(pad, hash(c, r, seed + 4), 0.04));
        padKeys.push(`${c},${r}`);
        frames.push({ m: mat(c + 0.5, PAD_Y, r + 0.5, 1, 1, 1), c: accentDim });
      } else if (tile === 'decor') {
        const top = plateauTop(c, r) - 0.03;
        for (let i = count(style.rocksPerObstacle); i > 0; i--) {
          const s = 0.7 + rnd() * 0.9;
          rocks.push({
            m: mat(c + 0.15 + rnd() * 0.7, top, r + 0.15 + rnd() * 0.7, s * (0.8 + rnd() * 0.5), s * (0.6 + rnd() * 0.6), s, 0, rnd() * 6.28),
            c: jitter(rockC, rnd(), 0.15),
          });
        }
        // crystal clusters huddle around a centre point
        const cx = c + 0.3 + rnd() * 0.4;
        const cz = r + 0.3 + rnd() * 0.4;
        for (let i = count(style.shardsPerObstacle); i > 0; i--) {
          const s = 0.6 + rnd() * 1.0;
          shards.push({
            m: mat(cx + (rnd() - 0.5) * 0.45, top, cz + (rnd() - 0.5) * 0.45, s, s * (0.8 + rnd() * 0.9), s, (rnd() - 0.5) * 0.7, rnd() * 6.28, (rnd() - 0.5) * 0.7),
            c: jitter(shardC, rnd(), 0.15),
          });
        }
        if (rnd() < style.wreckChance) {
          wrecks.push({
            m: mat(c + 0.5, top + 0.04, r + 0.5, 0.8 + rnd() * 0.6, 1, 0.8 + rnd() * 0.5, (rnd() - 0.5) * 0.5, rnd() * 6.28, (rnd() - 0.5) * 0.5),
            c: wreckC[Math.floor(rnd() * wreckC.length)]!,
          });
        }
      } else if (tile === 'ground') {
        if (rnd() < 0.16) {
          const s = 0.25 + rnd() * 0.3;
          rocks.push({ m: mat(c + 0.15 + rnd() * 0.7, -0.01, r + 0.15 + rnd() * 0.7, s, s * 0.6, s, 0, rnd() * 6.28), c: jitter(rockC, rnd(), 0.15) });
        }
        if (rnd() < 0.035) {
          wrecks.push({ m: mat(c + 0.5, 0.02, r + 0.5, 0.6, 0.8, 0.6, (rnd() - 0.5) * 0.4, rnd() * 6.28, (rnd() - 0.5) * 0.4), c: wreckC[Math.floor(rnd() * wreckC.length)]! });
        }
        if (crackC && rnd() < style.crackChance) {
          for (let i = 1 + count(1.2); i > 0; i--) {
            cracks.push({ m: mat(c + 0.2 + rnd() * 0.6, 0.012, r + 0.2 + rnd() * 0.6, 0.5 + rnd() * 1.2, 1, 1, 0, rnd() * 3.14), c: jitter(crackC, rnd(), 0.2) });
          }
        }
      } else if (tile === 'spawn') spawns.push(new THREE.Vector3(c + 0.5, PATH_Y, r + 0.5));
      else if (tile === 'core') cores.push(new THREE.Vector3(c + 0.5, PATH_Y, r + 0.5));
    }
  }

  const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0);
  const lambert = new THREE.MeshLambertMaterial({ flatShading: true });
  group.add(instanced(boxGeo, lambert, boxes, true));
  disposables.push(boxGeo, lambert);

  // --- build pad frames (glowing edge) --------------------------------------------------------
  const frameParts: THREE.BufferGeometry[] = [];
  const F = 0.43;
  const T = 0.045;
  for (const [w, d, x, z] of [
    [2 * F, T, 0, -F + T / 2],
    [2 * F, T, 0, F - T / 2],
    [T, 2 * F, -F + T / 2, 0],
    [T, 2 * F, F - T / 2, 0],
  ] as const) {
    frameParts.push(new THREE.BoxGeometry(w, 0.03, d).translate(x, 0.015, z));
  }
  // corner studs make the frame read at low zoom
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) frameParts.push(new THREE.BoxGeometry(0.1, 0.04, 0.1).translate(sx * (F - 0.05), 0.02, sz * (F - 0.05)));
  const frameGeo = mergeGeometries(frameParts.map((g) => g.toNonIndexed()));
  frameParts.forEach((g) => g.dispose());
  const frameMat = new THREE.MeshBasicMaterial();
  const frameMesh = instanced(frameGeo, frameMat, frames, false);
  frameMesh.receiveShadow = false;
  group.add(frameMesh);
  disposables.push(frameGeo, frameMat);
  let occupied: boolean[] = padKeys.map(() => false);

  // --- decor props --------------------------------------------------------------------------
  const rockGeo = new THREE.IcosahedronGeometry(0.2, 0).translate(0, 0.08, 0);
  const shardGeo = new THREE.ConeGeometry(0.09, 0.5, 5).translate(0, 0.22, 0);
  const wreckGeo = mergeGeometries([
    new THREE.BoxGeometry(0.34, 0.1, 0.22).translate(0, 0.05, 0).toNonIndexed(),
    new THREE.BoxGeometry(0.12, 0.14, 0.12).translate(0.12, 0.12, 0.05).toNonIndexed(),
    new THREE.CylinderGeometry(0.03, 0.03, 0.3, 5).rotateZ(1.3).translate(-0.05, 0.13, -0.06).toNonIndexed(),
  ]);
  const crackGeo = new THREE.BoxGeometry(0.22, 0.01, 0.035);
  const shardMat = new THREE.MeshLambertMaterial({ flatShading: true, emissive: shardC.clone().multiplyScalar(style.shardGlow) });
  const crackMat = new THREE.MeshBasicMaterial();
  group.add(instanced(rockGeo, lambert, rocks, true));
  if (shards.length) group.add(instanced(shardGeo, shardMat, shards, true));
  if (wrecks.length) group.add(instanced(wreckGeo, lambert, wrecks, true));
  if (cracks.length) group.add(instanced(crackGeo, crackMat, cracks, false));
  disposables.push(rockGeo, shardGeo, wreckGeo, crackGeo, shardMat, crackMat);

  // --- spawn portals (hostile) --------------------------------------------------------------
  const portalRings: THREE.Mesh[] = [];
  const ringGeo = new THREE.RingGeometry(0.26, 0.4, 12).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ff2a4a' });
  const holeGeo = new THREE.CircleGeometry(0.27, 12).rotateX(-Math.PI / 2);
  const holeMat = new THREE.MeshBasicMaterial({ color: '#1a0410' });
  const spikes: THREE.BufferGeometry[] = [];
  const tip = new THREE.Vector3();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const h = 0.32 + (i % 2) * 0.16;
    const e = new THREE.Euler(0, -a, -0.45); // lean outward, then face the spike's angle
    tip.set(0, h / 2, 0).applyEuler(e); // cones grow from their base on the ring
    spikes.push(cyl(0, 0.06, h, 5, i % 2 ? 0xc8b89a : 0x6a3a6e, { p: [Math.cos(a) * 0.44 + tip.x, tip.y, Math.sin(a) * 0.44 + tip.z], r: [e.x, e.y, e.z] }));
  }
  const spikeGeo = merge(spikes);
  const vcLambert = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  disposables.push(ringGeo, ringMat, holeGeo, holeMat, spikeGeo, vcLambert);
  for (const at of spawns) {
    const g = new THREE.Group();
    g.position.copy(at);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.012;
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.position.y = 0.006;
    const spikeMesh = new THREE.Mesh(spikeGeo, vcLambert);
    spikeMesh.castShadow = true;
    g.add(hole, ring, spikeMesh);
    group.add(g);
    portalRings.push(ring);
  }

  // --- colony core (team structure, glow in palette.core) -----------------------------------
  const steel = 0x4a6f9a;
  const steelLight = 0x6b8cb0;
  const gun = 0x2e3540;
  const R8 = { r: [0, Math.PI / 8, 0] as const };
  const coreBody = merge([
    cyl(0.72, 0.78, 0.12, 8, gun, { p: [0, 0.06, 0], ...R8 }),
    cyl(0.5, 0.58, 0.3, 8, steel, { p: [0, 0.27, 0], ...R8 }),
    pbox(0.78, 0.2, 0.56, 0x3d5a7d, { p: [0, 0.5, 0.02] }),
    cyl(0.2, 0.3, 0.2, 8, steelLight, { p: [-0.05, 0.7, 0.0], ...R8 }),
    pbox(0.26, 0.24, 0.34, gun, { p: [0.56, 0.2, 0.08] }),
    pbox(0.26, 0.24, 0.34, gun, { p: [-0.56, 0.2, 0.08] }),
    pbox(0.28, 0.05, 0.36, steel, { p: [0.56, 0.34, 0.08] }),
    pbox(0.28, 0.05, 0.36, steel, { p: [-0.56, 0.34, 0.08] }),
    cyl(0.025, 0.035, 0.6, 4, gun, { p: [0.26, 0.9, -0.18] }),
    cyl(0, 0.16, 0.06, 6, steelLight, { p: [0.26, 1.18, -0.18], r: [0.5, 0, 0] }),
    pbox(0.1, 0.18, 0.1, gun, { p: [0.0, 0.69, 0.3] }),
  ]);
  const glow = new THREE.Color(p.core).getHex();
  const glowParts = [
    pbox(0.8, 0.035, 0.58, glow, { p: [0, 0.44, 0.02] }),
    cyl(0.09, 0.09, 0.05, 6, glow, { p: [-0.05, 0.82, 0] }),
    pbox(0.06, 0.06, 0.06, 0xffb030, { p: [0.26, 1.22, -0.18] }),
    pbox(0.2, 0.03, 0.02, glow, { p: [0.56, 0.22, 0.26] }),
    pbox(0.2, 0.03, 0.02, glow, { p: [-0.56, 0.22, 0.26] }),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    glowParts.push(pbox(0.07, 0.03, 0.07, glow, { p: [Math.cos(a) * 0.68, 0.13, Math.sin(a) * 0.68] }));
  }
  const coreGlow = merge(glowParts);
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  disposables.push(coreBody, coreGlow, glowMat);
  let coreLight: THREE.Mesh | null = null;
  for (const at of cores) {
    const g = new THREE.Group();
    g.position.copy(at);
    const body = new THREE.Mesh(coreBody, vcLambert);
    body.castShadow = true;
    body.receiveShadow = true;
    coreLight = new THREE.Mesh(coreGlow, glowMat);
    g.add(body, coreLight);
    group.add(g);
  }

  return {
    group,
    topAt,
    setOccupied(keys) {
      let dirty = false;
      const next = padKeys.map((k) => keys.has(k));
      next.forEach((o, i) => {
        if (o === occupied[i]) return;
        frameMesh.setColorAt(i, o ? TEAM_AMBER : accentDim);
        dirty = true;
      });
      occupied = next;
      if (dirty && frameMesh.instanceColor) frameMesh.instanceColor.needsUpdate = true;
    },
    update(time) {
      const s = 1 + Math.sin(time * 4) * 0.08;
      for (const ring of portalRings) {
        ring.scale.set(s, 1, s);
        ring.rotation.y = time * 0.8;
      }
      if (coreLight) coreLight.visible = Math.sin(time * 2.2) > -0.85; // occasional flicker
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
    },
  };
}
