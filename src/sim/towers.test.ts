// Dust Ridge path 0 runs along row 2 (y = 2.5): progress p sits at x = 0.5 + p.
// Row 0 is build tiles, so a tower at (c, 0) is hypot(p - c, 2) from an enemy at progress p.
import { expect, test } from 'vitest';
import type { EnemyId, TowerId } from '../data/types';
import type { SimEvent } from './types';
import { run, runUntil, setup } from './test-utils';

function scene(towerId: TowerId, enemies: [EnemyId, number][]) {
  const sim = setup();
  const list = enemies.map(([id, p]) => {
    const e = sim.spawnEnemy(id, 0, 0, p);
    e.speed = 0;
    return e;
  });
  expect(sim.game.dispatch({ type: 'build', defId: towerId, col: 5, row: 0 }).ok).toBe(true);
  sim.game.drainEvents();
  return { ...sim, list };
}
const hits = (events: SimEvent[]) =>
  events.flatMap((e) => (e.type === 'hit' ? [[e.enemyId, e.damage] as const] : []));

test('idle tower waits at cooldown 0, fires the tick a target enters and aims at it', () => {
  const sim = setup();
  sim.game.dispatch({ type: 'build', defId: 'picket', col: 5, row: 0 });
  run(sim.game, 100);
  expect(sim.state.towers[0]!.cooldown).toBe(0);
  expect(sim.state.towers[0]!.targetId).toBeNull();
  const e = sim.spawnEnemy('skitterling', 0, 0, 5);
  e.speed = 0;
  sim.game.drainEvents();
  sim.game.step();
  const t = sim.state.towers[0]!;
  expect(sim.game.drainEvents()).toContainEqual({ type: 'shot', towerId: t.id, defId: t.defId, targetId: e.id });
  expect(t.cooldown).toBeCloseTo(0.4);
  expect(t.targetId).toBe(e.id);
  expect(t.rotation).toBeCloseTo(Math.PI / 2);
  expect(e.hp).toBe(39);
  run(sim.game, 23);
  expect(e.hp).toBe(39);
  sim.game.step();
  expect(e.hp).toBe(33);
  expect(t.totalDamage).toBe(12);
});

test('arc coil chains to nearest unhit enemy (tie: lowest id), x0.75 per jump, capped by chainTargets', () => {
  const sim = scene('arc_coil', [['skitterling', 7], ['skitterling', 6], ['skitterling', 5], ['skitterling', 4], ['skitterling', 3], ['skitterling', 8]]);
  const [a, b, c, d] = sim.list;
  sim.game.step();
  const events = sim.game.drainEvents();
  expect(hits(events)).toEqual([[a!.id, 14], [b!.id, 10.5], [c!.id, 7.875], [d!.id, 5.90625]]);
  const chain = events.find((e) => e.type === 'chain');
  expect(chain && chain.points).toEqual([{ x: 5.5, y: 0.5 }, { x: 7.5, y: 2.5 }, { x: 6.5, y: 2.5 }, { x: 5.5, y: 2.5 }, { x: 4.5, y: 2.5 }]);
});

test('thumper shell splashes: 100% inside 0.5R, 50% to R, none beyond', () => {
  const sim = scene('thumper', [['skitterling', 7], ['skitterling', 6.5], ['skitterling', 6], ['skitterling', 5.5]]);
  const [a, b, c] = sim.list;
  runUntil(sim.game, () => sim.state.events.some((e) => e.type === 'explosion'));
  expect(hits(sim.game.drainEvents())).toEqual([[a!.id, 20], [b!.id, 20], [c!.id, 10]]);
});

test('shell lands at last known position if its target dies', () => {
  const sim = scene('thumper', [['skitterling', 7], ['skitterling', 6.5]]);
  sim.game.step();
  sim.list[0]!.dead = true;
  runUntil(sim.game, () => sim.state.projectiles.length === 0);
  const events = sim.game.drainEvents();
  expect(events).toContainEqual({ type: 'explosion', x: 7.5, y: 2.5, radius: 1.25 });
  expect(hits(events)).toEqual([[sim.list[1]!.id, 20]]);
});

