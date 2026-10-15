// Dev-only renderer check: renders a map with a fake GameState. ?map=<id>, ?towers=all fills every pad.
import { ENEMIES, MAP_LIST, MAPS, TOWER_LIST } from '../src/data';
import type { EnemyId, MapId } from '../src/data/types';
import { createRenderer } from '../src/render';
import { buildPath, pointAt } from '../src/sim/path';
import type { EnemyState, GameState, TowerState } from '../src/sim/types';

const params = new URLSearchParams(location.search);
const map = MAPS[(params.get('map') as MapId) ?? 'dust-ridge-outpost'] ?? MAP_LIST[0]!;
const allTowers = params.get('towers') === 'all';

const nav = document.getElementById('maps')!;
for (const m of MAP_LIST) {
  const a = document.createElement('a');
  a.href = `?map=${m.id}${allTowers ? '&towers=all' : ''}`;
  a.textContent = m.name;
  nav.appendChild(a);
}

const renderer = createRenderer(document.getElementById('view')!, map);
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
const enemyIds = Object.keys(ENEMIES) as EnemyId[];
function enemiesAt(time: number): EnemyState[] {
  const out: EnemyState[] = [];
  let id = 1;
  map.paths.forEach((p, pi) => {
    const geo = buildPath(p);
    const len = geo.length;
    for (let k = 0; k < 14; k++) {
      const defId = enemyIds[(k + pi * 4) % enemyIds.length]!;
      const def = ENEMIES[defId];
      const d = (time * 1.2 + k * 1.6) % len;
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

const view = document.getElementById('view')!;
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

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
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
  const i = renderer.info;
  hud.textContent = `${map.name}  fps ${fps.toFixed(0)}  calls ${i.render.calls}  tris ${i.render.triangles}\ntowers ${towers.length}  enemies ${enemies.length}  WASD/arrows/edge pan, wheel zoom, click tower`;
  Object.assign(window, { __calls: i.render.calls, __renderer: renderer });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
