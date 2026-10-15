import { expect, test } from 'vitest';
import { FIXED_DT } from './constants';

test('fixed timestep is 1/60 s', () => {
  expect(FIXED_DT).toBeCloseTo(1 / 60);
});
