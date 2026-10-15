// HD terrain prototype (docs/terrain-hd.md): a real map under the real HD unit sprites, game camera, busy fake state.
//   ?map=dust-ridge|cinder-forge|hollow-spire (id prefix)   ?v=0..3 variant:
//     0 current terrain (src/render/terrain.ts) in the 384p posterized pass — the game today
//     1 HD terrain (src/render/hd/terrain) real-time PBR at native resolution, MSAA
//     2 HD terrain pre-rendered once into a texture at the sprites' px/unit, drawn as one quad (+ live pad lights etc.)
//     3 hybrid: HD terrain through the posterized pixel pass at 2x internal resolution (~720p)
//   &res=2560x1440 fixed drawing buffer (CSS-scaled to the window)   &auto  shoot + bench, POST to the dev helper
// window.__bench(frames) -> per-zoom ms/frame, draw calls; window.__shot(name); window.__zoom(24|30|40).
import * as THREE from 'three';
import { ENEMIES, MAP_LIST, TOWER_LIST } from '../src/data';
import type { MapDef } from '../src/data/types';
import { mapEnemies } from '../src/render';
import { createCameraRig, DEFAULT_PPU } from '../src/render/camera';
import { bakeAtlas, enemyEntry, makeMaterials, towerEntry } from '../src/render/hd';
import { bakeTerrain } from '../src/render/hd/terrain/bake';
import { createHdTerrain, gpuBytes } from '../src/render/hd/terrain/build';
import { createInterp } from '../src/render/interp';
import { createPixelPass, OVERLAY_LAYER } from '../src/render/pixel';
import { createTerrain } from '../src/render/terrain';
import { createUnits } from '../src/render/units';
import { buildPath, pointAt } from '../src/sim/path';
import type { EnemyState, GameState, TowerState } from '../src/sim/types';

const q = new URLSearchParams(location.search);
const V = THREE.MathUtils.clamp(Number(q.get('v') ?? 2), 0, 3);
const map: MapDef = MAP_LIST.find((m) => m.id.startsWith(q.get('map') ?? 'dust')) ?? MAP_LIST[0]!;
const RES = q.get('res')?.split('x').map(Number) as [number, number] | undefined;
const LABEL = ['V0 current', 'V1 real-time HD', 'V2 pre-rendered HD', 'V3 hybrid pixel HD'][V]!;
const SUN_DIR = new THREE.Vector3(-6, 14, -5); // as src/render/index.ts
const SUN_I = 3.2, HEMI_I = 2.0;
const ENEMIES_PER_PATH = 30;

// --- nav ---------------------------------------------------------------------------------------------------------
const bar = document.getElementById('bar')!;
const link = (label: string, params: Record<string, string | null>, on: boolean): void => {
  const p = new URLSearchParams(location.search);
  p.delete('auto');
  for (const [k, v] of Object.entries(params)) v === null ? p.delete(k) : p.set(k, v);
  const a = document.createElement('a');
  a.href = `?${p}`;
  a.textContent = label;
  a.className = on ? 'on' : '';
  bar.appendChild(a);
};
for (let v = 0; v < 4; v++) link(`V${v}`, { v: String(v) }, v === V);
for (const m of MAP_LIST) link(m.name, { map: m.id.split('-').slice(0, 2).join('-') }, m.id === map.id);

// --- renderer ----------------------------------------------------------------------------------------------------
const view = document.getElementById('view')!;
const gl = new THREE.WebGLRenderer({ antialias: V === 1, powerPreference: 'high-performance' });
gl.toneMapping = THREE.NoToneMapping;
gl.shadowMap.enabled = true;
gl.shadowMap.type = V === 0 ? THREE.BasicShadowMap : THREE.PCFShadowMap;
gl.info.autoReset = false;
const canvas = gl.domElement;
view.appendChild(canvas);
const size = new THREE.Vector2();
if (RES) {
  gl.setPixelRatio(1);
  gl.setSize(RES[0], RES[1], false);
} else {
  gl.setPixelRatio(devicePixelRatio);
  gl.setSize(view.clientWidth, view.clientHeight, false);
}
gl.getDrawingBufferSize(size);

