// Command powers, GDD §14. Dust Ridge path 0 runs along row 2 (y = 2.5): progress p sits at x = 0.5 + p.
// Spawn tile (0,2), core (23,13), row 0 is build tiles.
import { expect, test } from 'vitest';
import { MAPS, POWERS } from '../data';
import type { EnemyId, PowerId } from '../data/types';
import { competentStrategy, withPowers } from './autoplay';
import { FIXED_DT } from './constants';
import type { Enemy } from './game';
import { run, setup } from './test-utils';
import type { SimEvent } from './types';

const MINES = POWERS.tremor_mines;
const LANCE = POWERS.lance_strike;
const steps = (seconds: number) => Math.round(seconds / FIXED_DT);

function still(sim: ReturnType<typeof setup>, defId: EnemyId, progress: number): Enemy {
  const e = sim.spawnEnemy(defId, 0, 0, progress);
  e.speed = 0;
  return e;
}

/** Wave 1 launched, lives that never run out, charges topped up. */
function armed(charges: Partial<Record<PowerId, number>> = { tremor_mines: 3, lance_strike: 1 }) {
  const sim = setup();
  sim.state.lives = 1e9;
  for (const [id, n] of Object.entries(charges)) sim.state.powers[id as PowerId].charges = n;
  return sim;
}

