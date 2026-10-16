// Custom wave count (GDD §15). Campaign = the map's authored `waves`; a custom run of N waves is
// `buildWaves(map, N)`: pure and deterministic from (map, N), identical across difficulties.
import type { MapDef, WaveDef } from './types';

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

/**
 * The run's wave list (GDD §15). `count` undefined = Campaign; otherwise rounded and clamped to
 * [CUSTOM_WAVES_MIN, CUSTOM_WAVES_MAX], and a count equal to `map.waves.length` returns `map.waves` itself.
 * Shorter: authored prefix + boss closer. Longer: authored waves, then generated ones from `map.roster`,
 * heavies/bosses only from HEAVY_ONLY_FROM, multi-boss finale. The sim, HUD and bots all call this, so it must stay pure.
 */
export function buildWaves(map: MapDef, count?: number): readonly WaveDef[] {
  if (count === undefined || count === map.waves.length) return map.waves;
  // ponytail: contract stub until the waves engineer lands GDD §15 (Stage 10 P1); nothing passes a custom count yet.
  throw new Error(`buildWaves: custom wave counts are not implemented yet (GDD §15), got ${count}`);
}