const pixel = createPixelPass();
const { w: rtW, h: rtH } = pixel.resize(size.x, size.y);
if (V === 3) pixel.target.setSize(rtW * 2, rtH * 2); // same frustum, twice the texels; uvScale is unchanged
const rig = createCameraRig(canvas, map.cols, map.rows);
rig.setTargetSize(rtW, rtH);
const camera = rig.camera;
{ // open on the fight, as src/render/index.ts
  const rect = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  const core = { x: map.cols / 2, z: map.rows / 2 };
  map.tiles.forEach((row, r) => row.forEach((t, c) => {
    if (t !== 'spawn' && t !== 'core') return;
    if (t === 'core') Object.assign(core, { x: c + 0.5, z: r + 0.5 });
    Object.assign(rect, { x0: Math.min(rect.x0, c - 0.4), z0: Math.min(rect.z0, r - 1), x1: Math.max(rect.x1, c + 1.4), z1: Math.max(rect.z1, r + 1.5) });
  }));
  rig.frame(rect, core);
}

const scene = new THREE.Scene();
const bg = new THREE.Color(map.palette.void);
scene.background = bg;
const cx = map.cols / 2, cz = map.rows / 2;
const sun = new THREE.DirectionalLight(map.palette.keyLight, SUN_I);
sun.position.set(cx, 0, cz).add(SUN_DIR);
sun.target.position.set(cx, 0, cz);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(V === 0 ? 1024 : 2048);
sun.shadow.bias = V === 0 ? -0.0005 : -0.0003;
sun.shadow.normalBias = V === 0 ? 0.02 : 0.015;
sun.shadow.radius = 2;
const ext = Math.max(map.cols, map.rows) / 2 + 3;
Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 40 });
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun, sun.target, new THREE.HemisphereLight(map.palette.hemiSky, map.palette.hemiGround, HEMI_I));

// sprite density: as the game (src/render/index.ts)
const ppu = THREE.MathUtils.clamp(Math.round((size.y / rtH) * DEFAULT_PPU), 96, 128);

// --- terrain per variant -------------------------------------------------------------------------------------------
const metrics: Record<string, unknown> = { variant: V, label: LABEL, map: map.id, res: `${size.x}x${size.y}`, ppu };
let terrainBytes = 0;
let topAt: (c: number, r: number) => number;
let setOccupied: (k: ReadonlySet<string>) => void;
let updateTerrain: (t: number) => void;
const t0 = performance.now();
if (V === 0) {
  const t = createTerrain(map);
  scene.add(t.group);
  ({ topAt, setOccupied, update: updateTerrain } = t);
  metrics.buildMs = Math.round(performance.now() - t0);
  terrainBytes = gpuBytes(t.group) + 1024 * 1024 * 4; // + shadow map (depth)
} else {
  const hd = createHdTerrain(map, gl);
  ({ topAt, setOccupied, update: updateTerrain } = hd);
  metrics.buildMs = Math.round(hd.ms);
  scene.add(hd.group);
  if (V === 2) {
    hd.live.forEach((o) => (o.visible = false));
    const baked = bakeTerrain(gl, scene, sun, ppu);
    metrics.bakeMs = Math.round(baked.ms);
    metrics.bakeSize = baked.size;
    hd.live.forEach((o) => (o.visible = true));
    // keep only the live objects, the quad and a depth-only proxy of the ground (hover/FX depth); free the rest
    const keep = new Set<THREE.Texture>();
    for (const o of hd.live) gpuTextures(o).forEach((t) => keep.add(t));
    gpuTextures(hd.group).forEach((t) => keep.has(t) || t.dispose());
    scene.remove(hd.group);
    for (const o of [...hd.live]) scene.add(o);
    const proxy = new THREE.Mesh(hd.ground.geometry, new THREE.MeshBasicMaterial({ colorWrite: false }));
    proxy.renderOrder = -5;
    scene.add(baked.quad, proxy);
    sun.castShadow = false; // nothing real-time casts
    terrainBytes = baked.bytes + gpuBytes(proxy) + hd.live.reduce((n, o) => n + gpuBytes(o), 0);
  } else {
    terrainBytes = gpuBytes(hd.group) + 2048 * 2048 * 4 + (V === 3 ? rtW * rtH * 4 * 3 : 0); // + shadow map; V3: the bigger pixel target
  }
}
metrics.terrainMB = +(terrainBytes / 1048576).toFixed(1);

function gpuTextures(root: THREE.Object3D): THREE.Texture[] {
  const out = new Set<THREE.Texture>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.Material & { userData: { tex?: THREE.Texture[] } };
    for (const v of Object.values(m)) if (v instanceof THREE.Texture) out.add(v);
    for (const t of m.userData.tex ?? []) out.add(t);
  });
  return [...out];
}

