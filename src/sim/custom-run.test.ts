// Custom wave count (GDD §15): the sim plays buildWaves(map, waveCount) with the hpExponent tail.
import { expect, test } from 'vitest';
import { buildWaves, MAPS, POWERS } from '../data';
import { FIXED_DT } from './constants';
import { createSim } from './game';
import { run, runUntil } from './test-utils';

const dust = MAPS['dust-ridge-outpost'];
const custom = (waveCount?: number) => createSim({ mapId: 'dust-ridge-outpost', difficultyId: 'normal', waveCount });

test('waveCount: Campaign by default, otherwise rounded and clamped', () => {
  expect(custom().state.waveCount).toBe(dust.waves.length);
  expect(custom(30).state.waveCount).toBe(30);
  expect(custom(3).state.waveCount).toBe(10);
  expect(custom(80).state.waveCount).toBe(50);
  expect(custom(24.6).state.waveCount).toBe(25);
});

test.each([10, 30])('victory after clearing wave N=%i (not at the authored count)', (n) => {
  const { game, state } = custom(n);
  state.waveIndex = n - 2;
  game.dispatch({ type: 'callWave' });
  runUntil(game, () => {
    for (const e of state.enemies) e.dead = true; // remove without bounty
    return state.status !== 'playing';
  });
  expect(state.status).toBe('victory');
  expect(state.waveIndex).toBe(n - 1);
  const events = game.drainEvents();
  const boss = buildWaves(dust, n)[n - 1]!.boss;
  expect(events.find((e) => e.type === 'waveStart')).toMatchObject({ index: n - 1, boss });
  expect(events.slice(-2)).toEqual([
    { type: 'waveClear', index: n - 1, bonus: (30 + 6 * n) * 2 },
    { type: 'gameOver', result: 'victory' },
  ]);
  expect(game.dispatch({ type: 'callWave' }).ok).toBe(false);
});

test('custom run does not end at the authored count', () => {
  const { game, state } = custom(30);
  state.waveIndex = dust.waves.length - 2; // launch W15 (the authored final, kept at N=30)
  game.dispatch({ type: 'callWave' });
  runUntil(game, () => {
    for (const e of state.enemies) e.dead = true;
    return state.nextWaveIn !== null && state.enemies.length === 0;
  });
  run(game, 2);
  expect(state.status).toBe('playing');
  expect(game.dispatch({ type: 'callWave' }).ok).toBe(true);
});

test('HP past the authored waves grows at CUSTOM_GROWTH_TAIL; Lance pulse follows', () => {
  const L = dust.waves.length;
  const { game, state } = custom(50);
  state.waveIndex = 44; // launch W46 (index 45): Choir Mother milestone
  game.dispatch({ type: 'callWave' });
  runUntil(game, () => state.enemies.some((e) => e.defId === 'choir_mother'));
  const e = (L - 1) + (45 - (L - 1)) * 0.5;
  const boss = state.enemies.find((x) => x.defId === 'choir_mother')!;
  expect(boss.midBoss).toBe(false);
  expect(boss.maxHp).toBeCloseTo(3000 * 1.06 ** e);

  const sim = custom(50);
  sim.state.waveIndex = 45;
  sim.state.powers.lance_strike.charges = 1;
  const husk = sim.spawnEnemy('husk_crawler', 0, 45, 10);
  husk.speed = 0;
  husk.hp = husk.maxHp = 1e9;
  sim.game.dispatch({ type: 'usePower', power: 'lance_strike', col: 10, row: 2 });
  run(sim.game, Math.round(POWERS.lance_strike.telegraph / FIXED_DT));
  expect(1e9 - husk.hp).toBeCloseTo(POWERS.lance_strike.pulseDamage * 1.06 ** e, 3);
});
