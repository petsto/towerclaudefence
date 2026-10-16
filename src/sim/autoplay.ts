// Headless balance helper: plays a map with a scripted strategy, no render/UI.
import {
  buildWaves, CHAIN_FALLOFF, CHAIN_JUMP_RANGE, DIFFICULTIES, ENEMIES, hpExponent, MAPS, MID_BOSS_HP_MULT, POWERS, TOWER_LIST, TOWERS,
} from '../data';
import type { DifficultyDef, EnemyDef, EnemyId, MapDef, TowerDef, TowerId, TowerLevel, WaveDef } from '../data/types';
import { resolveHit } from './damage';
import { createGame } from './game';
import { buildPath } from './path';
import { inRange } from './targeting';
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

interface Cell {
  readonly x: number;
  readonly y: number;
  w: number;
}

const DEFAULT_ORDER: readonly TowerId[] = [
  'picket', 'thumper', 'picket', 'arc_coil', 'longshot', 'stasis', 'breacher', 'thumper', 'arc_coil', 'longshot',
];

/** Path tiles weighted by how many paths cross them. */
function pathCells(map: MapDef): Cell[] {
  const cells = new Map<string, Cell>();
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

/** Path tiles (weighted) within a tower level's range ring from tile (col,row). */
function coverage(cells: readonly Cell[], col: number, row: number, lvl: TowerLevel): number {
  let score = 0;
  for (const c of cells) if (inRange(c, col + 0.5, row + 0.5, lvl.range, lvl.minRange)) score += c.w;
  return score;
}

function bestPad(game: Game, map: MapDef, cells: readonly Cell[], lvl: TowerLevel) {
  let best: { col: number; row: number; score: number } | null = null;
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      if (!game.canBuild(col, row)) continue;
      const score = coverage(cells, col, row, lvl);
      if (!best || score > best.score) best = { col, row, score };
    }
  }
  return best;
}

/**
 * Naive: cycle a fixed build order, placing each tower on the free tile covering the most path.
 * From 6 towers on, alternate build and upgrade (lowest level first). Calls wave 1 once broke.
 */
export function greedyStrategy(order: readonly TowerId[] = DEFAULT_ORDER): Strategy {
  let next = 0;
  let upgradeTurn = false;
  let cells: Cell[] | null = null;
  return (game, map) => {
    const s = game.state;
    cells ??= pathCells(map);
    const def = TOWERS[order[next % order.length]!];
    const best = bestPad(game, map, cells, def.levels[0]);
    const up = s.towers.filter((t) => t.level < 3).sort((a, b) => a.level - b.level || a.id - b.id)[0];
    const wantUpgrade = up && (!best || (s.towers.length >= 6 && upgradeTurn));
    if (wantUpgrade && game.dispatch({ type: 'upgrade', towerId: up.id }).ok) {
      upgradeTurn = false;
    } else if (!wantUpgrade && best && game.dispatch({ type: 'build', defId: def.id, col: best.col, row: best.row }).ok) {
      next++;
      upgradeTurn = true;
    } else if (s.waveIndex < 0) {
      game.dispatch({ type: 'callWave' });
    }
  };
}

/** One wave group the competent bot plans against, scaled to the difficulty. */
interface Threat {
  readonly def: EnemyDef;
  readonly hp: number;
  readonly shield: number;
  readonly armor: number;
  readonly speed: number;
  readonly count: number;
  readonly interval: number;
  readonly pathIndex: number;
  /** HP + shields, plus regen over a full path walk (damage is spread out along it). */
  readonly ehp: number;
  /** Lives at stake if the whole group leaks. */
  readonly stake: number;
}

function threats(map: MapDef, waves: readonly WaveDef[], diff: DifficultyDef, from: number, to: number): Threat[] {
  const out: Threat[] = [];
  const lengths = map.paths.map((p) => buildPath(p).length);
  for (let w = Math.max(0, from); w <= Math.min(to, waves.length - 1); w++) {
    const wave = waves[w]!;
    const growth = (map.hpGrowth + diff.growthAdd) ** hpExponent(w, map.waves.length) * diff.hpMult;
    const push = (id: EnemyId, count: number, interval: number, pathIndex: number) => {
      const def = ENEMIES[id];
      const scale = growth * (wave.boss === 'mid' && def.isBoss ? MID_BOSS_HP_MULT : 1);
      const speed = def.speed * diff.speedMult;
      const regen = def.ability?.kind === 'regen' ? (def.ability.hpPerSecond * lengths[pathIndex]!) / speed : 0;
      out.push({
        def, hp: def.hp * scale, shield: def.shield * scale, armor: def.armor + diff.armorAdd,
        speed, count, interval, pathIndex, ehp: (def.hp + def.shield) * scale + regen, stake: count * def.lives,
      });
    };
    for (const grp of wave.groups) {
      push(grp.enemyId, grp.count, grp.interval, grp.pathIndex);
      // ponytail: children approximated as one extra group of Skitterlings at the parent's pace.
      const a = ENEMIES[grp.enemyId].ability;
      if (a?.kind === 'broodBurst') push(a.spawn, a.count * grp.count, grp.interval / a.count, grp.pathIndex);
      if (a?.kind === 'birthing') push(a.spawn, Math.ceil(60 / a.interval) * a.count, a.interval / a.count, grp.pathIndex);
    }
  }
  return out;
}

