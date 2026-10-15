// Dev-only renderer check: renders a map with a fake GameState. ?map=<id>, ?towers=all fills every pad,
// ?enemies=<n> per path (default 14), ?res=WxH fixes the drawing buffer (physical px).
// window.__bench(frames) -> ms/frame + draw calls at zoom 24/30/40; window.__step(dt) renders one frame.
import { ENEMIES, MAP_LIST, MAPS, TOWER_LIST } from '../src/data';
import type { MapId } from '../src/data/types';
import { createRenderer, mapEnemies } from '../src/render';
import { buildPath, pointAt } from '../src/sim/path';
import type { EnemyState, GameState, TowerState } from '../src/sim/types';

const params = new URLSearchParams(location.search);
const map = MAPS[(params.get('map') as MapId) ?? 'dust-ridge-outpost'] ?? MAP_LIST[0]!;
const allTowers = params.get('towers') === 'all';
const perPath = Number(params.get('enemies') ?? 14);
const res = params.get('res')?.split('x').map(Number);
const view = document.getElementById('view')!;
if (res) Object.assign(view.style, { right: 'auto', bottom: 'auto', width: `${res[0]! / devicePixelRatio}px`, height: `${res[1]! / devicePixelRatio}px` });

const nav = document.getElementById('maps')!;
for (const m of MAP_LIST) {
  const a = document.createElement('a');
  a.href = `?map=${m.id}${allTowers ? '&towers=all' : ''}`;
  a.textContent = m.name;
  nav.appendChild(a);
}

const t0 = performance.now();
const renderer = createRenderer(view, map);
const loadMs = Math.round(performance.now() - t0);
const hud = document.getElementById('hud')!;

// Towers on a spread of pads.
const pads: [number, number][] = [];
map.tiles.forEach((row, r) => row.forEach((t, c) => t === 'build' && pads.push([c, r])));
const towerPads = allTowers ? pads : pads.filter((_, i) => i % 5 === 0).slice(0, 10);
let towers: TowerState[] = towerPads.map(([col, row], i) => ({
  id: i + 1,
  defId: TOWER_LIST[i % TOWER_LIST.length]!.id,
  col,
  row,
  level: ((i % 3) + 1) as 1 | 2 | 3,
  targeting: 'first',
  rotation: 0,
  cooldown: 0,
  targetId: null,
  totalDamage: 0,
  kills: 0,
  sellValue: 0,
}));

// Enemies marching along each path.
const enemyIds = mapEnemies(map); // the atlas bakes only this map's enemies
function enemiesAt(time: number): EnemyState[] {
  const out: EnemyState[] = [];
  let id = 1;
  map.paths.forEach((p, pi) => {
    const geo = buildPath(p);
    const len = geo.length;
    for (let k = 0; k < perPath; k++) {
      const defId = enemyIds[(k + pi * 4) % enemyIds.length]!;
      const def = ENEMIES[defId];
      const d = (time * 1.2 + k * (len / perPath)) % len;
      const pos = pointAt(geo, d);
      const dmg = (k * 37) % 100 / 100;
      out.push({
        id: id++,
        defId,
        pathIndex: pi,
        ...pos,
        progress: d,
        distanceToCore: len - d,
        hp: def.hp * (k % 3 === 0 ? 1 : 1 - dmg * 0.9),
        maxHp: def.hp,
        shield: def.shield * (k % 2 ? 0.6 : 1),
        maxShield: def.shield,
        slowed: k % 4 === 1,
        midBoss: false,
      });
    }
  });
  return out;
}

let time = 0;
let last = performance.now();
let selected: number | null = null;
let fps = 60;

view.addEventListener('pointermove', (e) => {
  const t = renderer.pickTile(e.clientX, e.clientY);
  const free = t !== null && map.tiles[t.row]?.[t.col] === 'build' && !towers.some((w) => w.col === t.col && w.row === t.row);
  renderer.setHover(t, free);
});
view.addEventListener('click', (e) => {
  const t = renderer.pickTile(e.clientX, e.clientY);
  const tw = t && towers.find((w) => w.col === t.col && w.row === t.row);
  selected = tw ? tw.id : null;
  renderer.setSelectedTower(selected);
  renderer.setRangePreview(tw ? { x: tw.col + 0.5, y: tw.row + 0.5, rangeTiles: 3.5 } : null);
});

function step(dt: number): void {
  time += dt;
  const enemies = enemiesAt(time);
  towers = towers.map((t, i) => {
    let best: EnemyState | undefined;
    let bd = 4;
    for (const e of enemies) {
      const d = Math.hypot(e.x - t.col - 0.5, e.y - t.row - 0.5);
      if (d < bd) [bd, best] = [d, e];
    }
    const rotation = best ? Math.atan2(best.y - t.row - 0.5, best.x - t.col - 0.5) : time * 0.8 + i;
    // tower 1 cycles levels to exercise rebuild-on-upgrade
    const level = i === 0 ? ((Math.floor(time / 3) % 3) + 1) as 1 | 2 | 3 : t.level;
    return { ...t, rotation, level, targetId: best?.id ?? null };
  });
  const state: GameState = {
    mapId: map.id,
    difficultyId: 'normal',
    status: 'playing',
    speed: 1,
    time,
    cash: 600,
    lives: 20,
    waveIndex: 0,
    waveCount: map.waves.length,
    waveActive: true,
    nextWaveIn: null,
    towers,
    enemies,
    projectiles: [],
    events: [],
  };
  renderer.render(state, dt);
}

let paused = false;
function frame(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); // first rAF stamp can precede `last`
  last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  if (!paused) step(dt);
  const i = renderer.info;
  hud.textContent = `${map.name}  fps ${fps.toFixed(0)}  calls ${i.render.calls}  tris ${i.render.triangles}  load ${loadMs} ms ${JSON.stringify(renderer.bake)}\ntowers ${towers.length}  enemies ${perPath * map.paths.length}  WASD/arrows/edge pan, wheel zoom, click tower`;
  Object.assign(window, { __calls: i.render.calls, __renderer: renderer });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Throughput bench: frames rendered back to back, GPU-synced at the end (readPixels), at each zoom step.
const canvas = view.querySelector('canvas')!;
const ctx = canvas.getContext('webgl2')!;
const wheel = (deltaY: number): boolean => canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, cancelable: true }));
function bench(frames = 120): Record<string, { ms: number; calls: number; tris: number }> {
  paused = true;
  const out: Record<string, { ms: number; calls: number; tris: number }> = {};
  for (let i = 0; i < 3; i++) wheel(1); // widest
  for (const z of [24, 30, 40]) {
    for (let i = 0; i < 10; i++) step(1 / 60);
    const { calls, triangles: tris } = renderer.info.render;
    const t = performance.now();
    for (let i = 0; i < frames; i++) step(1 / 60);
    ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array(4));
    out[`z${z}`] = { ms: +((performance.now() - t) / frames).toFixed(2), calls, tris };
    wheel(-1);
  }
  paused = false;
  return out;
}
Object.assign(window, { __bench: bench, __step: step, __load: { loadMs, ...renderer.bake } });
