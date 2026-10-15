import { describe, expect, test } from 'vitest';
import { greedyStrategy } from './autoplay';
import { MAPS } from '../data';
import { createGame } from './game';
import { run, runUntil, setup } from './test-utils';

describe('economy', () => {
  test('starting cash and lives follow difficulty', () => {
    expect([setup('easy'), setup('normal'), setup('hard'), setup('brutal')].map((s) => [s.state.cash, s.state.lives]))
      .toEqual([[650, 30], [500, 20], [450, 15], [400, 10]]);
  });

  test('build validates tile, occupancy and cash', () => {
    const { game, state } = setup();
    expect(game.dispatch({ type: 'build', defId: 'picket', col: 0, row: 0 })).toEqual({ ok: false, error: 'cannot build here' });
    expect(game.dispatch({ type: 'build', defId: 'longshot', col: 1, row: 0 }).ok).toBe(true);
    expect(game.dispatch({ type: 'build', defId: 'picket', col: 1, row: 0 }).ok).toBe(false);
    expect(game.dispatch({ type: 'build', defId: 'longshot', col: 2, row: 0 }).ok).toBe(true);
    expect(state.cash).toBe(150);
    expect(game.dispatch({ type: 'build', defId: 'longshot', col: 3, row: 0 })).toEqual({ ok: false, error: 'insufficient cash' });
    expect(state.cash).toBe(150);
    expect(state.towers).toHaveLength(2);
    expect(game.canBuild(1, 0)).toBe(false);
    expect(game.canBuild(3, 0)).toBe(true);
  });

  test('undo refunds 100% until an enemy spawns, then 70%', () => {
    const { game, state } = setup();
    game.dispatch({ type: 'build', defId: 'picket', col: 1, row: 0 });
    game.dispatch({ type: 'build', defId: 'picket', col: 2, row: 0 });
    expect(state.towers[0]!.sellValue).toBe(100);
    game.dispatch({ type: 'sell', towerId: 1 });
    expect(state.cash).toBe(400);
    game.dispatch({ type: 'callWave' });
    game.step(); // first skitterling spawns
    expect(state.towers[0]!.sellValue).toBe(70);
    expect(game.dispatch({ type: 'sell', towerId: 2 }).ok).toBe(true);
    expect(state.cash).toBe(470);
    expect(game.dispatch({ type: 'sell', towerId: 2 }).ok).toBe(false);
  });

  test('upgrade costs, re-arms undo, caps at L3', () => {
    const { game, state } = setup();
    game.dispatch({ type: 'build', defId: 'picket', col: 1, row: 0 });
    game.dispatch({ type: 'callWave' });
    game.step();
    expect(game.dispatch({ type: 'upgrade', towerId: 1 }).ok).toBe(true);
    expect(state.cash).toBe(325);
    expect(state.towers[0]!.sellValue).toBe(175); // undo covers everything invested
    game.dispatch({ type: 'upgrade', towerId: 1 });
    expect(state.towers[0]!.level).toBe(3);
    expect(game.dispatch({ type: 'upgrade', towerId: 1 })).toEqual({ ok: false, error: 'max level' });
    run(game, 30); // more spawns
    expect(state.towers[0]!.sellValue).toBe(210); // floor(300 * 0.7)
  });

  test('upgrade rejects when broke', () => {
    const { game, state } = setup();
    game.dispatch({ type: 'build', defId: 'breacher', col: 1, row: 0 });
    game.dispatch({ type: 'build', defId: 'breacher', col: 2, row: 0 });
    expect(game.dispatch({ type: 'upgrade', towerId: 1 })).toEqual({ ok: false, error: 'insufficient cash' });
    expect(state.towers[0]!.level).toBe(1);
  });

  test('early-call bonus = 3 x floor(seconds left), capped at 60, scaled by difficulty', () => {
    const { game, state } = setup();
    game.dispatch({ type: 'callWave' });
    runUntil(game, () => state.nextWaveIn !== null);
    run(game, 590); // ~10.17 s left
    const cash = state.cash;
    game.dispatch({ type: 'callWave' });
    expect(game.drainEvents().at(-1)).toEqual({ type: 'waveStart', index: 1, earlyBonus: 30, boss: null });
    expect(state.cash).toBe(cash + 30);

    const easy = setup('easy');
    easy.game.dispatch({ type: 'callWave' });
    runUntil(easy.game, () => easy.state.nextWaveIn !== null);
    easy.game.dispatch({ type: 'callWave' });
    expect(easy.game.drainEvents().at(-1)).toEqual({ type: 'waveStart', index: 1, earlyBonus: 75, boss: null });
  });

  test('pause accepts only resume/speed; game over accepts nothing', () => {
    const { game, state } = setup();
    expect(game.dispatch({ type: 'pause' }).ok).toBe(true);
    expect(game.dispatch({ type: 'build', defId: 'picket', col: 1, row: 0 }).ok).toBe(false);
    expect(game.dispatch({ type: 'setSpeed', speed: 3 }).ok).toBe(true);
    const t = state.time;
    game.step();
    expect(state.time).toBe(t);
    expect(game.dispatch({ type: 'resume' }).ok).toBe(true);
    expect(state.speed).toBe(3);
    state.lives = 0;
    game.step();
    expect(state.status).toBe('defeat');
    expect(game.dispatch({ type: 'setSpeed', speed: 1 }).ok).toBe(false);
  });
});