const ofType = <T extends SimEvent['type']>(events: readonly SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

test('no charge before wave 1 launches', () => {
  const sim = setup();
  run(sim.game, steps(LANCE.chargeTime) + 10);
  expect(sim.state.powers).toEqual({ tremor_mines: { charges: 0, charge: 0 }, lance_strike: { charges: 0, charge: 0 } });
  expect(sim.game.dispatch({ type: 'usePower', power: 'lance_strike', col: 5, row: 2 })).toEqual({ ok: false, error: 'Charging' });
});

test.each([['tremor_mines'], ['lance_strike']] as const)('%s is ready exactly chargeTime after wave 1', (id) => {
  const sim = setup();
  sim.state.lives = 1e9;
  sim.game.dispatch({ type: 'callWave' });
  run(sim.game, steps(POWERS[id].chargeTime) - 1);
  expect(sim.state.powers[id].charges).toBe(0);
  sim.game.drainEvents();
  sim.game.step();
  expect(sim.state.powers[id]).toEqual({ charges: 1, charge: 0 });
  expect(ofType(sim.game.drainEvents(), 'powerReady')).toContainEqual({ type: 'powerReady', power: id, charges: 1 });
});

test('charges cap at maxCharges and recharge restarts when one is spent', () => {
  const sim = setup();
  sim.state.lives = 1e9;
  sim.game.dispatch({ type: 'callWave' });
  run(sim.game, steps(MINES.chargeTime * (MINES.maxCharges + 1)));
  expect(sim.state.powers.tremor_mines).toEqual({ charges: MINES.maxCharges, charge: 0 });
  expect(sim.state.powers.lance_strike.charges).toBeLessThanOrEqual(LANCE.maxCharges);
  expect(sim.game.dispatch({ type: 'usePower', power: 'tremor_mines', col: 5, row: 2 }).ok).toBe(true);
  run(sim.game, steps(MINES.chargeTime) - 1);
  expect(sim.state.powers.tremor_mines.charges).toBe(MINES.maxCharges - 1);
  sim.game.step();
  expect(sim.state.powers.tremor_mines.charges).toBe(MINES.maxCharges);
});

test('usePower rejections, mirrored by canUsePower', () => {
  const sim = armed();
  const g = sim.game;
  const cases: [PowerId, number, number, string][] = [
    ['tremor_mines', -1, 2, 'Out of bounds'],
    ['tremor_mines', 24, 2, 'Out of bounds'],
    ['lance_strike', 3, 16, 'Out of bounds'],
    ['tremor_mines', 1, 0, 'Mines go on the lane'], // build tile
    ['tremor_mines', 0, 2, 'Mines go on the lane'], // spawn
    ['tremor_mines', 23, 13, 'Mines go on the lane'], // core
  ];
  for (const [power, col, row, error] of cases) {
    expect(g.canUsePower(power, col, row)).toBe(false);
    expect(g.dispatch({ type: 'usePower', power, col, row })).toEqual({ ok: false, error });
  }
  expect(g.canUsePower('tremor_mines', 5, 2)).toBe(true);
  expect(g.dispatch({ type: 'usePower', power: 'tremor_mines', col: 5, row: 2 }).ok).toBe(true);
  expect(g.canUsePower('tremor_mines', 5, 2)).toBe(false);
  expect(g.dispatch({ type: 'usePower', power: 'tremor_mines', col: 5, row: 2 })).toEqual({ ok: false, error: 'Mine already there' });
  expect(g.canUsePower('lance_strike', 1, 0)).toBe(true); // strike: any tile
  expect(g.dispatch({ type: 'usePower', power: 'lance_strike', col: 1, row: 0 }).ok).toBe(true);
  expect(g.canUsePower('lance_strike', 1, 0)).toBe(false);
  expect(g.dispatch({ type: 'usePower', power: 'lance_strike', col: 2, row: 0 })).toEqual({ ok: false, error: 'Charging' });
  expect(sim.state.powers).toEqual({ tremor_mines: { charges: 2, charge: 0 }, lance_strike: { charges: 0, charge: 0 } });
});

test('mine triggers on the first enemy in range and opens a field', () => {
  const sim = armed();
  sim.game.dispatch({ type: 'usePower', power: 'tremor_mines', col: 8, row: 2 });
  expect(sim.game.drainEvents()).toEqual([{ type: 'minePlanted', mineId: 1, col: 8, row: 2, x: 8.5, y: 2.5 }]);
  const e = sim.spawnEnemy('skitterling', 0, 0, 0);
  while (sim.state.mines.length > 0) sim.game.step();
  expect(Math.abs(e.x - 8.5)).toBeLessThanOrEqual(MINES.triggerRadius);
  expect(ofType(sim.game.drainEvents(), 'mineTriggered')).toEqual([
    { type: 'mineTriggered', mineId: 1, x: 8.5, y: 2.5, radius: MINES.fieldRadius },
  ]);
  expect(sim.state.tremorFields).toEqual([{ id: 1, x: 8.5, y: 2.5, radius: MINES.fieldRadius, timeLeft: expect.closeTo(MINES.fieldDuration - FIXED_DT) }]);
  expect(e.slow).toBe(MINES.slow);
  expect(e.slowed).toBe(true);
});

test('field slow: 60% normal, halved on bosses, none on slow-immune (which still triggers it)', () => {
  const slowOf = (id: EnemyId) => {
    const sim = armed();
    sim.game.dispatch({ type: 'usePower', power: 'tremor_mines', col: 5, row: 2 });
    const e = still(sim, id, 5);
    sim.game.step();
    expect(sim.state.mines).toHaveLength(0);
    return e.slow;
  };
  expect(slowOf('husk_crawler')).toBe(0.6);
  expect(slowOf('choir_mother')).toBeCloseTo(0.3);
  expect(slowOf('anvil_tread')).toBe(0);
});

test('field slow uses the strongest-wins rule against other slows', () => {
  const sim = armed();
  sim.game.dispatch({ type: 'usePower', power: 'tremor_mines', col: 5, row: 2 });
  const weaker = still(sim, 'husk_crawler', 5); // e.g. Stasis L3 (50%)
  weaker.slow = 0.5;
  weaker.slowTime = 2;
  const stronger = still(sim, 'husk_crawler', 5.2);
  stronger.slow = 0.8;
  stronger.slowTime = 2;
  sim.game.step();
  expect(weaker.slow).toBe(0.6);
  expect(stronger.slow).toBe(0.8);
});

test('field closes after fieldDuration; its slow lingers slowLinger after', () => {
  const sim = armed();
  sim.game.dispatch({ type: 'usePower', power: 'tremor_mines', col: 5, row: 2 });
  const e = still(sim, 'husk_crawler', 5);
  sim.game.step(); // triggers
  run(sim.game, steps(MINES.fieldDuration) - 2);
  expect(sim.state.tremorFields).toHaveLength(1);
  sim.game.step();
  expect(sim.state.tremorFields).toHaveLength(0);
  run(sim.game, steps(MINES.slowLinger) - 1);
  expect(e.slow).toBe(0.6);
  sim.game.step();
  expect(e.slow).toBe(0);
});

test('lance: no damage during the telegraph, then pulses every pulseInterval', () => {
  const sim = armed();
  const husk = still(sim, 'husk_crawler', 10);
  husk.hp = husk.maxHp = 1e6;
  sim.game.dispatch({ type: 'usePower', power: 'lance_strike', col: 10, row: 2 });
  expect(ofType(sim.game.drainEvents(), 'strikeTelegraph')).toEqual([
    { type: 'strikeTelegraph', strikeId: 1, x: 10.5, y: 2.5, radius: LANCE.radius, delay: LANCE.telegraph },
  ]);
  const pulsesAt: number[] = [];
  let n = 0;
  while (sim.state.strikes.length > 0) {
    sim.game.step();
    n++;
    for (const ev of ofType(sim.game.drainEvents(), 'strikePulse')) {
      expect(ev.index).toBe(pulsesAt.length);
      pulsesAt.push(n);
    }
    if (n === steps(LANCE.telegraph) - 1) {
      expect(husk.hp).toBe(1e6);
      expect(sim.state.strikes[0]!.phase).toBe('telegraph');
    }
  }
  const first = steps(LANCE.telegraph);
  expect(pulsesAt).toEqual(Array.from({ length: LANCE.pulses }, (_, k) => first + k * steps(LANCE.pulseInterval)));
  expect(n).toBe(first + steps(LANCE.pulses * LANCE.pulseInterval));
});

test('lance pulses are Plasma: shields at x1, then armor ignored; scaled by hpGrowth^waveIndex', () => {
  const sim = armed();
  const anvil = still(sim, 'anvil_tread', 10); // 150 shield, armor 4
  sim.game.dispatch({ type: 'usePower', power: 'lance_strike', col: 10, row: 2 });
  run(sim.game, steps(LANCE.telegraph));
  expect(anvil.shield).toBe(0);
  expect(anvil.hp).toBe(900);
  run(sim.game, steps(LANCE.pulseInterval));
  expect(anvil.hp).toBe(900 - LANCE.pulseDamage);

  const late = armed();
  late.state.waveIndex = 4;
  const husk = still(late, 'husk_crawler', 10);
  husk.hp = husk.maxHp = 1e6;
  late.game.dispatch({ type: 'usePower', power: 'lance_strike', col: 10, row: 2 });
  run(late.game, steps(LANCE.telegraph));
  expect(1e6 - husk.hp).toBeCloseTo(LANCE.pulseDamage * MAPS['dust-ridge-outpost'].hpGrowth ** 4);
});

test.each([['choir_mother'], ['foundry_colossus']] as const)('a full strike takes exactly bossFraction of %s', (id) => {
  const sim = armed();
  const boss = still(sim, id, 10);
  sim.game.dispatch({ type: 'usePower', power: 'lance_strike', col: 10, row: 2 });
  run(sim.game, steps(LANCE.telegraph + LANCE.pulses * LANCE.pulseInterval));
  const taken = boss.maxHp - boss.hp + boss.maxShield - boss.shield;
  expect(taken).toBeCloseTo(LANCE.bossFraction * (boss.maxHp + boss.maxShield));
});

test('lance kills pay the bounty with no tower credit', () => {
  const sim = armed();
  const skit = still(sim, 'skitterling', 10);
  sim.game.dispatch({ type: 'build', defId: 'picket', col: 1, row: 0 }); // out of range
  const cash = sim.state.cash;
  sim.game.dispatch({ type: 'usePower', power: 'lance_strike', col: 10, row: 2 });
  sim.game.drainEvents();
  run(sim.game, steps(LANCE.telegraph));
  expect(ofType(sim.game.drainEvents(), 'death')).toEqual([
    { type: 'death', enemyId: skit.id, defId: 'skitterling', x: 10.5, y: 2.5, bounty: skit.bounty },
  ]);
  expect(sim.state.cash).toBe(cash + skit.bounty);
  expect(sim.state.towers[0]).toMatchObject({ kills: 0, totalDamage: 0 });
});

test('deterministic with powers: same seed and commands, same state', () => {
  const play = () => {
    const sim = setup('normal', 'cinder-forge');
    const strategy = withPowers(competentStrategy());
    const events: SimEvent[] = [];
    for (let i = 0; i < 60 * 60 * 6 && sim.state.status === 'playing'; i++) {
      if (i % 15 === 0) strategy(sim.game, MAPS['cinder-forge']);
      sim.game.step();
      events.push(...sim.game.drainEvents());
    }
    return { state: JSON.stringify(sim.state), events };
  };
  const a = play();
  expect(ofType(a.events, 'minePlanted').length).toBeGreaterThan(0);
  expect(ofType(a.events, 'strikePulse').length).toBeGreaterThan(0);
  const b = play();
  expect(b.state).toBe(a.state);
  expect(b.events).toEqual(a.events);
});
