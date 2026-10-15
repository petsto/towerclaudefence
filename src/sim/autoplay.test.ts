import { expect, test } from 'vitest';
import { competentStrategy, greedyStrategy, runAutoplay } from './autoplay';

// Balance floor: full table via `npm run balance` (src/sim/balance.report.test.ts).
test('naive bot wins Dust Ridge on Recruit', () => {
  expect(runAutoplay({ mapId: 'dust-ridge-outpost', difficultyId: 'easy' }, greedyStrategy()).result).toBe('victory');
});

test('competent bot wins Dust Ridge on Veteran; a Picket-only one does not', () => {
  const config = { mapId: 'dust-ridge-outpost', difficultyId: 'normal' } as const;
  expect(runAutoplay(config, competentStrategy()).result).toBe('victory');
  expect(runAutoplay(config, competentStrategy(['picket'])).result).toBe('defeat');
});
