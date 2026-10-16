// FX + SFX bench: the real renderer, sim and FX on Dust Ridge, played by the competent bot on Recruit,
// plus buttons that fire every effect and sound on demand. Command powers run on fake mines/fields/strikes merged into
// the state the FX and renderer see, so they work without the sim's usePower. `?mute` starts muted. Not shipped.
import { createSfx } from '../src/audio/sfx';
import { ENEMIES, MAPS, TOWER_LIST, TOWERS } from '../src/data';
import type { EnemyId } from '../src/data/types';
import { createRenderer } from '../src/render';
import { createFx } from '../src/render/fx';
import { POWERS } from '../src/data';
import { FIXED_DT, type GameState, type MineState, type SimEvent, type StrikeState, type TowerState, type TremorFieldState } from '../src/sim';
import { competentStrategy } from '../src/sim/autoplay';
import { createSim } from '../src/sim/game';

const map = MAPS['dust-ridge-outpost'];
const renderer = createRenderer(document.getElementById('view')!, map);
const fx = createFx(renderer.scene, renderer.interp, map);
const sfx = createSfx();
if (new URLSearchParams(location.search).has('mute')) sfx.setMuted(true);
const { game, state } = createSim({ mapId: map.id, difficultyId: 'easy' });
const bot = competentStrategy();
const manual: SimEvent[] = [];
let running = true;

// ---------------- manual triggers
const P = { x: 12, y: 12.5 };
const panel = document.getElementById('panel')!;
function btn(label: string, fn: () => void): void {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = fn;
  panel.append(b);
}
function section(label: string): void {
  panel.append(Object.assign(document.createElement('b'), { textContent: label }));
}
const push = (...e: SimEvent[]) => manual.push(...e);
section('bench');
btn('sim on/off', () => (running = !running));
btn('mute', () => sfx.setMuted(!sfx.muted));
section(`effects (at x${P.x} z${P.y})`);
btn('explosion', () => push({ type: 'explosion', x: P.x, y: P.y, radius: 1.5 }));
for (const dt of ['normal', 'concussive', 'explosive', 'plasma'] as const) btn(`hit ${dt}`, () => push({ type: 'hit', enemyId: -1, x: P.x, y: P.y, damageType: dt, damage: 40, shield: 0 }));
btn('shield hit', () => push({ type: 'hit', enemyId: -1, x: P.x, y: P.y, damageType: 'plasma', damage: 20, shield: 20 }));
btn('shieldBreak', () => push({ type: 'shieldBreak', enemyId: -1, x: P.x, y: P.y }));
btn('chain', () => push({ type: 'chain', towerId: -1, points: [{ x: P.x - 3, y: P.y }, { x: P.x - 1.5, y: P.y - 0.6 }, { x: P.x, y: P.y + 0.3 }, { x: P.x + 1.6, y: P.y - 0.2 }, { x: P.x + 3, y: P.y + 0.5 }] }));
for (const d of Object.keys(ENEMIES) as EnemyId[]) btn(`death ${d}`, () => push({ type: 'death', enemyId: -1, defId: d, x: P.x, y: P.y, bounty: 1 }));
btn('build', () => push({ type: 'build', towerId: -5, defId: 'picket', col: P.x, row: P.y - 0.5 }));
btn('sell', () => push({ type: 'sell', towerId: -5, col: P.x, row: P.y - 0.5, refund: 1 }));
btn('upgrade (L3)', () => { const t = state.towers[0]; if (t) push({ type: 'upgrade', towerId: t.id, level: 3 }); });
btn('leak', () => push({ type: 'leak', enemyId: -1, defId: 'skitterling', lives: 1 }));
btn('spawn', () => push({ type: 'spawn', enemyId: -1, defId: 'rivet_walker', x: P.x, y: P.y }));
section('sounds (shots use a live tower of that type)');
for (const d of TOWER_LIST) {
  btn(`shot ${d.id}`, () => {
    const t = state.towers.find((x) => x.defId === d.id);
    push({ type: 'shot', towerId: t?.id ?? -1, defId: d.id, targetId: state.enemies[0]?.id ?? -1 });
  });
}
btn('waveStart', () => push({ type: 'waveStart', index: 0, earlyBonus: 0, boss: null }));
btn('waveStart boss', () => push({ type: 'waveStart', index: 0, earlyBonus: 0, boss: 'mid' }));
btn('waveClear', () => push({ type: 'waveClear', index: 0, bonus: 0 }));
btn('victory', () => push({ type: 'gameOver', result: 'victory' }));
btn('defeat', () => push({ type: 'gameOver', result: 'defeat' }));

