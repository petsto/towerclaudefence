// HD model showroom. Left: real-time close-up of the model(s) (turntable, walk cycle). Right: the same units baked
// into the sprite atlas and drawn over the pixel terrain, exactly as the game will.
//   ?unit=<towerId|enemyId>  focus one unit (one copy per baked yaw frame); omit for every unit in a grid
//   &level=1|2|3             tower level (focus)          &zoom=24|32|40  sprite pane game zoom (default 40 focus, 24 grid)
//   &ppu=<n>                 bake px per unit (default: the sprite pane's screen density, as the game will)
//   &map=<id>                terrain + light palette      &still          freeze animation
// window.__hd: bake stats; window.__draw(dt) advances dt seconds (also when still) and renders (hidden panes stall rAF).
import * as THREE from 'three';
import { ENEMIES, MAP_LIST, MAPS, TOWER_LIST } from '../src/data';
import type { EnemyId, MapId, TowerId } from '../src/data/types';
import {
  bakeAtlas, builtToGroup, createSprites, ENEMY_YAW, enemyBuilt, enemyEntry, enemyFrame, makeMaterials,
  TOWER_BASE, TOWER_YAW, towerBuilt, towerEntry, towerFrame, towerKey, WALK, type BakeEntry, type Built, type Level, type SpriteItem,
} from '../src/render/hd';
import { createPixelPass } from '../src/render/pixel';
import { createTerrain } from '../src/render/terrain';

const q = new URLSearchParams(location.search);
const TOWER_IDS = TOWER_LIST.map((t) => t.id);
const ENEMY_IDS = Object.keys(ENEMIES) as EnemyId[];
const unit = q.get('unit');
const focusTower = TOWER_IDS.find((id) => id === unit) ?? null;
const focusEnemy = ENEMY_IDS.find((id) => id === unit) ?? null;
const GRID = !focusTower && !focusEnemy;
const LEVEL = Math.min(3, Math.max(1, Number(q.get('level') ?? 1))) as Level;
const STILL = q.has('still');
const ZOOM = Number(q.get('zoom') ?? (GRID ? 24 : 40));
const map = MAPS[q.get('map') as MapId] ?? MAPS['dust-ridge-outpost'];
const pal = map.palette;
const PITCH = THREE.MathUtils.degToRad(55);
const SUN_DIR = new THREE.Vector3(-6, 14, -5); // as src/render/index.ts
const SUN_I = 3.2, HEMI_I = 2.0;
const SPLIT = 0.4; // left pane share of the width

// --- nav ---------------------------------------------------------------------------------------------------------
const bar = document.getElementById('bar')!;
const link = (label: string, params: Record<string, string | null>, on: boolean): void => {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(params)) v === null ? p.delete(k) : p.set(k, v);
  const a = document.createElement('a');
  a.href = `?${p}`;
  a.textContent = label;
  a.className = on ? 'on' : '';
  bar.appendChild(a);
};
link('grid', { unit: null, level: null }, GRID);
for (const id of TOWER_IDS) link(id, { unit: id }, focusTower === id);
for (const id of ENEMY_IDS) link(id, { unit: id, level: null }, focusEnemy === id);
if (focusTower) for (const lv of [1, 2, 3]) link(`L${lv}`, { level: String(lv) }, LEVEL === lv);
for (const m of MAP_LIST) link(m.name, { map: m.id }, m.id === map.id);
link(STILL ? 'still: on' : 'still: off', { still: STILL ? null : '1' }, STILL);

// --- shared renderer (left and right panes are viewports of one canvas) ------------------------------------------
const gl = new THREE.WebGLRenderer({ antialias: true });
gl.setPixelRatio(devicePixelRatio);
gl.setSize(innerWidth, innerHeight);
gl.shadowMap.enabled = true;
gl.shadowMap.type = THREE.PCFShadowMap;
gl.toneMapping = THREE.NoToneMapping; // as in the game: Neutral/ACES wash out the lit sand
gl.autoClear = false;
document.body.prepend(gl.domElement);
const mats = makeMaterials(gl);

function lights(scene: THREE.Scene, at: THREE.Vector3, ext: number): void {
  const sun = new THREE.DirectionalLight(pal.keyLight, SUN_I);
  sun.position.copy(at).add(SUN_DIR);
  sun.target.position.copy(at);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 60 });
  scene.add(sun, sun.target, new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, HEMI_I));
}

