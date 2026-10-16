// Custom wave count (GDD §15). Campaign = the map's authored `waves`; a custom run of N waves is
// `buildWaves(map, N)`: pure and deterministic from (map, N), identical across difficulties.
import { ENEMIES } from './enemies';
import type { EnemyId, MapDef, WaveDef, WaveGroup } from './types';

/** Custom run length range, inclusive. Every map's authored count lies inside it, so Campaign is also a valid N. */
export const CUSTOM_WAVES_MIN = 10;
export const CUSTOM_WAVES_MAX = 50;
/** From this 1-based wave on, generated waves field only heavies (size 'heavy') and bosses. */
export const HEAVY_ONLY_FROM = 41;
/** HP growth exponent rate past the authored waves: 1 = keep compounding, 0 = flat (see hpExponent). */
export const CUSTOM_GROWTH_TAIL = 0.5;
/** Seconds between bosses that share a path in a generated finale (faster boss first, so one Lance can't hit two). */
export const FINALE_BOSS_SPACING = 8;

/**
 * Exponent for `growth ** e` (enemy HP/shields and Lance Strike pulse damage) at 0-based `waveIndex`.
 * Authored waves compound normally; past them the rate drops to CUSTOM_GROWTH_TAIL, so 50 waves stay finite
 * (Hollow Spire W50 ×13.7 instead of ×43). Campaign and short runs never reach the tail: e === waveIndex.
 */
export function hpExponent(waveIndex: number, authoredCount: number): number {
  const last = authoredCount - 1;
  return waveIndex <= last ? waveIndex : last + (waveIndex - last) * CUSTOM_GROWTH_TAIL;
}

/** Rounds and clamps a requested run length to [CUSTOM_WAVES_MIN, CUSTOM_WAVES_MAX]. NaN throws. */
export function clampWaveCount(count: number): number {
  if (Number.isNaN(count)) throw new RangeError('waveCount is NaN');
  return Math.min(CUSTOM_WAVES_MAX, Math.max(CUSTOM_WAVES_MIN, Math.round(count)));
}

type Cls = 'light' | 'medium' | 'heavy' | 'boss';
type Share = readonly [Cls, number];

const MILESTONE = 10;
const CLEARANCE = 2;
const ESCORT_SHARE = 0.5;
/** §8 default gap between consecutive groups on one path. */
const GROUP_GAP = 3;
const SHAPES: readonly (readonly Share[])[] = [
  [['light', 0.6], ['medium', 0.4]], // 0 swarm
  [['medium', 0.7], ['light', 0.3]], // 1 line
  [['heavy', 0.5], ['medium', 0.3], ['light', 0.2]], // 2 armor
  [['heavy', 0.6], ['medium', 0.4]], // 3 siege
];
const HEAVY_SHAPE: readonly Share[] = [['heavy', 0.6], ['heavy', 0.4]];
const FALLBACK: Readonly<Record<Cls, Cls | null>> = { heavy: 'medium', medium: 'light', light: 'medium', boss: null };

const clsOf = (id: EnemyId): Cls => {
  const d = ENEMIES[id];
  return d.isBoss ? 'boss' : d.size;
};
/** Base HP + shields, plus brood-burst children (Brood Carrier = 885). */
const pool = (id: EnemyId): number => {
  const d = ENEMIES[id];
  const a = d.ability;
  return d.hp + d.shield + (a?.kind === 'broodBurst' ? a.count * pool(a.spawn) : 0);
};
const interval = (id: EnemyId, count: number): number =>
  ({ light: count >= 16 ? 0.3 : 0.4, medium: 0.9, heavy: 1.8, boss: 0 })[clsOf(id)];
const round1 = (x: number) => Math.round(x * 10) / 10;

interface Spec {
  readonly id: EnemyId;
  readonly count: number;
  readonly path: number;
}

/** First group on each path starts at `start`; the next one GROUP_GAP s after the previous one's last spawn. */
function timed(specs: readonly Spec[], start = 0): WaveGroup[] {
  const free = new Map<number, number>();
  return specs.map(({ id, count, path }) => {
    const delay = round1(free.get(path) ?? start);
    const iv = interval(id, count);
    free.set(path, delay + (count - 1) * iv + GROUP_GAP);
    return { enemyId: id, count, interval: iv, delay, pathIndex: path };
  });
}

/** Enemies generated waves may use: `map.roster`, else every enemy in the authored waves in order of first appearance. */
function rosterOf(map: MapDef): readonly EnemyId[] {
  return map.roster ?? [...new Set(map.waves.flatMap((w) => w.groups.map((g) => g.enemyId)))];
}