// Model ignores target contention and overlap between groups, so it plans for MARGIN x the bare kill.
const MARGIN = 2;
/** 'First'-targeting towers spend much of a boss fight on its escorts and spawn. */
const BOSS_DISTRACTION = 0.4;
/** Settle for an affordable action worth at least this fraction of the best one (per credit). */
const SETTLE = 0.8;
// ponytail: Stasis' slow is valued as this many effective HP/s per point of slow; tune if the bot over/under-builds it.
const SLOW_VALUE = 40;

/** Rough effective HP/s a tower level deals to a group (armor, size, shields, splash/chain on packed groups). */
function effDps(def: TowerDef, L: TowerLevel, t: Threat): number {
  const hpHit = resolveHit(0, t.armor, t.def.size, L.damage, def.damageType, 1).hpDamage;
  const shHit = L.damage * L.shieldMult;
  const exec = t.def.isBoss || t.shield > 0 ? 1 : 1 - L.executeThreshold;
  const hits = Math.ceil(t.shield / shHit + (t.hp * exec) / hpHit - 1e-6); // no overkill credit
  const spacing = t.speed * t.interval;
  let multi = L.shots * Math.min(L.beamTargets, t.count);
  // Splash neighbours mostly sit in the 50% outer ring, and shells trail fast targets.
  if (L.splashRadius > 0 && t.count > 1) multi *= 1 + 0.3 * Math.min(t.count - 1, L.splashRadius / spacing);
  if (L.chainTargets > 0 && t.count > 1 && spacing <= CHAIN_JUMP_RANGE) {
    for (let k = 1; k <= Math.min(L.chainTargets, t.count - 1); k++) multi += CHAIN_FALLOFF ** k;
  }
  const dps = ((t.hp + t.shield) / hits) * (multi / L.cooldown);
  const slow = L.slow > 0 && t.def.ability?.kind !== 'slowImmune' ? L.slow * SLOW_VALUE * (t.def.isBoss ? 0.5 : 1) : 0;
  return dps + slow;
}

/**
 * Competent: plans against the next few waves. For each wave group it estimates the kill ratio
 * r = damage the defense can put into the group while it walks past / group effective HP, and expects
 * stake x e^(-r/MARGIN) lives to leak from it. Minimising the sum of squared expected leaks rewards fixing
 * the weakest matchup first (so it mixes tower types) and prepares for bosses well ahead.
 * Each tick it takes the build (best-coverage pad per type) or upgrade with the most score per credit,
 * saving up for it if needed. `only` restricts towers (mono-tower checks). Calls wave 1 once broke.
 */