// --- layout: where each unit stands (same arrangement in both panes) -------------------------------------------------
interface Slot { x: number; z: number; tower?: TowerId; level?: Level; enemy?: EnemyId; yaw: number }
const slots: Slot[] = [];
if (GRID) {
  TOWER_IDS.forEach((id, c) => ([1, 2, 3] as const).forEach((lv, r) => slots.push({ x: 4.5 + c * 1.6, z: 3.5 + r * 1.5, tower: id, level: lv, yaw: 0 })));
  ENEMY_IDS.forEach((id, i) => slots.push({ x: 3.5 + i * 1.6, z: 9 + (i % 2) * 1.6, enemy: id, yaw: 0 }));
} else {
  const n = focusTower ? TOWER_YAW : ENEMY_YAW; // one per baked yaw frame
  for (let f = 0; f < n; f++) {
    const x = 9 + (f % 4) * 1.3, z = 5 + Math.floor(f / 4) * 1.3, yaw = (f / n) * Math.PI * 2;
    slots.push(focusTower ? { x, z, tower: focusTower, level: LEVEL, yaw } : { x, z, enemy: focusEnemy!, yaw });
  }
}
const centre = slots.reduce((c, s) => c.set(c.x + s.x / slots.length, 0, c.z + s.z / slots.length), new THREE.Vector3());

// --- left pane: real-time models ---------------------------------------------------------------------------------
const rtScene = new THREE.Scene();
rtScene.background = new THREE.Color(pal.void);
const rtGround = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: pal.ground }));
rtGround.receiveShadow = true;
rtScene.add(rtGround);
lights(rtScene, new THREE.Vector3(), GRID ? 9 : 1.5);
interface Live { root: THREE.Group; walk: THREE.Group[]; slot: Slot }
const live: Live[] = [];
const rtSlots = GRID ? slots : [{ ...slots[0]!, x: 0, z: 0 }]; // focus: a single close-up
for (const s of rtSlots) {
  const root = new THREE.Group();
  const walk = s.tower ? [builtToGroup(towerBuilt(s.tower, s.level!), mats)] : Array.from({ length: WALK }, (_, w) => builtToGroup(enemyBuilt(s.enemy!, w), mats));
  root.add(...walk);
  root.position.set(GRID ? s.x - centre.x : 0, 0, GRID ? s.z - centre.z : 0);
  rtScene.add(root);
  live.push({ root, walk, slot: s });
}
const rtCam = new THREE.OrthographicCamera();
const fit = new THREE.Box3().setFromObject(live[0]!.root).getSize(new THREE.Vector3());
const RT_VIEW = GRID ? [15, 9] : [1, 1].map(() => Math.max(fit.x, fit.y, fit.z) * 1.5); // world units that must fit (w, h)

// --- right pane: sprites over the pixel terrain ------------------------------------------------------------------
const spScene = new THREE.Scene();
spScene.background = new THREE.Color(pal.void);
lights(spScene, new THREE.Vector3(map.cols / 2, 0, map.rows / 2), Math.max(map.cols, map.rows) / 2 + 3);
const terrain = createTerrain(map);
spScene.add(terrain.group);
const px = createPixelPass();
const spCam = new THREE.OrthographicCamera();
const spriteScene = new THREE.Scene();
const size = new THREE.Vector2();
let rtW = 1, rtH = 1;

function layout(): void {
  gl.setSize(innerWidth, innerHeight);
  gl.getDrawingBufferSize(size);
  const lw = Math.round(size.x * SPLIT);
  ({ w: rtW, h: rtH } = px.resize(size.x - lw, size.y));
  const w = rtW / ZOOM, h = rtH / ZOOM;
  Object.assign(spCam, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2, near: 1, far: 200 });
  spCam.updateProjectionMatrix();
  spCam.position.set(centre.x, 60 * Math.sin(PITCH), centre.z + 60 * Math.cos(PITCH));
  spCam.lookAt(centre.x, 0, centre.z);
  const a = lw / size.y, vh = Math.max(RT_VIEW[1]!, RT_VIEW[0]! / a);
  Object.assign(rtCam, { left: (-vh * a) / 2, right: (vh * a) / 2, top: vh / 2, bottom: -vh / 2, near: 1, far: 200 });
  rtCam.updateProjectionMatrix();
  const ty = GRID ? 0 : fit.y * 0.4;
  rtCam.position.set(0, ty + 60 * Math.sin(PITCH), 60 * Math.cos(PITCH));
  rtCam.lookAt(0, ty, 0);
}
layout();

