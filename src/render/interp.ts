// Sim steps at 60 Hz, frames don't line up with steps. Keep each enemy/projectile's pre-step position and draw
// lerp(prev, current, alpha) where alpha = accumulator / FIXED_DT, i.e. one step behind but smooth. Sim untouched.
import type { EnemyState, GameState, ProjectileState } from '../sim/types';

interface Prev { x: number; y: number; heading: number; gen: number }
export interface Lerped { x: number; y: number; heading: number }

export interface Interp {
  /** Call right before each game.step(). */
  capture(state: GameState): void;
  /** Fraction of the next step already accumulated, 0..1. Stays 1 (= raw sim positions) if nothing sets it. */
  alpha: number;
  /** Shared result object: read it before the next call. */
  enemy(e: EnemyState): Lerped;
  projectile(p: ProjectileState): Lerped;
}

export function createInterp(): Interp {
  const enemies = new Map<number, Prev>();
  const shots = new Map<number, Prev>();
  const out: Lerped = { x: 0, y: 0, heading: 0 };
  let gen = 0;

  function snap(map: Map<number, Prev>, list: readonly { id: number; x: number; y: number; heading?: number }[]): void {
    for (const e of list) {
      let p = map.get(e.id);
      if (!p) map.set(e.id, (p = { x: 0, y: 0, heading: 0, gen }));
      p.x = e.x;
      p.y = e.y;
      p.heading = e.heading ?? 0;
      p.gen = gen;
    }
    for (const [id, p] of map) if (p.gen !== gen) map.delete(id);
  }

  function lerp(map: Map<number, Prev>, id: number, x: number, y: number, heading: number): Lerped {
    const p = map.get(id);
    const a = api.alpha;
    if (!p) {
      out.x = x;
      out.y = y;
      out.heading = heading;
      return out;
    }
    const dh = Math.atan2(Math.sin(heading - p.heading), Math.cos(heading - p.heading)); // shortest turn
    out.x = p.x + (x - p.x) * a;
    out.y = p.y + (y - p.y) * a;
    out.heading = p.heading + dh * a;
    return out;
  }

  const api: Interp = {
    alpha: 1,
    capture(state) {
      gen++;
      snap(enemies, state.enemies);
      snap(shots, state.projectiles);
    },
    enemy: (e) => lerp(enemies, e.id, e.x, e.y, e.heading),
    projectile: (p) => lerp(shots, p.id, p.x, p.y, 0),
  };
  return api;
}
