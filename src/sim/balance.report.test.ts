// Balance table: `npm run balance`. Excluded from `npm test` (slow-ish, prints instead of asserting).
import { test } from 'vitest';
import { DIFFICULTY_LIST, MAP_LIST, TOWER_LIST } from '../data';
import type { DifficultyId, MapId } from '../data/types';
import { competentStrategy, greedyStrategy, runAutoplay, type Strategy } from './autoplay';

const row = (name: string, mapId: MapId, difficultyId: DifficultyId, strategy: Strategy) => {
  const r = runAutoplay({ mapId, difficultyId }, strategy);
  const res = r.result === 'victory' ? 'WIN ' : r.result === 'defeat' ? 'loss' : 'time';
  return `| ${mapId.padEnd(18)} | ${difficultyId.padEnd(6)} | ${name.padEnd(16)} | ${res} | ${String(r.waveReached).padStart(2)} | ${String(r.lives).padStart(2)} | ${String(r.cash).padStart(5)} |`;
};

test('balance report', () => {
  const lines = ['| Map | Diff | Bot | Result | Wave | Lives | Unspent |', '|---|---|---|---|---|---|---|'];
  for (const map of MAP_LIST) {
    for (const d of DIFFICULTY_LIST) {
      lines.push(row('naive', map.id, d.id, greedyStrategy()));
      lines.push(row('competent', map.id, d.id, competentStrategy()));
    }
  }
  lines.push('', 'Mono-tower competent bot (compare with the mixed rows above):', lines[0]!, lines[1]!);
  for (const map of MAP_LIST) {
    for (const d of ['normal', 'hard'] as const) {
      for (const t of TOWER_LIST) lines.push(row(`only ${t.id}`, map.id, d, competentStrategy([t.id])));
    }
  }
  console.log(lines.join('\n'));
}, 600_000);
