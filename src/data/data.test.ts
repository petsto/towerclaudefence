import { describe, expect, test } from 'vitest';
import { ENEMIES, MAP_LIST, MAPS, POWER_LIST, POWERS, TOWER_LIST, TOWERS } from './index';
import type { MapDef, Tile } from './types';

const WALKABLE: readonly Tile[] = ['path', 'spawn', 'core'];
const tileAt = (map: MapDef, col: number, row: number): Tile | undefined => map.tiles[row]?.[col];

const EXPECTED = {
  'dust-ridge-outpost': { waves: 15, midBoss: 8 },
  'whiteout-relay': { waves: 18, midBoss: 9 },
  'cinder-forge': { waves: 18, midBoss: 9 },
  'blackwater-sluice': { waves: 20, midBoss: 10 },
  'hollow-spire': { waves: 20, midBoss: 10 },
  'ossuary-deep': { waves: 22, midBoss: 11 },
} as const;

describe.each(MAP_LIST.map((m) => [m.id, m] as const))('map %s', (_id, map) => {
  test('layout matches cols x rows', () => {
    const lines = map.layout.trim().split('\n');
    expect(lines).toHaveLength(map.rows);
    for (const line of lines) expect(line.length).toBe(map.cols);
    expect(map.tiles).toHaveLength(map.rows);
    for (const row of map.tiles) expect(row).toHaveLength(map.cols);
  });

  test('paths start at a spawn, end at the core, and walk axis-aligned over path tiles', () => {
    expect(map.paths.length).toBeGreaterThan(0);
    for (const path of map.paths) {
      const first = path[0];
      const last = path[path.length - 1];
      if (!first || !last) throw new Error('empty path');
      expect(tileAt(map, ...first)).toBe('spawn');
      expect(tileAt(map, ...last)).toBe('core');
      for (let i = 1; i < path.length; i++) {
        const [c0, r0] = path[i - 1]!;
        const [c1, r1] = path[i]!;
        expect(c0 === c1 || r0 === r1, `segment ${i} is axis-aligned`).toBe(true);
        expect(c0 === c1 && r0 === r1, `segment ${i} has length`).toBe(false);
        const steps = Math.abs(c1 - c0) + Math.abs(r1 - r0);
        for (let s = 0; s <= steps; s++) {
          const col = c0 + Math.sign(c1 - c0) * s;
          const row = r0 + Math.sign(r1 - r0) * s;
          expect(WALKABLE, `[${col},${row}]`).toContain(tileAt(map, col, row));
        }
      }
    }
  });

  test('has the expected wave count with bosses at midpoint and final wave', () => {
    const expected = EXPECTED[map.id];
    expect(map.waves).toHaveLength(expected.waves);
    map.waves.forEach((wave, i) => {
      const n = i + 1;
      const hasBoss = wave.groups.some((grp) => ENEMIES[grp.enemyId].isBoss);
      const boss = n === expected.midBoss ? 'mid' : n === expected.waves ? 'final' : null;
      expect(wave.boss, `wave ${n} boss flag`).toBe(boss);
      expect(hasBoss, `wave ${n} contains boss`).toBe(boss !== null);
    });
  });

  test('every wave group references a valid enemy and path', () => {
    for (const wave of map.waves) {
      expect(wave.groups.length).toBeGreaterThan(0);
      for (const grp of wave.groups) {
        expect(ENEMIES[grp.enemyId]).toBeDefined();
        expect(Number.isInteger(grp.pathIndex) && grp.pathIndex >= 0 && grp.pathIndex < map.paths.length).toBe(true);
        expect(grp.count).toBeGreaterThan(0);
        expect(grp.interval).toBeGreaterThanOrEqual(0);
        expect(grp.delay).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

test('MAPS record matches MAP_LIST', () => {
  expect(MAP_LIST.map((m) => m.id).sort()).toEqual(Object.keys(MAPS).sort());
  for (const [id, map] of Object.entries(MAPS)) expect(map.id).toBe(id);
});

test('6 towers, each with base + 2 upgrades and a unique hotkey', () => {
  expect(TOWER_LIST).toHaveLength(6);
  expect(Object.keys(TOWERS)).toHaveLength(6);
  expect(new Set(TOWER_LIST.map((t) => t.hotkey)).size).toBe(6);
  for (const tower of TOWER_LIST) {
    expect(TOWERS[tower.id]).toBe(tower);
    expect(tower.levels).toHaveLength(3);
    for (const lvl of tower.levels) {
      expect(lvl.cost).toBeGreaterThan(0);
      expect(lvl.cooldown).toBeGreaterThan(0);
      expect(lvl.range).toBeGreaterThan(lvl.minRange);
    }
  }
});

test('only Remnant enemies have shields', () => {
  for (const enemy of Object.values(ENEMIES)) {
    if (enemy.faction !== 'remnant') expect(enemy.shield, enemy.id).toBe(0);
  }
});

test('picket upgrades raise damage and fire rate every level', () => {
  const [l1, l2, l3] = TOWERS.picket.levels;
  expect(l2.damage).toBeGreaterThan(l1.damage);
  expect(l3.damage).toBeGreaterThan(l2.damage);
  expect(l2.cooldown).toBeLessThan(l1.cooldown);
  expect(l3.cooldown).toBeLessThan(l2.cooldown);
});

test('thumper fires 1/2/3 shells per volley', () => {
  expect(TOWERS.thumper.levels.map((l) => l.shots)).toEqual([1, 2, 3]);
});

test('powers: one per id, hotkeys clear of tower and HUD keys, sane numbers', () => {
  expect(POWER_LIST.map((p) => p.id).sort()).toEqual(Object.keys(POWERS).sort());
  // 1-6 towers; u/x/p/f/tab/space/esc HUD; w/a/s/d camera pan
  const taken = new Set([...TOWER_LIST.map((t) => t.hotkey), 'u', 'x', 'p', 'f', 'w', 'a', 's', 'd']);
  for (const p of POWER_LIST) {
    expect(POWERS[p.id]).toBe(p);
    expect(taken.has(p.hotkey), p.hotkey).toBe(false);
    taken.add(p.hotkey);
    expect(p.chargeTime).toBeGreaterThan(0);
    expect(Number.isInteger(p.maxCharges) && p.maxCharges >= 1).toBe(true);
  }
  const m = POWERS.tremor_mines;
  expect(m.slow).toBeGreaterThan(0);
  expect(m.slow).toBeLessThan(1);
  expect(m.fieldRadius).toBeGreaterThanOrEqual(m.triggerRadius);
  expect(m.fieldDuration).toBeGreaterThan(0);
  const l = POWERS.lance_strike;
  expect(l.radius).toBeGreaterThan(0);
  expect(l.telegraph).toBeGreaterThan(0);
  expect(Number.isInteger(l.pulses) && l.pulses >= 1).toBe(true);
  expect(l.pulseDamage).toBeGreaterThan(0);
  expect(l.bossFraction).toBeGreaterThan(0);
  expect(l.bossFraction).toBeLessThan(0.5); // decisive help, never a boss delete
  expect(l.chargeTime).toBeGreaterThan(m.chargeTime);
});