// --- unit sprites (as the game) --------------------------------------------------------------------------------------
const tAtlas = performance.now();
const mats = makeMaterials(gl);
const prevType = gl.shadowMap.type;
gl.shadowMap.type = THREE.PCFShadowMap;
const atlas = bakeAtlas(gl, [
  ...TOWER_LIST.flatMap((t) => ([1, 2, 3] as const).map((lv) => towerEntry(t.id, lv))),
  ...mapEnemies(map).map(enemyEntry),
], mats, { dir: SUN_DIR, sunColor: map.palette.keyLight, sunI: SUN_I, sky: map.palette.hemiSky, ground: map.palette.hemiGround, hemiI: HEMI_I }, ppu);
gl.shadowMap.type = prevType;
for (const m of Object.values(mats)) {
  for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
  m.dispose();
}
metrics.atlasMs = Math.round(performance.now() - tAtlas);
metrics.atlasMB = +(atlas.bytes / 1048576).toFixed(1);
gl.shadowMap.autoUpdate = false;
gl.shadowMap.needsUpdate = true;
gl.autoClear = false;

const interp = createInterp();
const units = createUnits(scene, interp, atlas, topAt);
const spriteScene = new THREE.Scene().add(units.sprites);
const spriteCam = new THREE.OrthographicCamera();
function syncSpriteCam(): void {
  const { left, right, top, bottom, near, far } = camera;
  Object.assign(spriteCam, { left, bottom, near, far, right: left + (right - left) * pixel.uvScale.x, top: bottom + (top - bottom) * pixel.uvScale.y });
  spriteCam.updateProjectionMatrix();
  spriteCam.position.copy(camera.position);
  spriteCam.quaternion.copy(camera.quaternion);
  spriteCam.updateMatrixWorld();
}

// --- busy fake state: a tower on every pad, ENEMIES_PER_PATH marching per path ---------------------------------------
const pads: [number, number][] = [];
map.tiles.forEach((row, r) => row.forEach((t, c) => t === 'build' && pads.push([c, r])));
let towers: TowerState[] = pads.map(([col, row], i) => ({
  id: i + 1, defId: TOWER_LIST[i % TOWER_LIST.length]!.id, col, row, level: ((i % 3) + 1) as 1 | 2 | 3,
  targeting: 'first', rotation: 0, cooldown: 0, targetId: null, totalDamage: 0, kills: 0, sellValue: 0,
}));
const occupied = new Set<string>();
pads.forEach(([c, r], i) => i % 4 !== 3 && occupied.add(`${c},${r}`)); // leave every 4th pad empty to show free pads
towers = towers.filter((t) => occupied.has(`${t.col},${t.row}`));
const enemyIds = mapEnemies(map);
const geos = map.paths.map((p) => buildPath(p));
function enemiesAt(time: number): EnemyState[] {
  const out: EnemyState[] = [];
  let id = 1;
  geos.forEach((geo, pi) => {
    for (let k = 0; k < ENEMIES_PER_PATH; k++) {
      const defId = enemyIds[(k + pi * 4) % enemyIds.length]!;
      const def = ENEMIES[defId];
      const d = (time * 1.1 + k * (geo.length / ENEMIES_PER_PATH)) % geo.length;
      const dmg = ((k * 37) % 100) / 100;
      out.push({
        id: id++, defId, pathIndex: pi, ...pointAt(geo, d), progress: d, distanceToCore: geo.length - d,
        hp: def.hp * (k % 3 === 0 ? 1 : 1 - dmg * 0.9), maxHp: def.hp, shield: def.shield * (k % 2 ? 0.6 : 1), maxShield: def.shield,
        slowed: k % 4 === 1, midBoss: false,
      });
    }
  });
  return out;
}

