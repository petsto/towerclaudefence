// Headless balance helper: plays a map with a scripted strategy, no render/UI.
import { MAPS, TOWERS } from '../data';
import type { MapDef, TowerId } from '../data/types';
import { createGame } from './game';
import type { Game, SimConfig } from './types';

/** Called every few steps; dispatches whatever commands it likes. */
export type Strategy = (game: Game, map: MapDef) => void;

export interface AutoplayResult {
  readonly result: 'victory' | 'defeat' | 'timeout';
  /** 1-based wave number reached. */
  readonly waveReached: number;
  readonly lives: number;
  readonly cash: number;
}

const DEFAULT_ORDER: readonly TowerId[] = [
  'picket', 'thumper', 'picket', 'arc_coil', 'longshot', 'stasis', 'breacher', 'thumper', 'arc_coil', 'longshot',
];

/** Path tiles weighted by how many paths cross them. */
function pathCells(map: MapDef): { x: number; y: number; w: number }[] {
  const cells = new Map<string, { x: number; y: number; w: number }>();
  for (const path of map.paths) {
    const seen = new Set<string>();
    for (let i = 1; i < path.length; i++) {
      const [c0, r0] = path[i - 1]!;
      const [c1, r1] = path[i]!;
      const steps = Math.abs(c1 - c0) + Math.abs(r1 - r0);
      for (let k = 0; k <= steps; k++) {
        const col = c0 + Math.sign(c1 - c0) * k;
        const row = r0 + Math.sign(r1 - r0) * k;
        const key = `${col},${row}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const cell = cells.get(key) ?? { x: col + 0.5, y: row + 0.5, w: 0 };
        cell.w++;
        cells.set(key, cell);
      }
    }
  }
  return [...cells.values()];
}

/**
 * Greedy: cycle a build order, placing each tower on the free tile covering the most path.
 * From 6 towers on, alternate build and upgrade (lowest level first). Calls wave 1 once broke.
 */
export function greedyStrategy(order: readonly TowerId[] = DEFAULT_ORDER): Strategy {
  let next = 0;
  let upgradeTurn = false;
  let cells: { x: number; y: number; w: number }[] | null = null;
  return (game, map) => {
    const s = game.state;
    cells ??= pathCells(map);
    const def = TOWERS[order[next % order.length]!];
    const lvl = def.levels[0];
    let best: { col: number; row: number; score: number } | null = null;
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        if (!game.canBuild(col, row)) continue;
        let score = 0;
        for (const c of cells) {
          const d = Math.hypot(c.x - col - 0.5, c.y - row - 0.5);
          if (d <= lvl.range && d >= lvl.minRange) score += c.w;
        }
        if (!best || score > best.score) best = { col, row, score };
      }
    }
    const up = s.towers.filter((t) => t.level < 3).sort((a, b) => a.level - b.level || a.id - b.id)[0];
    const wantUpgrade = up && (!best || (s.towers.length >= 6 && upgradeTurn));
    if (wantUpgrade) {
      if (game.dispatch({ type: 'upgrade', towerId: up.id }).ok) upgradeTurn = false;
    } else if (best && s.cash >= lvl.cost) {
      if (game.dispatch({ type: 'build', defId: def.id, col: best.col, row: best.row }).ok) {
        next++;
        upgradeTurn = true;
      }
    } else if (s.waveIndex < 0) {
      game.dispatch({ type: 'callWave' });
    }
  };
}

export function runAutoplay(
  config: SimConfig,
  strategy: Strategy = greedyStrategy(),
  maxSteps = 60 * 60 * 60,
): AutoplayResult {
  const game = createGame(config);
  const map = MAPS[config.mapId];
  for (let i = 0; i < maxSteps && game.state.status === 'playing'; i++) {
    if (i % 15 === 0) strategy(game, map);
    game.step();
    game.drainEvents();
  }
  const s = game.state;
  const result = s.status === 'victory' || s.status === 'defeat' ? s.status : 'timeout';
  return { result, waveReached: s.waveIndex + 1, lives: s.lives, cash: s.cash };
}
