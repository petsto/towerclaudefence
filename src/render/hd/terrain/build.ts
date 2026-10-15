// HD terrain scene (spec docs/terrain-hd.md), pre-rendered by ./bake.ts (createMapTerrain is the entry point). Pieces:
//   heightfield  one mesh at SUB verts/tile: ground ~0, path recessed to PATH_Y with a bevelled curb, decor tiles raised
//                into noisy cliffs/mesas, map border skirt down to -SKIRT; terrain material (./material.ts)
//   mask         map-wide RGBA DataTexture (MASK_PX/tile): R path, G groundAlt macro, B baked AO, A glow region
//   props        pads (kit PBR + live corner lights), rocks (terrain material), crystals, wrecks, spawn portals, core
// `live` lists the animated / state-driven objects (pad lights, portal rings, core glow): ./bake.ts bakes everything
// else and keeps these real-time.
import * as THREE from 'three';
import type { Biome, MapDef, Tile } from '../../../data/types';
import type { Built, MatId } from '../kit';
import { builtToGroup } from '../sprites';
import { hash } from '../textures';
import { terrainMaterial, type TerrainLook } from './material';
import { coreModel, crystalGeo, padFrameGeo, padModel, portalModel, rockGeo, wreckModels } from './props';
import { terrainSets } from './textures';

/** Top of path / spawn / core tiles and of build pads (where enemies walk and towers stand); ground is ~0. */
export const PATH_Y = -0.08;
export const PAD_Y = 0.06;
const SUB = 10; // heightfield verts per tile
const MASK_PX = 16; // mask texels per tile
const SKIRT = 1.5;
const TEAM_AMBER = new THREE.Color('#ffb030');

export interface HdTerrain {
  readonly group: THREE.Group;
  /** Objects that must stay real-time (animated or state-driven). */
  readonly live: THREE.Object3D[];
  topAt(col: number, row: number): number;
  setOccupied(keys: ReadonlySet<string>): void;
  update(time: number): void;
  dispose(): void;
  /** Build time (textures + geometry), ms. */
  readonly ms: number;
}

/**
 * Per-biome decor recipe + terrain look (a new Biome needs a case here). crystal: shard tint; crystalSize: height scale;
 * crystalSat: 0 = grey-cliff body, 1 = full tint; look: see TerrainLook in ./material.ts.
 */
interface Style { rocks: number; crystals: number; crystal: string; crystalGlow: number; crystalSize: number; crystalSat: number; wreck: number; look: TerrainLook }
function style(biome: Biome, p: MapDef['palette']): Style {
  switch (biome) {
    case 'badlands': return { rocks: 2.6, crystals: 0, crystal: p.cliff, crystalGlow: 0, crystalSize: 1, crystalSat: 1, wreck: 0.18,
      look: { glowG: '#000000', glowR: '#000000', top: 1.15, rim: 0.25, propGround: false } };
    case 'volcanic': return { rocks: 2.2, crystals: 0.4, crystal: p.accent, crystalGlow: 0.7, crystalSize: 0.6, crystalSat: 1, wreck: 0.12,
      look: { glowG: p.accent, glowR: p.accent, top: 0.72, rim: 1.1, propGround: true } };
    // crystals are accents, not focus: fewer, shorter, desaturated toward the cliff rock, faint glow
    case 'crystal': return { rocks: 1.1, crystals: 1.4, crystal: p.decor, crystalGlow: 0.1, crystalSize: 0.7, crystalSat: 0.5, wreck: 0.14,
      look: { glowG: p.accent, glowR: `#${new THREE.Color(p.decor).multiplyScalar(0.55).getHexString()}`, top: 1.15, rim: 0.3, propGround: false } };
  }
}

// smooth value noise (not tileable; map space)
function noise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const sstep = THREE.MathUtils.smoothstep;
const seedOf = (id: string): number => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);
const isPath = (t: Tile | undefined): boolean => t === 'path' || t === 'spawn' || t === 'core';
const isDecor = (t: Tile | undefined): boolean => t === 'decor';

