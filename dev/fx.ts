// FX + SFX bench: the real renderer, sim and FX on Dust Ridge, played by the competent bot on Recruit,
// plus buttons that fire every effect and sound on demand. Not shipped.
import { createSfx } from '../src/audio/sfx';
import { ENEMIES, MAPS, TOWER_LIST } from '../src/data';
import type { EnemyId } from '../src/data/types';
import { createRenderer } from '../src/render';
import { createFx } from '../src/render/fx';
import { FIXED_DT, type SimEvent } from '../src/sim';
import { competentStrategy } from '../src/sim/autoplay';
import { createSim } from '../src/sim/game';

const map = MAPS['dust-ridge-outpost'];
const renderer = createRenderer(document.getElementById('view')!, map);
const fx = createFx(renderer.scene, renderer.interp, map);
const sfx = createSfx();
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

// ---------------- loop (same shape as src/main.ts)
let last = performance.now();
let acc = 0;
let steps = 0;
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max(0, (now - last) / 1000), 0.25);
  last = now;
  if (running) acc += dt;
  for (; acc >= FIXED_DT; acc -= FIXED_DT) {
    if (steps++ % 15 === 0 && state.status === 'playing') bot(game, map);
    renderer.interp.capture(state);
    game.step();
  }
  renderer.interp.alpha = acc / FIXED_DT;
  const events = [...game.drainEvents(), ...manual.splice(0)];
  fx.handle(events, state);
  sfx.play(events);
  fx.update(running ? dt : 0);
  renderer.render(state, dt);
  Object.assign(window, { __drawCalls: renderer.info.render.calls });
}
requestAnimationFrame(frame);
