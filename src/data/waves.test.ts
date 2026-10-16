import { describe, expect, test } from 'vitest';
import { ENEMIES, MAP_LIST } from '.';
import type { MapDef, WaveDef } from './types';
import {
  buildWaves,
  clampWaveCount,
  CUSTOM_WAVES_MAX,
  CUSTOM_WAVES_MIN,
  FINALE_BOSS_SPACING,
  HEAVY_ONLY_FROM,
  hpExponent,
} from './waves';

const COUNTS = Array.from({ length: CUSTOM_WAVES_MAX - CUSTOM_WAVES_MIN + 1 }, (_, i) => CUSTOM_WAVES_MIN + i);
const midOf = (m: MapDef) => m.waves.findIndex((w) => w.boss === 'mid') + 1; // 1-based M
const bossesIn = (w: WaveDef) => w.groups.filter((g) => ENEMIES[g.enemyId].isBoss);

test('clampWaveCount rounds and clamps; NaN throws', () => {
  expect(clampWaveCount(3)).toBe(CUSTOM_WAVES_MIN);
  expect(clampWaveCount(99)).toBe(CUSTOM_WAVES_MAX);
  expect(clampWaveCount(Infinity)).toBe(CUSTOM_WAVES_MAX);
  expect(clampWaveCount(12.4)).toBe(12);
  expect(() => clampWaveCount(NaN)).toThrow();
});

test('hpExponent: waveIndex inside the authored waves, half rate past them', () => {
  expect(hpExponent(14, 15)).toBe(14);
  expect(hpExponent(49, 15)).toBe(14 + 35 * 0.5);
});

describe.each(MAP_LIST.map((m) => [m.id, m] as const))('%s', (_, map) => {
  const L = map.waves.length;
  const M = midOf(map);
  const allPaths = map.paths.map((__, i) => i);

  test('Campaign: undefined or the authored count returns map.waves itself', () => {
    expect(buildWaves(map)).toBe(map.waves);
    expect(buildWaves(map, L)).toBe(map.waves);
    expect(buildWaves(map, 0)).toEqual(buildWaves(map, CUSTOM_WAVES_MIN));
  });

  test.each(COUNTS)('N=%i: deterministic, N waves, boss closer with clearance, valid groups', (n) => {
    const waves = buildWaves(map, n);
    expect(buildWaves(map, n)).toEqual(waves);
    expect(waves).toHaveLength(n);
    expect(waves.at(-1)!.boss).toBe(n <= M + 2 ? 'mid' : 'final');
    expect(bossesIn(waves.at(-1)!).length).toBeGreaterThan(0);
    expect(waves.slice(-3, -1).every((w) => w.boss === null && bossesIn(w).length === 0)).toBe(true);
    for (const w of waves) {
      expect(w.boss !== null).toBe(bossesIn(w).length > 0);
      for (const g of w.groups) {
        expect(g.count).toBeGreaterThanOrEqual(1);
        expect(g.delay).toBeGreaterThanOrEqual(0);
        expect(Math.round(g.delay * 10) / 10).toBe(g.delay);
        expect(allPaths).toContain(g.pathIndex);
      }
    }
  });

  test('quick runs skip the mid boss and close on it; truncated runs keep the prefix and close on the final', () => {
    for (const n of COUNTS.filter((c) => c < L)) {
      const waves = buildWaves(map, n);
      if (n <= M + 2) {
        expect(waves.slice(0, -1)).toEqual(map.waves.filter((w) => !w.boss).slice(0, n - 1));
        expect(waves.at(-1)).toBe(map.waves[M - 1]);
      } else {
        expect(waves.slice(0, -1)).toEqual(map.waves.slice(0, n - 1));
        expect(waves.at(-1)).toBe(map.waves[L - 1]);
      }
    }
  });

  test('extended runs: authored prefix, authored final only with clearance, generated rest', () => {
    for (const n of COUNTS.filter((c) => c > L)) {
      const waves = buildWaves(map, n);
      expect(waves.slice(0, L - 1)).toEqual(map.waves.slice(0, L - 1));
      expect(waves[L - 1] === map.waves[L - 1]).toBe(L <= n - 3);
    }
  });

  test('N=50: milestone bosses at 20/30/40, boss on even heavy waves to N-3, heavies only from 41', () => {
    const waves = buildWaves(map, 50);
    const bossWaves = waves.map((w, i) => (w.boss ? i + 1 : 0)).filter((w) => w > L);
    expect(bossWaves).toEqual([20, 30, 40, 42, 44, 46, 50].filter((w) => w > L));
    const heavyPaths = map.heavyPaths ?? allPaths;
    for (const [i, w] of waves.entries()) {
      if (i + 1 <= L) continue;
      for (const g of w.groups) {
        const d = ENEMIES[g.enemyId];
        if (i + 1 >= HEAVY_ONLY_FROM) expect(d.size).toBe('heavy');
        if (d.size !== 'light') expect(heavyPaths).toContain(g.pathIndex);
      }
    }
    for (const w of [20, 30, 40, 42].filter((x) => x > L)) expect(bossesIn(waves[w - 1]!)).toHaveLength(1);
  });

  test('finale: K bosses fastest first, FINALE_BOSS_SPACING apart, escort after the last boss', () => {
    const roster = new Set(map.roster ?? map.waves.flatMap((w) => w.groups.map((g) => g.enemyId)));
    const rosterBosses = [...roster].filter((id) => ENEMIES[id].isBoss).length;
    for (const [n, k] of [[L + 3, rosterBosses], [40, rosterBosses], [45, 2], [49, 2], [50, 3]] as const) {
      const fin = buildWaves(map, n).at(-1)!;
      const bosses = bossesIn(fin);
      expect(bosses, `N=${n}`).toHaveLength(k);
      bosses.forEach((b, i) => {
        expect(b.delay).toBe(i * FINALE_BOSS_SPACING);
        if (i > 0) expect(ENEMIES[b.enemyId].speed).toBeLessThanOrEqual(ENEMIES[bosses[i - 1]!.enemyId].speed);
      });
      const escort = fin.groups.filter((g) => !ENEMIES[g.enemyId].isBoss);
      expect(escort.length).toBeGreaterThan(0);
      for (const g of escort) expect(g.delay).toBeGreaterThanOrEqual(bosses.at(-1)!.delay + 3);
    }
  });
});

test('Dust Ridge W45 at N=50 is 3 Anvil Treads + 2 Brood Carriers (GDD §15 example)', () => {
  const dust = MAP_LIST.find((m) => m.id === 'dust-ridge-outpost')!;
  const w45 = buildWaves(dust, 50)[44]!;
  expect(w45.groups.map((g) => [g.enemyId, g.count, g.interval])).toEqual([
    ['anvil_tread', 3, 1.8],
    ['brood_carrier', 2, 1.8],
  ]);
});

test('two-boss rosters: the N=50 finale is Choir Mother, Choir Mother, Foundry Colossus', () => {
  for (const map of MAP_LIST) {
    const ids = bossesIn(buildWaves(map, 50).at(-1)!).map((g) => g.enemyId);
    if (new Set(ids).size === 2) expect(ids).toEqual(['choir_mother', 'choir_mother', 'foundry_colossus']);
  }
});