function generator(map: MapDef) {
  const roster = rosterOf(map);
  const byCls = (c: Cls) => roster.filter((id) => clsOf(id) === c);
  const classes: Record<Cls, readonly EnemyId[]> = { light: byCls('light'), medium: byCls('medium'), heavy: byCls('heavy'), boss: byCls('boss') };
  const bosses = classes.boss;
  if (bosses.length === 0) throw new Error(`buildWaves: ${map.id} roster has no boss`);
  const allPaths = map.paths.map((_, i) => i);
  const heavyPaths = map.heavyPaths ?? allPaths;
  const w1 = map.waves[0]!.groups.reduce((a, g) => a + g.count * pool(g.enemyId), 0);
  const budget = (w: number) => w1 * (1 + 0.25 * (w - 1));
  const idsFor = (c: Cls): readonly EnemyId[] => {
    let cur: Cls | null = c;
    for (let i = 0; cur && i < 3; i++, cur = FALLBACK[cur]) if (classes[cur].length) return classes[cur];
    throw new Error(`buildWaves: ${map.id} roster has no ${c} fallback`);
  };
  // Only lights may use paths outside heavyPaths: Ossuary's 14-tile sally port can't absorb 15+ generated Rivets.
  const pathFor = (id: EnemyId, w: number, k: number) => {
    const allowed = clsOf(id) === 'light' ? allPaths : heavyPaths;
    return allowed[(w + k) % allowed.length]!;
  };

  /** The wave's shape (heavy-only from HEAVY_ONLY_FROM) as one group per share, sized to `fraction` × B(w). */
  const shape = (w: number, fraction: number): Spec[] =>
    (w >= HEAVY_ONLY_FROM ? HEAVY_SHAPE : SHAPES[w % 4]!).map(([c, share], k) => {
      const ids = idsFor(c);
      const id = ids[(w + k) % ids.length]!;
      return { id, count: Math.max(1, Math.round((share * fraction * budget(w)) / pool(id))), path: pathFor(id, w, k) };
    });

  /** Generated wave w (1-based) of an N-wave run, w < N. */
  const wave = (w: number, n: number): WaveDef => {
    const bossWave = w <= n - 1 - CLEARANCE && (w >= HEAVY_ONLY_FROM ? w % 2 === 0 : w >= 2 * MILESTONE && w % MILESTONE === 0);
    if (!bossWave) return { boss: null, groups: timed(shape(w, 1)) };
    const boss = bosses[Math.floor(w / 2) % bosses.length]!;
    return { boss: 'final', groups: timed([{ id: boss, count: 1, path: pathFor(boss, w, 0) }, ...shape(w, ESCORT_SHARE)]) };
  };

  /** Wave N: K bosses, fastest first, FINALE_BOSS_SPACING s apart, then the escort GROUP_GAP s after the last. */
  const finale = (n: number): WaveDef => {
    const k = n < HEAVY_ONLY_FROM ? bosses.length : n < CUSTOM_WAVES_MAX ? 2 : 3;
    // Roster bosses fastest first, cycled to K, then re-sorted (stable) so gaps never close: K=3 is Choir, Choir, Colossus.
    const bySpeed = (a: EnemyId, b: EnemyId) => ENEMIES[b].speed - ENEMIES[a].speed;
    const fastest = [...bosses].sort(bySpeed);
    const ids = Array.from({ length: k }, (_, i) => fastest[i % fastest.length]!).sort(bySpeed);
    const bossGroups = ids.map((enemyId, i): WaveGroup => ({
      enemyId,
      count: 1,
      interval: 0,
      delay: i * FINALE_BOSS_SPACING,
      pathIndex: heavyPaths[i % heavyPaths.length]!,
    }));
    return { boss: 'final', groups: [...bossGroups, ...timed(shape(n, ESCORT_SHARE), (k - 1) * FINALE_BOSS_SPACING + GROUP_GAP)] };
  };

  return { wave, finale };
}

/**
 * The run's wave list (GDD §15). `count` undefined = Campaign; otherwise rounded and clamped to
 * [CUSTOM_WAVES_MIN, CUSTOM_WAVES_MAX], and a count equal to `map.waves.length` returns `map.waves` itself.
 * Shorter: authored prefix + boss closer. Longer: authored waves, then generated ones from `map.roster`,
 * heavies/bosses only from HEAVY_ONLY_FROM, multi-boss finale. The sim, HUD and bots all call this, so it must stay pure.
 */
export function buildWaves(map: MapDef, count?: number): readonly WaveDef[] {
  if (count === undefined) return map.waves;
  const n = clampWaveCount(count);
  const authored = map.waves;
  const l = authored.length;
  if (n === l) return authored;
  const mid = authored.findIndex((w) => w.boss === 'mid'); // 0-based M − 1
  if (n < l) {
    // Quick (N ≤ M + 2): non-boss prefix + the mid boss. Truncated: authored prefix (mid boss kept) + the final.
    if (n <= mid + 1 + CLEARANCE) return [...authored.filter((w) => !w.boss).slice(0, n - 1), authored[mid]!];
    return [...authored.slice(0, n - 1), authored[l - 1]!];
  }
  const gen = generator(map);
  const out = authored.slice(0, l - 1);
  for (let w = l; w < n; w++) out.push(w === l && l <= n - 1 - CLEARANCE ? authored[l - 1]! : gen.wave(w, n));
  out.push(gen.finale(n));
  return out;
}