test('breacher fires a salvo of homing missiles; missiles fizzle if the target dies', () => {
  const sim = scene('breacher', [['brood_carrier', 5]]);
  run(sim.game, 30);
  expect(hits(sim.game.drainEvents())).toEqual([[sim.list[0]!.id, 33], [sim.list[0]!.id, 33]]);

  const fizz = scene('breacher', [['skitterling', 5]]);
  run(fizz.game, 10);
  expect(fizz.state.projectiles).toHaveLength(2);
  fizz.list[0]!.dead = true;
  run(fizz.game, 30);
  expect(fizz.state.projectiles).toHaveLength(0);
  expect(hits(fizz.game.drainEvents())).toEqual([]);
});

test.each<[EnemyId, number, number, boolean]>([
  ['husk_crawler', 60, 0, true], // 60 - 49 = 11 <= 10% of 220
  ['husk_crawler', 80, 0, false], // 31 left
  ['choir_mother', 300, 0, false], // bosses are never executed
  ['rivet_walker', 10, 60, false], // shield still up
])('railgun execute vs %s (hp %d, shield %d) -> %s', (defId, hp, shield, executed) => {
  const sim = scene('longshot', [[defId, 5]]);
  const e = sim.list[0]!;
  e.hp = hp;
  e.shield = shield;
  sim.game.step();
  expect(e.dead).toBe(executed);
});

test('stasis L3 beam forks to 3 targets', () => {
  const sim = scene('stasis', [['skitterling', 4], ['skitterling', 5], ['skitterling', 6], ['skitterling', 7]]);
  sim.game.dispatch({ type: 'upgrade', towerId: 1 });
  sim.game.dispatch({ type: 'upgrade', towerId: 1 });
  sim.game.step();
  expect(sim.list.filter((e) => e.slowed)).toHaveLength(3);
  expect(sim.game.drainEvents().filter((e) => e.type === 'shot')).toHaveLength(3);
});

const upgradeTo = (sim: ReturnType<typeof scene>, level: number) => {
  for (let l = 1; l < level; l++) expect(sim.game.dispatch({ type: 'upgrade', towerId: 1 }).ok).toBe(true);
  sim.game.drainEvents();
};
const shots = (events: SimEvent[]) => events.flatMap((e) => (e.type === 'shot' ? [e.targetId] : []));

test.each([1, 2, 3])('thumper L%d fires that many shells per volley, staggered', (level) => {
  const sim = scene('thumper', [['skitterling', 7], ['skitterling', 6], ['skitterling', 4], ['skitterling', 3]]);
  upgradeTo(sim, level);
  sim.game.step();
  expect(shots(sim.game.drainEvents())).toHaveLength(1);
  run(sim.game, 60); // salvo done, cooldown (>= 1.5 s) not yet
  expect(shots(sim.game.drainEvents())).toHaveLength(level - 1);
});

test('thumper extra shells go to the next-best targets in range', () => {
  const sim = scene('thumper', [['skitterling', 3], ['skitterling', 7], ['skitterling', 6], ['skitterling', 4]]);
  upgradeTo(sim, 3);
  run(sim.game, 20);
  const [, a, b] = sim.list; // 'first': p7, p6, then p4
  expect(shots(sim.game.drainEvents())).toEqual([a!.id, b!.id, sim.list[3]!.id]);
});

test('thumper extra shells scatter around a lone target (fixed pattern, primary still hit)', () => {
  const sim = scene('thumper', [['husk_crawler', 6]]);
  upgradeTo(sim, 3);
  runUntil(sim.game, () => sim.state.events.filter((e) => e.type === 'explosion').length === 3);
  const events = sim.game.drainEvents();
  const e = sim.list[0]!;
  expect(shots(events)).toEqual([e.id, e.id, e.id]);
  const booms = events.flatMap((ev) => (ev.type === 'explosion' ? [Math.hypot(ev.x - e.x, ev.y - e.y)] : []));
  expect(booms[0]).toBeCloseTo(0);
  expect(booms[1]).toBeCloseTo(0.4);
  expect(booms[2]).toBeCloseTo(0.4);
  expect(hits(events).filter(([id]) => id === e.id)).toHaveLength(3);
});
