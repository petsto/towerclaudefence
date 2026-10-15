// Dust Ridge path 0 runs along row 2 (y = 2.5): progress p sits at x = 0.5 + p.
// Row 0 is build tiles, so a tower at (c, 0) is hypot(p - c, 2) from an enemy at progress p.
import { expect, test } from 'vitest';
import type { EnemyId } from '../data/types';
import type { Enemy } from './game';
import { run, setup } from './test-utils';

function still(sim: ReturnType<typeof setup>, defId: EnemyId, progress: number): Enemy {
  const e = sim.spawnEnemy(defId, 0, 0, progress);
  e.speed = 0;
  return e;
}

test('regen heals up to max HP', () => {
  const sim = setup();
  const husk = still(sim, 'husk_crawler', 5);
  husk.hp = 100;
  run(sim.game, 60);
  expect(husk.hp).toBeCloseTo(104);
  husk.hp = husk.maxHp - 1;
  run(sim.game, 60);
  expect(husk.hp).toBe(husk.maxHp);
});

test('brood burst: death spawns children spread back along the path, same wave', () => {
  const sim = setup();
  const brood = still(sim, 'brood_carrier', 10);
  brood.hp = 1;
  sim.game.dispatch({ type: 'build', defId: 'picket', col: 10, row: 0 });
  sim.game.step();
  const events = sim.game.drainEvents();
  expect(events).toContainEqual({ type: 'death', enemyId: brood.id, defId: 'brood_carrier', x: 10.5, y: 2.5, bounty: 48 });
  const kids = sim.state.enemies;
  expect(kids.map((e) => e.defId)).toEqual(['skitterling', 'skitterling', 'skitterling']);
  expect(kids.map((e) => e.progress)).toEqual([10, 9.9, 9.8].map((p) => expect.closeTo(p)));
  expect(kids.every((e) => e.wave === brood.wave)).toBe(true);
  expect(sim.state.cash).toBe(448);
  expect(sim.state.towers[0]!.kills).toBe(1);
});

test('birthing: boss spawns children behind it every interval', () => {
  const sim = setup();
  still(sim, 'choir_mother', 5);
  run(sim.game, 479);
  expect(sim.state.enemies).toHaveLength(1);
  sim.game.step();
  const kids = sim.state.enemies.slice(1);
  expect(kids.map((e) => e.defId)).toEqual(['skitterling', 'skitterling']);
  expect(kids.map((e) => e.progress)).toEqual([expect.closeTo(4.7), expect.closeTo(4.4)]);
});

test('shield reboot: regen only after the undamaged delay, capped at max', () => {
  const sim = setup();
  const rivet = still(sim, 'rivet_walker', 5);
  rivet.shield = 0;
  run(sim.game, 150);
  expect(rivet.shield).toBe(0);
  run(sim.game, 60);
  expect(rivet.shield).toBeCloseTo(15);
  run(sim.game, 600);
  expect(rivet.shield).toBe(60);
});

test('repair field heals others (not self), strongest heal only, stacks with own regen', () => {
  const sim = setup();
  const m1 = still(sim, 'mender_unit', 5);
  still(sim, 'mender_unit', 6);
  const husk = still(sim, 'husk_crawler', 5.5);
  m1.hp = 50;
  husk.hp = 100;
  run(sim.game, 60);
  expect(m1.hp).toBeCloseTo(56); // healed by the other mender only
  expect(husk.hp).toBeCloseTo(110); // 4 regen + 6 heal, two menders do not stack

  const solo = setup();
  const m = still(solo, 'mender_unit', 5);
  m.hp = 50;
  run(solo.game, 60);
  expect(m.hp).toBe(50);
});

test.each<[EnemyId, number]>([
  ['skitterling', 0.35],
  ['choir_mother', 0.175], // bosses take half
  ['anvil_tread', 0], // slow-immune
])('stasis slow on %s = %f', (defId, slow) => {
  const sim = setup();
  const e = still(sim, defId, 5);
  sim.game.dispatch({ type: 'build', defId: 'stasis', col: 5, row: 0 });
  sim.game.step();
  expect(e.slow).toBeCloseTo(slow);
  expect(e.slowed).toBe(slow > 0);
  e.speed = 2;
  const p = e.progress;
  sim.game.step();
  expect(e.progress - p).toBeCloseTo((2 * (1 - slow)) / 60);
});

test('slow wears off after its duration', () => {
  const sim = setup();
  const e = still(sim, 'skitterling', 5);
  sim.game.dispatch({ type: 'build', defId: 'stasis', col: 5, row: 0 });
  sim.game.step();
  sim.game.dispatch({ type: 'sell', towerId: 1 });
  run(sim.game, 119);
  expect(e.slowed).toBe(true);
  sim.game.step();
  expect(e.slowed).toBe(false);
});
