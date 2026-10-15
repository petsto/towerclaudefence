import type { TargetingMode } from '../data/types';

export interface Candidate {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly distanceToCore: number;
  readonly hp: number;
  readonly shield: number;
  readonly slowed: boolean;
  readonly slowImmune: boolean;
}

export function inRange(e: { readonly x: number; readonly y: number }, cx: number, cy: number, range: number, minRange: number): boolean {
  const d = Math.hypot(e.x - cx, e.y - cy);
  return d <= range && d >= minRange;
}

/** Enemies in range, best target first (GDD §3 targeting; tie-break lowest id). */
export function rankTargets<T extends Candidate>(
  enemies: readonly T[],
  cx: number,
  cy: number,
  range: number,
  minRange: number,
  mode: TargetingMode,
  prefersUnslowed: boolean,
): T[] {
  const key = (e: T): number => {
    switch (mode) {
      case 'first': return e.distanceToCore;
      case 'last': return -e.distanceToCore;
      case 'strongest': return -(e.hp + e.shield);
      case 'weakest': return e.hp + e.shield;
      case 'closest': return Math.hypot(e.x - cx, e.y - cy);
    }
  };
  const stale = (e: T): number => (prefersUnslowed && (e.slowed || e.slowImmune) ? 1 : 0);
  return enemies
    .filter((e) => inRange(e, cx, cy, range, minRange))
    .sort((a, b) => stale(a) - stale(b) || key(a) - key(b) || a.id - b.id);
}