let time = 0;
function draw(dt: number): void {
  time += dt;
  rig.update(dt);
  const enemies = enemiesAt(time);
  towers = towers.map((t, i) => {
    let best: EnemyState | undefined;
    let bd = 4;
    for (const e of enemies) {
      const d = Math.hypot(e.x - t.col - 0.5, e.y - t.row - 0.5);
      if (d < bd) [bd, best] = [d, e];
    }
    return { ...t, rotation: best ? Math.atan2(best.y - t.row - 0.5, best.x - t.col - 0.5) : time * 0.6 + i };
  });
  const state: GameState = {
    mapId: map.id, difficultyId: 'normal', status: 'playing', speed: 1, time, cash: 600, lives: 20, waveIndex: 0,
    waveCount: map.waves.length, waveActive: true, nextWaveIn: null, towers, enemies, projectiles: [], events: [],
  };
  units.sync(state, dt);
  setOccupied(occupied);
  updateTerrain(time);

  gl.info.reset();
  syncSpriteCam();
  if (V === 0 || V === 3) {
    camera.layers.set(0);
    gl.setRenderTarget(pixel.target);
    gl.render(scene, camera);
    pixel.blit(gl);
    gl.render(spriteScene, spriteCam);
    gl.setRenderTarget(pixel.target);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, false, false);
    camera.layers.set(OVERLAY_LAYER);
    scene.background = null;
    gl.render(scene, camera);
    scene.background = bg;
    camera.layers.set(0);
    pixel.blitOverlay(gl);
  } else {
    // native resolution: world, sprites, overlay layer (HP bars) straight to the canvas
    gl.setRenderTarget(null);
    gl.render(scene, spriteCam);
    gl.render(spriteScene, spriteCam);
    spriteCam.layers.set(OVERLAY_LAYER);
    scene.background = null;
    gl.render(scene, spriteCam);
    scene.background = bg;
    spriteCam.layers.set(0);
  }
}

// --- zoom, bench, shots ------------------------------------------------------------------------------------------
const zoomNow = (): number => Math.round(rtW / (camera.right - camera.left));
function setZoom(z: number): void {
  for (let i = 0; i < 3 && zoomNow() !== z; i++) canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: z > zoomNow() ? -1 : 1, cancelable: true }));
}
for (const z of [24, 30, 40]) {
  const b = document.createElement('button');
  b.textContent = `zoom ${z}`;
  b.onclick = () => setZoom(z);
  bar.appendChild(b);
}
const ctx = gl.getContext();
const px = new Uint8Array(4);
function sync(): void {
  gl.setRenderTarget(null);
  ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
}
let paused = false;
function bench(frames = 120): Record<string, { ms: number; calls: number; tris: number }> {
  paused = true;
  const out: Record<string, { ms: number; calls: number; tris: number }> = {};
  for (const z of [24, 30, 40]) {
    setZoom(z);
    for (let i = 0; i < 10; i++) draw(1 / 60);
    sync();
    const calls = gl.info.render.calls, tris = gl.info.render.triangles;
    const s = performance.now();
    for (let i = 0; i < frames; i++) draw(1 / 60);
    sync();
    out[`z${z}`] = { ms: +((performance.now() - s) / frames).toFixed(2), calls, tris };
  }
  setZoom(30);
  paused = false;
  return out;
}
async function shot(name: string): Promise<void> {
  draw(0);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png')); // same task as the draw
  if (blob) await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
}
Object.assign(window, { __bench: bench, __shot: shot, __zoom: setZoom, __metrics: metrics, __draw: draw });

const hud = document.getElementById('hud')!;
const hudText = (): string =>
  `${LABEL}  ${map.name}  ${metrics.res}  zoom ${zoomNow()}  calls ${gl.info.render.calls}  tris ${gl.info.render.triangles}\n` +
  `terrain build ${metrics.buildMs} ms${metrics.bakeMs !== undefined ? ` + bake ${metrics.bakeMs} ms (${metrics.bakeSize})` : ''}  ~${metrics.terrainMB} MB` +
  `   sprites ${metrics.atlasMB} MB @ ${ppu} px/unit` + (metrics.bench ? `\n${JSON.stringify(metrics.bench)}` : '');

let last = performance.now();
function loop(now: number): void {
  if (!paused) draw(Math.min(0.1, Math.max(0, (now - last) / 1000)));
  last = now;
  hud.textContent = hudText();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (q.has('auto')) {
  void (async () => {
    for (let i = 0; i < 30; i++) draw(1 / 60);
    const short = map.id.split('-')[0];
    setZoom(30);
    await shot(`${short}-v${V}-z30.png`);
    setZoom(40);
    await shot(`${short}-v${V}-z40.png`);
    metrics.bench = bench();
    await fetch(`/__shot?name=${short}-v${V}.json`, { method: 'POST', body: JSON.stringify(metrics) });
    Object.assign(window, { __done: true });
  })();
}