export function competentStrategy(only?: readonly TowerId[]): Strategy {
  const allowed = only ? only.map((id) => TOWERS[id]) : TOWER_LIST;
  let cells: Cell[][] | null = null;
  let all: Cell[] | null = null;
  let waves: readonly WaveDef[] | null = null;
  return (game, map) => {
    cells ??= map.paths.map((p) => pathCells({ ...map, paths: [p] }));
    all ??= pathCells(map);
    const s = game.state;
    waves ??= buildWaves(map, s.waveCount);
    const pool = threats(map, waves, DIFFICULTIES[s.difficultyId], s.waveIndex, s.waveIndex + 3);
    // Kill ratio contribution of one tower (type, level, tile) to each group: damage over the group's
    // exposure (time in range per enemy + stream length) / group effective HP.
    const contrib = (def: TowerDef, L: TowerLevel, col: number, row: number) =>
      pool.map((t) => {
        const exposure = coverage(cells![t.pathIndex]!, col, row, L) / t.speed + (t.count - 1) * t.interval;
        const focus = t.def.isBoss && def.defaultTargeting !== 'strongest' ? BOSS_DISTRACTION : 1;
        return (focus * effDps(def, L, t) * exposure) / (t.count * t.ehp);
      });
    const r = pool.map(() => 0);
    for (const tw of s.towers) {
      const def = TOWERS[tw.defId];
      contrib(def, def.levels[tw.level - 1]!, tw.col, tw.row).forEach((v, i) => (r[i]! += v));
    }
    // Expected leak per group = stake x e^(-r/MARGIN); squared so one big leak (a boss) outweighs a few strays.
    const leak2 = (t: Threat, ri: number) => (t.stake * Math.exp(-ri / MARGIN)) ** 2;
    const gain = (delta: number[]) => pool.reduce((a, t, i) => a + leak2(t, r[i]!) - leak2(t, r[i]! + delta[i]!), 0);

    const actions: { ratio: number; cost: number; run: () => boolean }[] = [];
    const consider = (value: number, cost: number, run: () => boolean) => actions.push({ ratio: value / cost, cost, run });
    for (const def of allowed) {
      const L = def.levels[0];
      const pad = bestPad(game, map, all, L);
      if (!pad || pad.score === 0) continue;
      consider(gain(contrib(def, L, pad.col, pad.row)), L.cost, () =>
        game.dispatch({ type: 'build', defId: def.id, col: pad.col, row: pad.row }).ok);
    }
    for (const tw of s.towers) {
      if (tw.level === 3) continue;
      const def = TOWERS[tw.defId];
      const now = contrib(def, def.levels[tw.level - 1]!, tw.col, tw.row);
      const next = contrib(def, def.levels[tw.level]!, tw.col, tw.row);
      consider(gain(next.map((v, i) => v - now[i]!)), def.levels[tw.level]!.cost, () =>
        game.dispatch({ type: 'upgrade', towerId: tw.id }).ok);
    }
    actions.sort((a, b) => b.ratio - a.ratio);
    const top = actions[0];
    // Take the best action, or a nearly-as-good affordable one rather than sitting on cash.
    const pick = actions.find((a) => a.cost <= s.cash && a.ratio >= top!.ratio * SETTLE);
    if (pick?.run()) return;
    if (s.waveIndex < 0) game.dispatch({ type: 'callWave' });
  };
}

/**
 * Adds the command powers (GDD §14) to any strategy.
 * Mines: on the free path tile under the most tower range rings, not within the field radius of an armed mine;
 * ties go nearer the core. Lance: on a living boss, else on the enemy tile whose radius holds the most HP + shields,
 * if that is at least one full strike on one target. No lead on fast targets.
 */
export function withPowers(strategy: Strategy): Strategy {
  let cells: Cell[] | null = null;
  return (game, map) => {
    strategy(game, map);
    cells ??= pathCells(map);
    const s = game.state;
    const mines = POWERS.tremor_mines;
    const [coreCol, coreRow] = map.paths[0]!.at(-1)!;
    const toCore = (c: Cell) => Math.hypot(c.x - coreCol - 0.5, c.y - coreRow - 0.5);
    while (s.powers.tremor_mines.charges > 0) {
      let best: { cell: Cell; rings: number } | null = null;
      for (const c of cells) {
        const col = Math.floor(c.x);
        const row = Math.floor(c.y);
        if (!game.canUsePower('tremor_mines', col, row)) continue;
        if (s.mines.some((m) => Math.hypot(m.x - c.x, m.y - c.y) <= mines.fieldRadius)) continue;
        const rings = s.towers.filter((t) => {
          const L = TOWERS[t.defId].levels[t.level - 1]!;
          return inRange(c, t.col + 0.5, t.row + 0.5, L.range, L.minRange);
        }).length;
        if (!best || rings > best.rings || (rings === best.rings && toCore(c) < toCore(best.cell))) best = { cell: c, rings };
      }
      if (!best) break;
      game.dispatch({ type: 'usePower', power: 'tremor_mines', col: Math.floor(best.cell.x), row: Math.floor(best.cell.y) });
    }

    const lance = POWERS.lance_strike;
    if (s.powers.lance_strike.charges < 1) return;
    const alive = s.enemies.filter((e) => e.hp > 0);
    const boss = alive.find((e) => ENEMIES[e.defId].isBoss);
    let target = boss;
    if (!target) {
      const full = lance.pulses * lance.pulseDamage * map.hpGrowth ** hpExponent(Math.max(0, s.waveIndex), map.waves.length);
      let most = 0;
      for (const e of alive) {
        const cx = Math.floor(e.x) + 0.5;
        const cy = Math.floor(e.y) + 0.5;
        let held = 0;
        for (const o of alive) if (Math.hypot(o.x - cx, o.y - cy) <= lance.radius) held += o.hp + o.shield;
        if (held > most) [most, target] = [held, e];
      }
      if (most < full) return;
    }
    if (target) game.dispatch({ type: 'usePower', power: 'lance_strike', col: Math.floor(target.x), row: Math.floor(target.y) });
  };
}

export function runAutoplay(
  config: SimConfig,
  strategy: Strategy = greedyStrategy(),
  maxSteps = 60 * 60 * 90,
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
