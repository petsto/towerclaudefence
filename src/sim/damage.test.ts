import { expect, test } from 'vitest';
import type { DamageType, SizeClass } from '../data/types';
import { resolveHit } from './damage';

// [label, shield, armor, size, damage, type, shieldMult, expected shieldDamage, expected hpDamage]
const cases: [string, number, number, SizeClass, number, DamageType, number, number, number][] = [
  ['normal vs unarmored light', 0, 0, 'light', 6, 'normal', 1, 0, 6],
  ['armor subtracts', 0, 1, 'medium', 6, 'normal', 1, 0, 5],
  ['armor before size mult', 0, 1, 'medium', 20, 'concussive', 1, 0, 9.5],
  ['concussive vs heavy', 0, 2, 'heavy', 20, 'concussive', 1, 0, 4.5],
  ['explosive vs light', 0, 0, 'light', 35, 'explosive', 1, 0, 17.5],
  ['explosive vs heavy', 0, 4, 'heavy', 50, 'explosive', 1, 0, 46],
  ['plasma ignores armor', 0, 4, 'heavy', 14, 'plasma', 1.5, 0, 14],
  ['armor floor 0.5', 0, 5, 'light', 3, 'normal', 1, 0, 0.5],
  ['armor floor after size mult', 0, 4, 'heavy', 4, 'concussive', 1, 0, 0.5],
  ['shield absorbs all', 15, 1, 'light', 10, 'normal', 1, 10, 0],
  ['shield ignores size mult', 150, 4, 'heavy', 20, 'concussive', 1, 20, 0],
  ['shield overflow then armor', 15, 1, 'light', 20, 'normal', 1, 15, 4],
  ['plasma x1.5 on shields', 15, 1, 'light', 14, 'plasma', 1.5, 15, 4],
  ['arc L3 x2 on shields', 100, 4, 'heavy', 26, 'plasma', 2, 52, 0],
  ['overflow below armor floors', 15, 4, 'medium', 16, 'normal', 1, 15, 0.5],
];

test.each(cases)('%s', (_label, shield, armor, size, damage, type, mult, expShield, expHp) => {
  const r = resolveHit(shield, armor, size, damage, type, mult);
  expect(r.shieldDamage).toBeCloseTo(expShield);
  expect(r.hpDamage).toBeCloseTo(expHp);
});