describe('waves', () => {
  test('groups spawn at delay + n x interval from wave start', () => {
    const { game, state } = setup();
    state.waveIndex = 1; // next call launches wave 3: 6 skitterlings @0.4, then 2 husks at 5 s @0.9
    game.dispatch({ type: 'callWave' });
    const spawnSteps: [number, string][] = [];
    for (let i = 0; state.waveActive; i++) {
      game.step();
      for (const e of game.drainEvents()) if (e.type === 'spawn') spawnSteps.push([i, e.defId]);
    }
    expect(spawnSteps).toEqual([
      [0, 'skitterling'], [24, 'skitterling'], [48, 'skitterling'], [72, 'skitterling'], [96, 'skitterling'], [120, 'skitterling'],
      [300, 'husk_crawler'], [354, 'husk_crawler'],
    ]);
    expect(state.nextWaveIn).toBe(20);
  });

  test('HP scales by difficulty and growth^(wave-1); mid boss x0.5 HP with flat bounty', () => {
    const { game, state } = setup();
    state.waveIndex = 6; // launch wave 8 (mid boss)
    game.dispatch({ type: 'callWave' });
    runUntil(game, () => state.enemies.length > 0);
    expect(state.enemies[0]!.maxHp).toBeCloseTo(45 * 1.07 ** 7);
    runUntil(game, () => state.enemies.some((e) => e.defId === 'choir_mother'));
    const boss = state.enemies.find((e) => e.defId === 'choir_mother')!;
    expect(boss.midBoss).toBe(true);
    expect(boss.maxHp).toBeCloseTo(5000 * 0.5 * 1.07 ** 7);
    expect(boss.bounty).toBe(200);

    const easy = setup('easy');
    easy.state.waveIndex = 3;
    easy.game.dispatch({ type: 'callWave' });
    easy.game.step();
    expect(easy.state.enemies[0]!.maxHp).toBeCloseTo(45 * 0.75 * 1.06 ** 4);
    expect(easy.state.enemies[0]!.bounty).toBe(5); // floor(4 * 1.25)
  });

  test('countdown auto-launches the next wave; callWave rejected while spawning', () => {
    const { game, state } = setup();
    expect(state.nextWaveIn).toBeNull();
    game.dispatch({ type: 'callWave' });
    expect(game.dispatch({ type: 'callWave' })).toEqual({ ok: false, error: 'wave still spawning' });
    runUntil(game, () => state.nextWaveIn !== null);
    game.drainEvents();
    run(game, 1199);
    expect(state.waveIndex).toBe(0);
    game.step();
    expect(state.waveIndex).toBe(1);
    expect(game.drainEvents()).toContainEqual({ type: 'waveStart', index: 1, earlyBonus: 0, boss: null });
  });

  test('leaks cost lives; wave clears (incl. leaked) pay 20 + 5w', () => {
    const { game, state } = setup();
    game.dispatch({ type: 'callWave' });
    runUntil(game, () => state.lives === 10); // wave 2 auto-launched meanwhile, nothing leaked from it yet
    const events = game.drainEvents();
    expect(events.filter((e) => e.type === 'leak')).toHaveLength(10);
    expect(events).toContainEqual({ type: 'leak', enemyId: 1, defId: 'skitterling', lives: 1 });
    expect(events).toContainEqual({ type: 'waveClear', index: 0, bonus: 25 });
    expect(state.cash).toBe(525);
  });

  test('lives at 0 means defeat at end of tick', () => {
    const { game, state, spawnEnemy } = setup();
    for (let i = 0; i < 9; i++) spawnEnemy('husk_crawler', 0, 0, 67.99);
    spawnEnemy('brood_carrier', 0, 0, 67.99);
    game.step();
    expect(state.lives).toBe(0);
    expect(state.status).toBe('defeat');
    expect(game.drainEvents().at(-1)).toEqual({ type: 'gameOver', result: 'defeat' });
  });

  test('victory when the final wave has spawned and no enemies remain; boss clear bonus x2', () => {
    const { game, state } = setup();
    state.waveIndex = 13;
    game.dispatch({ type: 'callWave' });
    runUntil(game, () => {
      for (const e of state.enemies) e.dead = true; // remove without bounty
      return state.status !== 'playing';
    });
    const events = game.drainEvents();
    expect(state.status).toBe('victory');
    expect(events.slice(-2)).toEqual([
      { type: 'waveClear', index: 14, bonus: 190 },
      { type: 'gameOver', result: 'victory' },
    ]);
    expect(state.nextWaveIn).toBeNull();
  });
});

test('determinism: same commands give identical state', () => {
  const play = () => {
    const game = createGame({ mapId: 'cinder-forge', difficultyId: 'hard' });
    const strategy = greedyStrategy();
    for (let i = 0; i < 6000; i++) {
      if (i % 15 === 0) strategy(game, MAPS['cinder-forge']);
      game.step();
    }
    return JSON.stringify(game.state);
  };
  const a = play();
  expect(a).toBe(play());
  expect(a.length).toBeGreaterThan(1000);
});