/** `mats`: the unit materials (makeMaterials), shared with the sprite atlas bake; the caller owns and disposes them. */
export function createHdTerrain(map: MapDef, mats: Record<MatId, THREE.Material>): HdTerrain {
  const t0 = performance.now();
  const p = map.palette;
  const seed = seedOf(map.id);
  const st = style(map.biome, p);
  const { cols, rows } = map;
  const tileAt = (c: number, r: number): Tile | undefined => map.tiles[r]?.[c];

  /** Signed distance (tiles) to the edge of the region `pred` holds on: > 0 inside. The map border never counts as an edge. */
  function regionDist(x: number, z: number, pred: (t: Tile | undefined) => boolean): number {
    const c = THREE.MathUtils.clamp(Math.floor(x), 0, cols - 1), r = THREE.MathUtils.clamp(Math.floor(z), 0, rows - 1);
    const fx = THREE.MathUtils.clamp(x - c, 0, 1), fz = THREE.MathUtils.clamp(z - r, 0, 1);
    const inside = pred(tileAt(c, r));
    let best = 1.5;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nc = c + dx, nr = r + dz;
      if ((dx === 0 && dz === 0) || nc < 0 || nr < 0 || nc >= cols || nr >= rows || pred(tileAt(nc, nr)) === inside) continue;
      best = Math.min(best, Math.hypot(dx < 0 ? fx : dx > 0 ? 1 - fx : 0, dz < 0 ? fz : dz > 0 ? 1 - fz : 0));
    }
    return inside ? best : -best;
  }

  function height(x: number, z: number): number {
    let h = (noise(x * 1.1, z * 1.1, seed) - 0.5) * 0.035 + (noise(x * 3.7, z * 3.7, seed + 1) - 0.5) * 0.012;
    const dp = regionDist(x, z, isPath);
    if (dp > -0.05) h += (PATH_Y + (noise(x * 5, z * 5, seed + 2) - 0.5) * 0.008 - h) * sstep(dp, -0.02, 0.12);
    const dd = regionDist(x, z, isDecor) - 0.07 + (noise(x * 4.5, z * 4.5, seed + 3) - 0.5) * 0.16;
    if (dd > -0.1) {
      const top = 0.4 + noise(x * 0.8, z * 0.8, seed + 4) * 0.18 + (noise(x * 6, z * 6, seed + 5) - 0.5) * 0.07;
      h += (top - h) * sstep(dd, 0, 0.11);
    }
    return h;
  }
  const topAt = (c: number, r: number): number => {
    const t = tileAt(c, r);
    return isPath(t) ? PATH_Y : t === 'build' ? PAD_Y : t === 'decor' ? height(c + 0.5, r + 0.5) : 0;
  };

  // --- heightfield + border skirt (one indexed geometry) ---------------------------------------------------------
  const NX = cols * SUB + 1, NZ = rows * SUB + 1;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) pos.push(i / SUB, height(i / SUB, j / SUB), j / SUB);
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // skirt: walk the border, each edge vertex gets a twin at -SKIRT (own vertices so normals stay horizontal)
  const border: number[] = [];
  for (let i = 0; i < NX; i++) border.push(i); // north, west -> east
  for (let j = 1; j < NZ; j++) border.push(j * NX + NX - 1); // east
  for (let i = NX - 2; i >= 0; i--) border.push((NZ - 1) * NX + i); // south, east -> west
  for (let j = NZ - 2; j >= 0; j--) border.push(j * NX); // west
  const base = pos.length / 3;
  for (const v of border) pos.push(pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!, pos[v * 3]!, -SKIRT, pos[v * 3 + 2]!);
  for (let k = 0; k < border.length - 1; k++) {
    const a = base + k * 2, b = a + 2; // top a/b, bottom a+1/b+1; clockwise walk -> outward faces
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  // --- mask: path, macro tint, AO, glow region -----------------------------------------------------------------
  const MW = cols * MASK_PX, MH = rows * MASK_PX;
  const hr = new Float32Array(MW * MH); // AO height raster: heightfield + pads + props (props added below)
  const mask = new Uint8Array(MW * MH * 4);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const wx = (x + 0.5) / MASK_PX, wz = (y + 0.5) / MASK_PX;
    const i = y * MW + x;
    hr[i] = height(wx, wz);
    const c = Math.floor(wx), r = Math.floor(wz);
    if (tileAt(c, r) === 'build' && Math.abs(wx - c - 0.5) < 0.44 && Math.abs(wz - r - 0.5) < 0.44) hr[i] = PAD_Y;
    const dp = regionDist(wx, wz, isPath) + (noise(wx * 7, wz * 7, seed + 6) - 0.5) * 0.08;
    const n = noise(wx * 0.3, wz * 0.3, seed) * 0.7 + noise(wx * 0.9, wz * 0.9, seed + 1) * 0.3;
    const glowRegion = map.biome === 'badlands' ? 0 : sstep(noise(wx * 0.6, wz * 0.6, seed + 8) + (tileAt(c, r) === 'ground' ? 0 : -0.4), 0.64, 0.78); // sparse hot spots, never under pads/path
    mask[i * 4] = sstep(dp, -0.05, 0.07) * 255;
    mask[i * 4 + 1] = sstep(n, 0.45, 0.72) * 0.85 * 255;
    mask[i * 4 + 3] = glowRegion * 255;
  }

  // --- props ---------------------------------------------------------------------------------------------------
  const envMap = (mats.metal as THREE.MeshStandardMaterial).envMap;
  const sets = terrainSets(map.biome, p, seed);
  let n = 0;
  const rnd = (): number => hash(n++, 17, seed + 9);
  const count = (avg: number): number => Math.floor(avg + rnd());
  const m4 = (x: number, y: number, z: number, s: number | THREE.Vector3, ry = 0, rx = 0, rz = 0): THREE.Matrix4 =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), typeof s === 'number' ? new THREE.Vector3(s, s, s) : s);
  const ROCK_VARIANTS = 4;
  const rocks: THREE.Matrix4[][] = Array.from({ length: ROCK_VARIANTS }, () => []);
  const crystals: { m: THREE.Matrix4; k: number }[] = [];
  const wrecks: THREE.Matrix4[][] = [[], []];
  const pads: THREE.Matrix4[] = [];
  const padKeys: string[] = [];
  const spawns: THREE.Vector3[] = [];
  const cores: THREE.Vector3[] = [];
  const bump = (x: number, z: number, r: number, h: number): void => { // stamp a prop into the AO raster
    const R = Math.ceil(r * MASK_PX);
    const cx = Math.floor(x * MASK_PX), cz = Math.floor(z * MASK_PX);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const X = cx + dx, Y = cz + dy;
      const d = Math.hypot(dx, dy) / (r * MASK_PX);
      if (X < 0 || Y < 0 || X >= MW || Y >= MH || d > 1) continue;
      hr[Y * MW + X] = Math.max(hr[Y * MW + X]!, height(x, z) + h * Math.sqrt(1 - d * d));
    }
  };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const t = tileAt(c, r);
    if (t === 'build') {
      pads.push(m4(c + 0.5, 0, r + 0.5, 1));
      padKeys.push(`${c},${r}`);
    } else if (t === 'decor') {
      for (let i = count(st.rocks); i > 0; i--) {
        const x = c + 0.15 + rnd() * 0.7, z = r + 0.15 + rnd() * 0.7, s = 0.8 + rnd() * 1.1;
        rocks[Math.floor(rnd() * ROCK_VARIANTS)]!.push(m4(x, height(x, z) - 0.03, z, new THREE.Vector3(s * (0.8 + rnd() * 0.5), s * (0.6 + rnd() * 0.7), s), rnd() * 6.28));
        bump(x, z, 0.2 * s, 0.15 * s);
      }
      const cx = c + 0.3 + rnd() * 0.4, cz = r + 0.3 + rnd() * 0.4;
      for (let i = count(st.crystals); i > 0; i--) {
        const x = cx + (rnd() - 0.5) * 0.5, z = cz + (rnd() - 0.5) * 0.5, s = (0.5 + rnd() * 0.8) * st.crystalSize;
        crystals.push({ m: m4(x, height(x, z) - 0.04, z, new THREE.Vector3(s, s * (0.35 + rnd() * 0.45), s), rnd() * 6.28, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.6), k: rnd() });
      }
      if (rnd() < st.wreck) {
        const x = c + 0.5, z = r + 0.5;
        wrecks[Math.floor(rnd() * 2)]!.push(m4(x, height(x, z) - 0.01, z, 1 + rnd() * 0.4, rnd() * 6.28));
      }
    } else if (t === 'ground') {
      if (rnd() < 0.18) {
        const x = c + 0.2 + rnd() * 0.6, z = r + 0.2 + rnd() * 0.6, s = 0.35 + rnd() * 0.4;
        rocks[Math.floor(rnd() * ROCK_VARIANTS)]!.push(m4(x, height(x, z) - 0.02, z, new THREE.Vector3(s, s * 0.7, s), rnd() * 6.28));
        bump(x, z, 0.2 * s, 0.1 * s);
      }
      if (rnd() < 0.04) {
        const x = c + 0.5, z = r + 0.5;
        wrecks[Math.floor(rnd() * 2)]!.push(m4(x, height(x, z), z, 0.8 + rnd() * 0.3, rnd() * 6.28));
        bump(x, z, 0.25, 0.12);
      }
    } else if (t === 'spawn') spawns.push(new THREE.Vector3(c + 0.5, PATH_Y, r + 0.5));
    else if (t === 'core') {
      cores.push(new THREE.Vector3(c + 0.5, PATH_Y, r + 0.5));
      bump(c + 0.5, r + 0.5, 0.8, 0.5);
    }
  }

  // AO from the height raster: 8 directions, horizon angle over 4 steps
  const H = (x: number, y: number): number => hr[THREE.MathUtils.clamp(y, 0, MH - 1) * MW + THREE.MathUtils.clamp(x, 0, MW - 1)]!;
  const STEPS = [1, 2, 4, 7];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const h0 = H(x, y);
    let occ = 0;
    for (let d = 0; d < 8; d++) {
      const a = (d / 8) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      let m = 0;
      for (const s of STEPS) m = Math.max(m, (H(Math.round(x + dx * s), Math.round(y + dy * s)) - h0) / (s / MASK_PX));
      occ += m / Math.hypot(1, m); // sin(horizon angle)
    }
    mask[(y * MW + x) * 4 + 2] = (1 - Math.min(0.85, (occ / 8) * 1.3)) * 255;
  }
  const maskTex = new THREE.DataTexture(mask, MW, MH, THREE.RGBAFormat);
  maskTex.magFilter = maskTex.minFilter = THREE.LinearFilter;
  maskTex.needsUpdate = true;
  const tMat = terrainMaterial(sets, maskTex, map, p, st.look, envMap);

  const group = new THREE.Group();
  const live: THREE.Object3D[] = [];
  const ground = new THREE.Mesh(geo, tMat);
  ground.castShadow = ground.receiveShadow = true;
  group.add(ground);

  const inst = (g: THREE.BufferGeometry, m: THREE.Material, list: THREE.Matrix4[], cast = true): THREE.InstancedMesh | null => {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(g, m, list.length);
    list.forEach((mm, i) => mesh.setMatrixAt(i, mm));
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  };
  // userData.occluder: the geometry ./bake.ts merges into the depth-only occluder instead (null = none)
  const instBuilt = (b: Built, list: THREE.Matrix4[], cast = true, occlude = true): void => {
    for (const part of b.parts) {
      const mesh = inst(part.geo, mats[part.mat as MatId], list, cast && part.mat !== 'glow');
      if (mesh && !occlude) mesh.userData.occluder = null;
    }
  };
  const rockGeos = Array.from({ length: ROCK_VARIANTS }, (_, i) => rockGeo(seed + i * 13));
  const rockLow = Array.from({ length: ROCK_VARIANTS }, (_, i) => rockGeo(seed + i * 13, 1)); // same cuts, 1/16 the tris
  rockGeos.forEach((g, i) => {
    const mesh = inst(g, tMat, rocks[i]!);
    if (mesh) mesh.userData.occluder = rockLow[i];
  });
  const cGeo = crystalGeo();
  const cCol = new THREE.Color(st.crystal);
  const cBody = new THREE.Color(p.cliff).lerp(cCol, st.crystalSat).multiplyScalar(0.7);
  const cMat = new THREE.MeshStandardMaterial({ color: cBody, emissive: cCol.clone().multiplyScalar(st.crystalGlow), roughness: 0.28, metalness: 0.1, flatShading: true, envMap, envMapIntensity: 0.7 });
  const cMesh = inst(cGeo, cMat, crystals.map((c) => c.m));
  crystals.forEach((c, i) => cMesh?.setColorAt(i, new THREE.Color(1, 1, 1).multiplyScalar(0.75 + c.k * 0.5)));
  const wr = wreckModels();
  wr.forEach((b, i) => instBuilt(b, wrecks[i]!));
  const pad = padModel(p.buildPad, PAD_Y);
  instBuilt(pad, pads, false, false); // flat: not worth occluding
  const frameGeo = padFrameGeo(PAD_Y);
  const frameMat = new THREE.MeshBasicMaterial();
  const accentDim = new THREE.Color(p.accent).multiplyScalar(0.7);
  const frames = inst(frameGeo, frameMat, pads, false);
  if (frames) {
    pads.forEach((_, i) => frames.setColorAt(i, accentDim));
    live.push(frames);
  }
  let occupied = padKeys.map(() => false);

  // live glow parts get their own material: the shared unit materials may be disposed once a pre-render is done
  const liveGlow = new THREE.MeshBasicMaterial({ vertexColors: true });
  const liveMats = { ...mats, glow: liveGlow };
  const portal = portalModel();
  const rings: THREE.Object3D[] = [];
  for (const at of spawns) {
    const body = builtToGroup(portal.body, mats);
    const ring = builtToGroup(portal.ring, liveMats);
    body.position.copy(at);
    ring.position.copy(at);
    group.add(body, ring);
    rings.push(ring);
    live.push(ring);
  }
  const core = coreModel(p.core);
  const coreGlows: THREE.Object3D[] = [];
  for (const at of cores) {
    const body = builtToGroup(core.body, mats);
    const glow = builtToGroup(core.glow, liveMats);
    body.position.copy(at);
    glow.position.copy(at);
    group.add(body, glow);
    coreGlows.push(glow);
    live.push(glow);
  }
  const ms = performance.now() - t0;
  return {
    group,
    live,
    topAt,
    ms,
    setOccupied(keys) {
      if (!frames) return;
      const next = padKeys.map((k) => keys.has(k));
      let dirty = false;
      next.forEach((o, i) => {
        if (o === occupied[i]) return;
        frames.setColorAt(i, o ? TEAM_AMBER : accentDim);
        dirty = true;
      });
      occupied = next;
      if (dirty && frames.instanceColor) frames.instanceColor.needsUpdate = true;
    },
    update(time) {
      const s = 1 + Math.sin(time * 4) * 0.06;
      for (const r of rings) {
        r.scale.set(s, 1, s);
        r.rotation.y = time * 0.8;
      }
      for (const g of coreGlows) g.visible = Math.sin(time * 2.2) > -0.85;
    },
    dispose() {
      for (const t of [sets.ground, sets.path, sets.rock]) for (const x of Object.values(t)) (x as THREE.Texture).dispose();
      [geo, cGeo, frameGeo, ...rockGeos, ...rockLow, maskTex, tMat, cMat, frameMat, liveGlow].forEach((d) => d.dispose());
      group.traverse((o) => o instanceof THREE.InstancedMesh && o.dispose());
    },
  };
}
