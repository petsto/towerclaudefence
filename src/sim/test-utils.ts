import type { DifficultyId, MapId } from '../data/types';
import { createSim } from './game';
import type { Game } from './types';

export const setup = (difficultyId: DifficultyId = 'normal', mapId: MapId = 'dust-ridge-outpost') =>
  createSim({ mapId, difficultyId });

export function run(game: Game, steps: number) {
  for (let i = 0; i < steps; i++) game.step();
}

/** Steps until `done` holds (or throws after `max` steps); returns steps taken. */
export function runUntil(game: Game, done: () => boolean, max = 100_000): number {
  for (let i = 0; i < max; i++) {
    if (done()) return i;
    game.step();
  }
  throw new Error('condition never met');
}
