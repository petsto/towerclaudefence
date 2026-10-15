import { expect, test } from 'vitest';
import type { TargetingMode } from '../data/types';
import { type Candidate, rankTargets } from './targeting';

const c = (id: number, x: number, distanceToCore: number, hp: number, extra: Partial<Candidate> = {}): Candidate => ({
  id, x, y: 0, distanceToCore, hp, shield: 0, slowed: false, slowImmune: false, ...extra,
});

// Tower at origin, range 5.
const enemies = [c(1, 1, 30, 100), c(2, 3, 10, 50), c(3, 4, 20, 50, { shield: 80 }), c(4, 9, 1, 10)];
const ids = (mode: TargetingMode, list = enemies, prefersUnslowed = false, minRange = 0) =>
  rankTargets(list, 0, 0, 5, minRange, mode, prefersUnslowed).map((e) => e.id);

test.each<[TargetingMode, number[]]>([
  ['first', [2, 3, 1]],
  ['last', [1, 3, 2]],
  ['strongest', [3, 1, 2]],
  ['weakest', [2, 1, 3]],
  ['closest', [1, 2, 3]],
])('%s ignores out-of-range enemies and orders correctly', (mode, expected) => {
  expect(ids(mode)).toEqual(expected);
});

test('ties break on lowest id', () => {
  expect(ids('weakest', [c(7, 1, 5, 20), c(3, 2, 5, 20)])).toEqual([3, 7]);
});

test('minRange excludes close enemies', () => {
  expect(ids('first', enemies, false, 2)).toEqual([2, 3]);
});

test('prefersUnslowed puts slowed and slow-immune targets last', () => {
  const list = [c(1, 1, 5, 10, { slowed: true }), c(2, 2, 8, 10, { slowImmune: true }), c(3, 3, 9, 10)];
  expect(ids('first', list, true)).toEqual([3, 1, 2]);
  expect(ids('first', list, false)).toEqual([1, 2, 3]);
});
