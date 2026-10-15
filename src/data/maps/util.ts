import type { EnemyId, Tile, WaveGroup } from '../types';

const TILE_CHARS: Readonly<Record<string, Tile>> = {
  '.': 'ground',
  '#': 'path',
  B: 'build',
  S: 'spawn',
  C: 'core',
  x: 'decor',
};

/** Parses a maps.md ASCII grid (leading/trailing blank lines ignored) into tiles[row][col]. */
export function parseLayout(ascii: string): Tile[][] {
  return ascii
    .trim()
    .split('\n')
    .map((line) =>
      [...line.trim()].map((ch) => {
        const tile = TILE_CHARS[ch];
        if (!tile) throw new Error(`Unknown layout char '${ch}'`);
        return tile;
      }),
    );
}

/** Wave group shorthand: g(enemy, count, interval s, delay s from wave start, pathIndex). */
export function g(enemyId: EnemyId, count: number, interval: number, delay: number, pathIndex: number): WaveGroup {
  return { enemyId, count, interval, delay, pathIndex };
}