// bake at the sprite pane's on-screen density (physical px per world unit), as the game does
const ppu = Number(q.get('ppu') ?? Math.round(((size.y / rtH) * ZOOM)));
const entries: BakeEntry[] = [];
for (const s of slots) {
  const key = s.tower ? towerKey(s.tower, s.level!) : s.enemy!;
  if (!entries.some((e) => e.key === key)) entries.push(s.tower ? towerEntry(s.tower, s.level!) : enemyEntry(s.enemy!));
}
const atlas = bakeAtlas(gl, entries, mats, { dir: SUN_DIR, sunColor: pal.keyLight, sunI: SUN_I, sky: pal.hemiSky, ground: pal.hemiGround, hemiI: HEMI_I }, ppu);
const sprites = createSprites(atlas, slots.length * 2);
spriteScene.add(sprites.mesh);

// --- HUD ---------------------------------------------------------------------------------------------------------
const built = (s: Slot): Built => (s.tower ? towerBuilt(s.tower, s.level!) : enemyBuilt(s.enemy!, 0));
const tag = (s: Slot): string => `${s.tower ? `${s.tower} L${s.level}` : s.enemy} ${(built(s).tris / 1000).toFixed(1)}k tris`;
const stats = {
  ppu, atlas: atlas.size, mb: +(atlas.bytes / 1048576).toFixed(1), bakeMs: Math.round(atlas.ms), entries: entries.length,
  cells: Object.fromEntries(entries.map((e) => { const [, , w, h] = atlas.quad(e.key); return [e.key, `${Math.round(w * ppu)}x${Math.round(h * ppu)}`]; })),
};
Object.assign(window, { __hd: stats });
document.getElementById('hud-rt')!.textContent = GRID ? `real-time, ${live.length} models` : `real-time close-up\n${tag(slots[0]!)}`;
const hudSp = document.getElementById('hud-sp')!;
hudSp.style.left = `${SPLIT * 100}%`;
hudSp.style.marginLeft = '8px';
hudSp.textContent = `sprites over pixel terrain (zoom ${ZOOM})\natlas ${atlas.size} ${stats.mb} MB  bake ${stats.bakeMs} ms  ${ppu} px/unit` +
  (GRID ? `  ${entries.length} entries` : `  cell ${stats.cells[entries[0]!.key]} px`);

// --- loop --------------------------------------------------------------------------------------------------------
const list: SpriteItem[] = [];
const WALK_HZ = 1.4; // walk cycles per second
let time = 0;
function draw(dt: number): void {
  time += dt;
  const phase = time * WALK_HZ;
  // left
  for (const l of live) {
    l.root.rotation.y = -(STILL ? 0.6 : time * 0.5);
    const w = Math.floor(phase * WALK) % l.walk.length;
    l.walk.forEach((g, i) => (g.visible = i === w));
  }
  // right
  list.length = 0;
  slots.forEach((s, i) => {
    let { x, z, yaw } = s;
    if (s.tower) {
      if (GRID) yaw = time * 0.6 + i;
      else if (!STILL) yaw += time * 0.8;
      const y = terrain.topAt(Math.floor(x), Math.floor(z));
      const key = towerKey(s.tower, s.level!);
      list.push({ x, y, z, key, frame: TOWER_BASE, order: 0 });
      if (atlas.turret(key)) list.push({ x, y, z, key, frame: towerFrame(yaw), order: 1 });
    } else {
      if (GRID) {
        // walk a small circle: every heading, walk phase from distance
        const a = time * 0.9 + i;
        x += Math.cos(a) * 0.45;
        z += Math.sin(a) * 0.45;
        yaw = a + Math.PI / 2;
      }
      list.push({ x, y: terrain.topAt(Math.floor(x), Math.floor(z)), z, key: s.enemy!, frame: enemyFrame(yaw, phase + i * 0.37), order: 2 });
    }
  });
  sprites.set(list);
  terrain.update(time);

  gl.getDrawingBufferSize(size);
  const pr = gl.getPixelRatio();
  const lw = Math.round(size.x * SPLIT);
  gl.setScissorTest(true);
  gl.setRenderTarget(px.target);
  gl.clear();
  gl.render(spScene, spCam);
  gl.setViewport(lw / pr, 0, (size.x - lw) / pr, size.y / pr);
  gl.setScissor(lw / pr, 0, (size.x - lw) / pr, size.y / pr);
  px.blit(gl);
  gl.render(spriteScene, spCam);
  gl.setViewport(0, 0, lw / pr, size.y / pr);
  gl.setScissor(0, 0, lw / pr, size.y / pr);
  gl.clear();
  gl.render(rtScene, rtCam);
  gl.setScissorTest(false);
}
let last = performance.now();
function loop(now: number): void {
  draw(STILL ? 0 : Math.min(0.1, (now - last) / 1000));
  last = now;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
addEventListener('resize', layout);
Object.assign(window, { __draw: draw });
