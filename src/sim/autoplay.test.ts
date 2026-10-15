import { expect, test } from 'vitest';
import { runAutoplay } from './autoplay';

test('greedy autoplay finishes Dust Ridge on Recruit without throwing', () => {
  const r = runAutoplay({ mapId: 'dust-ridge-outpost', difficultyId: 'easy' });
  expect(['victory', 'defeat']).toContain(r.result);
  expect(r.waveReached).toBeGreaterThan(0);
});
