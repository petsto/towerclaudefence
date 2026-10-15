// Simulation public contract. Sim, render and UI all code against this file; types only, no logic.
//
// Coordinates: tile units, origin top-left. Tile (col,row) center is x = col + 0.5, y = row + 0.5
// (render maps sim y to world z). Angles in radians, 0 = +x, increasing toward +y.
// Wave indices are 0-based everywhere; HUD shows waveIndex + 1. Times are seconds of sim time.

import type {
  DamageType,
  DifficultyId,
  EnemyId,
  MapId,
  PowerId,
  TargetingMode,
  TowerId,
} from '../data/types';

export type GameStatus = 'playing' | 'paused' | 'victory' | 'defeat';
export type GameSpeed = 1 | 2 | 3;

export interface TowerState {
  readonly id: number;
  readonly defId: TowerId;
  readonly col: number;
  readonly row: number;
  readonly level: 1 | 2 | 3;
  readonly targeting: TargetingMode;
  /** Turret yaw, radians. */
  readonly rotation: number;
  /** Seconds until ready; 0 = ready/idle. */
  readonly cooldown: number;
  /** Last target fired at while it is alive and in range (sim-internal; render aims from `rotation`). */
  readonly targetId: number | null;
  readonly totalDamage: number;
  readonly kills: number;
  /** Credits a sell would return right now: 100% of spend since the last enemy spawn, 70% of the rest. */
  readonly sellValue: number;
}

export interface EnemyState {
  /** Monotonic spawn id; also the targeting tie-break (lowest wins). */
  readonly id: number;
  readonly defId: EnemyId;
  readonly pathIndex: number;
  readonly x: number;
  readonly y: number;
  /** Tiles travelled along the path from its spawn waypoint. */
  readonly progress: number;
  /** Remaining path length to the core ("First" targeting = min). */
  readonly distanceToCore: number;
  /** Movement direction, radians (for model yaw). */
  readonly heading: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly shield: number;
  readonly maxShield: number;
  readonly slowed: boolean;
  /** Spawned as a mid-boss variant (MID_BOSS_HP_MULT HP, flat bounty). */
  readonly midBoss: boolean;
}

export interface ProjectileState {
  readonly id: number;
  readonly kind: 'shell' | 'missile';
  readonly towerId: number;
  readonly damageType: DamageType;
  readonly x: number;
  readonly y: number;
  /** Launch point (for the shell's lob arc). */
  readonly originX: number;
  readonly originY: number;
  /** Homing target; null once it died (shell continues to its last position, missile fizzles). */
  readonly targetId: number | null;
  /** Current aim point: target position, or last known position if the target died. */
  readonly targetX: number;
  readonly targetY: number;
}

/** Command power charge (GDD §14). Charging starts when wave 1 launches; `charge` holds at 0 while charges are full. */
export interface PowerState {
  /** Charges ready to use, 0..maxCharges. */
  readonly charges: number;
  /** Sim seconds charged toward the next charge, 0..chargeTime (HUD fill = charge / chargeTime). */
  readonly charge: number;
}

/** An armed Tremor Mine waiting on a path tile (one per tile). */
export interface MineState {
  readonly id: number;
  readonly col: number;
  readonly row: number;
  /** Tile center. */
  readonly x: number;
  readonly y: number;
}

/** A triggered mine's slow field. Same id as the mine that opened it. */
export interface TremorFieldState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Seconds until it closes (render fades it out over the last ~1.5 s). */
  readonly timeLeft: number;
}

/** A Lance Strike from use until its last pulse interval ends. */
export interface StrikeState {
  readonly id: number;
  readonly col: number;
  readonly row: number;
  /** Target tile center. */
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** 'telegraph': reticle, no damage yet. 'firing': beam on, pulses every pulseInterval. */
  readonly phase: 'telegraph' | 'firing';
  /** Seconds left in the current phase. */
  readonly timeLeft: number;
}