// ---------------- command powers on fake state (GDD §14)
const M = POWERS.tremor_mines, L = POWERS.lance_strike;
type Mut<T> = { -readonly [K in keyof T]: T[K] };
const fake = { mines: [] as MineState[], fields: [] as Mut<TremorFieldState>[], strikes: [] as Mut<StrikeState>[] };
let fakeId = 1000;
// path tiles nearest P first, so mines land on the lane by the bench point
const lane = map.tiles.flatMap((row, r) => row.flatMap((t, c) => (t === 'path' ? [{ col: c, row: r }] : [])))
  .sort((a, b) => Math.hypot(a.col + 0.5 - P.x, a.row + 0.5 - P.y) - Math.hypot(b.col + 0.5 - P.x, b.row + 0.5 - P.y));
function plant(): void {
  const t = lane.find((l) => !fake.mines.some((m) => m.col === l.col && m.row === l.row));
  if (!t) return;
  const m = { id: fakeId++, col: t.col, row: t.row, x: t.col + 0.5, y: t.row + 0.5 };
  fake.mines.push(m);
  push({ type: 'minePlanted', mineId: m.id, col: m.col, row: m.row, x: m.x, y: m.y });
}
function trigger(): void {
  const m = fake.mines.shift();
  if (!m) return;
  fake.fields.push({ id: m.id, x: m.x, y: m.y, radius: M.fieldRadius, timeLeft: M.fieldDuration });
  push({ type: 'mineTriggered', mineId: m.id, x: m.x, y: m.y, radius: M.fieldRadius });
}
function strike(col = Math.floor(P.x), row = Math.floor(P.y)): void {
  const s: Mut<StrikeState> = { id: fakeId++, col, row, x: col + 0.5, y: row + 0.5, radius: L.radius, phase: 'telegraph', timeLeft: L.telegraph };
  fake.strikes.push(s);
  push({ type: 'strikeTelegraph', strikeId: s.id, x: s.x, y: s.y, radius: s.radius, delay: L.telegraph });
}
/** Same timeline as the sim: telegraph, then pulses every pulseInterval (index 0 = impact) until pulses × interval. */
function stepFake(dt: number): void {
  for (const f of fake.fields) f.timeLeft -= dt;
  fake.fields = fake.fields.filter((f) => f.timeLeft > 0);
  const fire = L.pulses * L.pulseInterval;
  for (const s of fake.strikes) {
    const k0 = s.phase === 'firing' ? Math.floor((fire - s.timeLeft) / L.pulseInterval) : -1; // last pulse already fired
    s.timeLeft -= dt;
    if (s.phase === 'telegraph' && s.timeLeft <= 0) Object.assign(s, { phase: 'firing', timeLeft: fire + s.timeLeft });
    if (s.phase !== 'firing') continue;
    const k1 = Math.floor((fire - s.timeLeft) / L.pulseInterval);
    for (let i = k0 + 1; i <= Math.min(k1, L.pulses - 1); i++) push({ type: 'strikePulse', strikeId: s.id, x: s.x, y: s.y, radius: s.radius, index: i });
  }
  fake.strikes = fake.strikes.filter((s) => s.phase === 'telegraph' || s.timeLeft > 0);
}
// ---------------- fake L3 railgun on open ground: auto-fires at the nearest enemy in range (charge-up, beam, SFX layer)
const RAIL = TOWERS.longshot.levels[2];
const rail: Mut<TowerState> = {
  id: -7, defId: 'longshot', col: 9, row: 5, level: 3, targeting: 'closest', rotation: -Math.PI / 2,
  cooldown: RAIL.cooldown, targetId: null, totalDamage: 0, kills: 0, sellValue: 0,
};
let railOn = false;
function stepRail(dt: number): void {
  if (!railOn) return;
  const cx = rail.col + 0.5, cy = rail.row + 0.5;
  const d = (e: { x: number; y: number }) => Math.hypot(e.x - cx, e.y - cy);
  const e = state.enemies.filter((x) => d(x) <= RAIL.range).sort((a, b) => d(a) - d(b))[0];
  rail.targetId = e?.id ?? null;
  if (e) rail.rotation = Math.atan2(e.y - cy, e.x - cx);
  rail.cooldown = Math.max(0, rail.cooldown - dt);
  if (e && rail.cooldown === 0) {
    push({ type: 'shot', towerId: rail.id, defId: 'longshot', targetId: e.id });
    rail.cooldown = RAIL.cooldown;
  }
}
section('railgun L3 (fake tower at col 9 row 5)');
btn('rail L3 auto on/off', () => {
  railOn = !railOn;
  if (railOn) push({ type: 'upgrade', towerId: rail.id, level: 3 }); // also tells the SFX it is L3
});
btn('rail L3 shot now', () => {
  if (!railOn) { railOn = true; push({ type: 'upgrade', towerId: rail.id, level: 3 }); }
  rail.cooldown = 0;
  push({ type: 'shot', towerId: rail.id, defId: 'longshot', targetId: rail.targetId ?? -1 });
  rail.cooldown = RAIL.cooldown;
});
const view = (): GameState => ({
  ...state,
  towers: railOn ? [...state.towers, rail] : state.towers,
  mines: [...state.mines, ...fake.mines],
  tremorFields: [...state.tremorFields, ...fake.fields],
  strikes: [...state.strikes, ...fake.strikes],
});
section('powers (fake state; freeze with sim off)');
btn('mine plant', plant);
btn('mine trigger', trigger);
btn('lance strike', () => strike());
btn('6 fields + strike (perf)', () => {
  for (let i = 0; i < 6; i++) plant();
  for (let i = 0; i < 6; i++) trigger();
  strike();
});
btn('ready: mines 1', () => push({ type: 'powerReady', power: 'tremor_mines', charges: 1 }));
btn('ready: mines 2 (silent)', () => push({ type: 'powerReady', power: 'tremor_mines', charges: 2 }));
btn('ready: lance', () => push({ type: 'powerReady', power: 'lance_strike', charges: 1 }));
const preview = (kind: 'mine' | 'strike' | null, valid: boolean) => () => {
  const t = lane[0]!;
  renderer.setHover(kind ? t : null, valid);
  renderer.setRangePreview(kind ? { x: t.col + 0.5, y: t.row + 0.5, rangeTiles: kind === 'mine' ? M.fieldRadius : L.radius, kind } : null);
};
btn('preview mine', preview('mine', true));
btn('preview mine ✗', preview('mine', false));
btn('preview strike', preview('strike', true));
btn('preview strike ✗', preview('strike', false));
btn('preview off', preview(null, true));

// ---------------- loop (same shape as src/main.ts)
let last = performance.now();
let acc = 0;
let steps = 0;
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max(0, (now - last) / 1000), 0.25);
  last = now;
  tick(dt);
}
/** One frame of `dt` seconds; also `window.__step(dt)` for when the pane is hidden and rAF is throttled. */
function tick(dt: number): void {
  if (running) acc += dt;
  for (; acc >= FIXED_DT; acc -= FIXED_DT) {
    if (steps++ % 15 === 0 && state.status === 'playing') bot(game, map);
    renderer.interp.capture(state);
    game.step();
  }
  renderer.interp.alpha = acc / FIXED_DT;
  if (running) { stepFake(dt); stepRail(dt); }
  const s = view();
  const events = [...game.drainEvents(), ...manual.splice(0)];
  fx.handle(events, s);
  sfx.play(events);
  fx.update(running ? dt : 0);
  renderer.render(s, dt);
  Object.assign(window, { __drawCalls: renderer.info.render.calls, __renderer: renderer, __sfx: sfx, __fx: { plant, trigger, strike }, __step: tick });
}
Object.assign(window, { __sfx: sfx, __step: tick });
requestAnimationFrame(frame);