/** Transient events for VFX/audio/HUD. Accumulate across steps and dispatches until drained. */
export type SimEvent =
  | { readonly type: 'build'; readonly towerId: number; readonly defId: TowerId; readonly col: number; readonly row: number }
  | { readonly type: 'upgrade'; readonly towerId: number; readonly level: 2 | 3 }
  | { readonly type: 'sell'; readonly towerId: number; readonly col: number; readonly row: number; readonly refund: number }
  | { readonly type: 'spawn'; readonly enemyId: number; readonly defId: EnemyId; readonly x: number; readonly y: number }
  /** Tower fired: hitscan/beam resolve now; shell/missile also create a projectile. */
  | { readonly type: 'shot'; readonly towerId: number; readonly defId: TowerId; readonly targetId: number }
  /** Damage landed on an enemy. `shield` = damage absorbed by shields this hit. */
  | {
      readonly type: 'hit';
      readonly enemyId: number;
      readonly x: number;
      readonly y: number;
      readonly damageType: DamageType;
      readonly damage: number;
      readonly shield: number;
    }
  | { readonly type: 'explosion'; readonly x: number; readonly y: number; readonly radius: number }
  /** Arc Coil zap: tower muzzle first, then each enemy hit in order. */
  | { readonly type: 'chain'; readonly towerId: number; readonly points: readonly { readonly x: number; readonly y: number }[] }
  | { readonly type: 'shieldBreak'; readonly enemyId: number; readonly x: number; readonly y: number }
  | { readonly type: 'death'; readonly enemyId: number; readonly defId: EnemyId; readonly x: number; readonly y: number; readonly bounty: number }
  | { readonly type: 'leak'; readonly enemyId: number; readonly defId: EnemyId; readonly lives: number }
  | { readonly type: 'waveStart'; readonly index: number; readonly earlyBonus: number; readonly boss: 'mid' | 'final' | null }
  | { readonly type: 'waveClear'; readonly index: number; readonly bonus: number }
  | { readonly type: 'gameOver'; readonly result: 'victory' | 'defeat' }
  /** A power gained a charge. Cue sound/flash only when `charges` is 1 (it just became usable). */
  | { readonly type: 'powerReady'; readonly power: PowerId; readonly charges: number }
  | { readonly type: 'minePlanted'; readonly mineId: number; readonly col: number; readonly row: number; readonly x: number; readonly y: number }
  /** An enemy touched the mine: it is gone and a field with the same id opens (see GameState.tremorFields). */
  | { readonly type: 'mineTriggered'; readonly mineId: number; readonly x: number; readonly y: number; readonly radius: number }
  /** Strike used: reticle goes down, first pulse lands in `delay` s. */
  | {
      readonly type: 'strikeTelegraph';
      readonly strikeId: number;
      readonly x: number;
      readonly y: number;
      readonly radius: number;
      readonly delay: number;
    }
  /** One damage pulse (0-based `index`; 0 = impact). Its damage arrives as ordinary 'hit'/'death' events. */
  | { readonly type: 'strikePulse'; readonly strikeId: number; readonly x: number; readonly y: number; readonly radius: number; readonly index: number };

export interface GameState {
  readonly mapId: MapId;
  readonly difficultyId: DifficultyId;
  readonly status: GameStatus;
  readonly speed: GameSpeed;
  /** Sim seconds elapsed while playing. */
  readonly time: number;
  readonly cash: number;
  readonly lives: number;
  /** Most recently launched wave, -1 before the first CALL WAVE. */
  readonly waveIndex: number;
  readonly waveCount: number;
  /** A launched wave is still spawning. */
  readonly waveActive: boolean;
  /**
   * Seconds until the next wave auto-launches; null before wave 1, while spawning, or after the last wave.
   * Holds at its start value while the latest wave still has enemies alive (up to WAVE_MAX_HOLD s).
   */
  readonly nextWaveIn: number | null;
  readonly towers: readonly TowerState[];
  readonly enemies: readonly EnemyState[];
  readonly projectiles: readonly ProjectileState[];
  readonly powers: Readonly<Record<PowerId, PowerState>>;
  readonly mines: readonly MineState[];
  readonly tremorFields: readonly TremorFieldState[];
  readonly strikes: readonly StrikeState[];
  /** See Game.drainEvents. */
  readonly events: readonly SimEvent[];
}

export type Command =
  | { readonly type: 'build'; readonly defId: TowerId; readonly col: number; readonly row: number }
  | { readonly type: 'upgrade'; readonly towerId: number }
  | { readonly type: 'sell'; readonly towerId: number }
  | { readonly type: 'setTargeting'; readonly towerId: number; readonly mode: TargetingMode }
  /** Launch the next wave now. Before wave 1 this starts the game; during a countdown it pays the early-call bonus. */
  | { readonly type: 'callWave' }
  /**
   * Use a command power on a tile. Needs a charge. Mines: free 'path' tile (not spawn/core, no mine on it).
   * Strike: any in-bounds tile. Errors: 'Charging', 'Mines go on the lane', 'Mine already there', 'Out of bounds'.
   */
  | { readonly type: 'usePower'; readonly power: PowerId; readonly col: number; readonly row: number }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'setSpeed'; readonly speed: GameSpeed };

export type CommandResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

export interface SimConfig {
  readonly mapId: MapId;
  readonly difficultyId: DifficultyId;
}

export interface Game {
  /** Live, read-only view. Replaced or mutated only by the sim; never mutate from outside. */
  readonly state: GameState;
  /**
   * Validates and applies a command immediately (between steps). Rejected commands change nothing.
   * While paused only 'resume' and 'setSpeed' are accepted; after victory/defeat nothing is.
   */
  dispatch(cmd: Command): CommandResult;
  /** Advances exactly FIXED_DT (1/60 s). No-op unless status is 'playing'. */
  step(): void;
  /** Tile is a free build tile ('B' and no tower). Does not check cash. */
  canBuild(col: number, row: number): boolean;
  /** usePower would be accepted on this tile right now (placement and charge). For the targeting preview. */
  canUsePower(power: PowerId, col: number, row: number): boolean;
  /**
   * Returns and clears state.events. Events accumulate across every step() and dispatch()
   * since the last drain, so none are lost when a frame runs 0..N steps.
   */
  drainEvents(): SimEvent[];
}
