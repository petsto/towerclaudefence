// Shared data contracts. Rules that use these values are in docs/GDD.md.

export type SizeClass = 'light' | 'medium' | 'heavy';
export type DamageType = 'normal' | 'concussive' | 'explosive' | 'plasma';
export type Faction = 'chorus' | 'remnant';
export type TargetingMode = 'first' | 'last' | 'strongest' | 'weakest' | 'closest';

export type TowerId = 'picket' | 'thumper' | 'stasis' | 'longshot' | 'breacher' | 'arc_coil';
export type EnemyId =
  | 'skitterling'
  | 'husk_crawler'
  | 'brood_carrier'
  | 'choir_mother'
  | 'spindle_drone'
  | 'rivet_walker'
  | 'mender_unit'
  | 'anvil_tread'
  | 'foundry_colossus';
// Next: 'whiteout-relay' | 'blackwater-sluice' | 'ossuary-deep' (docs/design/maps.md §4–§6), added with their map files.
export type MapId = 'dust-ridge-outpost' | 'cinder-forge' | 'hollow-spire';
export type DifficultyId = 'easy' | 'normal' | 'hard' | 'brutal';

/**
 * How a shot travels. hitscan/beam/chain resolve instantly on fire;
 * shell/missile spawn a homing projectile moving at `projectileSpeed`.
 */
export type Delivery = 'hitscan' | 'shell' | 'beam' | 'missile' | 'chain';

/** Full stats at one level (not deltas). 0 means "does not have this". */
export interface TowerLevel {
  /** L1: build cost. L2/L3: upgrade cost from the previous level. */
  readonly cost: number;
  readonly damage: number;
  /** Seconds between shots (or salvos). */
  readonly cooldown: number;
  /** Tiles, tower tile center to enemy center. */
  readonly range: number;
  /** Tiles; enemies closer than this cannot be targeted. */
  readonly minRange: number;
  /** Tiles; 0 = single target. */
  readonly splashRadius: number;
  /** Fraction 0..1 of speed removed. */
  readonly slow: number;
  readonly slowDuration: number;
  /** Simultaneous targets (Stasis L3 beam fork = 3). */
  readonly beamTargets: number;
  /** Projectiles per salvo. Missiles all chase one target; shells spread over the next-best targets. */
  readonly shots: number;
  /** Seconds between projectiles within a salvo. */
  readonly salvoInterval: number;
  /** Extra chain jumps after the primary target. */
  readonly chainTargets: number;
  /** Execute non-boss unshielded targets at or below this fraction of max HP. */
  readonly executeThreshold: number;
  /** Multiplier on damage dealt to shields. */
  readonly shieldMult: number;
  /** Tiles/s; 0 for instant deliveries. */
  readonly projectileSpeed: number;
}

export interface TowerDef {
  readonly id: TowerId;
  readonly name: string;
  readonly description: string;
  /** Keyboard key that selects this tower for building. */
  readonly hotkey: string;
  readonly damageType: DamageType;
  readonly delivery: Delivery;
  readonly defaultTargeting: TargetingMode;
  /** Prefer targets that are not slowed and not slow-immune (Stasis). */
  readonly prefersUnslowed: boolean;
  /** [L1, L2, L3]: base plus two upgrades. */
  readonly levels: readonly [TowerLevel, TowerLevel, TowerLevel];
}

export type EnemyAbility =
  /** +hpPerSecond, capped at max HP, always on. */
  | { readonly kind: 'regen'; readonly hpPerSecond: number }
  /** On death spawn `count` of `spawn`, spread up to `spread` tiles back along the path. */
  | { readonly kind: 'broodBurst'; readonly spawn: EnemyId; readonly count: number; readonly spread: number }
  /** Every `interval` s spawn `count` of `spawn`, `offset` tiles behind on the path. */
  | {
      readonly kind: 'birthing';
      readonly spawn: EnemyId;
      readonly count: number;
      readonly interval: number;
      readonly offset: number;
    }
  /** Shields regen `perSecond` after `delay` s without taking damage. */
  | { readonly kind: 'shieldReboot'; readonly delay: number; readonly perSecond: number }
  /** Heals other enemies within `radius` (HP only); does not stack, strongest heal wins. */
  | { readonly kind: 'repairField'; readonly radius: number; readonly hpPerSecond: number }
  /** Ignores slow effects. */
  | { readonly kind: 'slowImmune' };

export interface EnemyDef {
  readonly id: EnemyId;
  readonly name: string;
  readonly faction: Faction;
  readonly size: SizeClass;
  readonly isBoss: boolean;
  readonly hp: number;
  readonly armor: number;
  /** 0 for unshielded. Only Remnant have shields. */
  readonly shield: number;
  /** Tiles/s. */
  readonly speed: number;
  /** Lives lost on leak. */
  readonly lives: number;
  /** Credits on kill (Normal difficulty). */
  readonly bounty: number;
  readonly ability: EnemyAbility | null;
}

export type Tile = 'ground' | 'path' | 'build' | 'spawn' | 'core' | 'decor';

/** [col, row]; waypoints are tile centers. */
export type Waypoint = readonly [col: number, row: number];
export type Path = readonly Waypoint[];

export interface WaveGroup {
  readonly enemyId: EnemyId;
  readonly count: number;
  /** Seconds between spawns within the group. */
  readonly interval: number;
  /** Seconds from wave start to this group's first spawn. */
  readonly delay: number;
  /** Index into MapDef.paths. */
  readonly pathIndex: number;
}

export interface WaveDef {
  /**
   * 'mid': bosses here use MID_BOSS_* values. 'final': full-strength bosses; the Campaign's last wave, and in custom
   * runs (GDD §15) also milestone/heavy-phase boss waves and the finale, so "last wave" means index waveCount - 1,
   * not this flag. Boss waves pay BOSS_WAVE_CLEAR_MULT.
   */
  readonly boss: 'mid' | 'final' | null;
  readonly groups: readonly WaveGroup[];
}

// 'frost' and 'marsh' are specified in docs/design/maps.md (§4–§5); add them together with their render/ui cases
// (build.ts style(), textures.ts branches, thumbnail.ts SPECK), which are exhaustive over this union.
export type Biome = 'badlands' | 'volcanic' | 'crystal';

/** Tile colors from maps.md, lighting from art-direction.md. Hex strings. */
export interface MapPalette {
  readonly ground: string;
  readonly groundAlt: string;
  readonly path: string;
  readonly buildPad: string;
  readonly decor: string;
  readonly accent: string;
  readonly core: string;
  readonly cliff: string;
  readonly keyLight: string;
  readonly hemiSky: string;
  readonly hemiGround: string;
  readonly void: string;
}

export interface MapDef {
  readonly id: MapId;
  readonly name: string;
  readonly biome: Biome;
  /** 1 = easiest. */
  readonly tier: number;
  readonly briefing: string;
  readonly palette: MapPalette;
  readonly cols: number;
  readonly rows: number;
  /** ASCII source, kept verbatim from maps.md. */
  readonly layout: string;
  /** Parsed layout, indexed tiles[row][col]. */
  readonly tiles: readonly (readonly Tile[])[];
  /** Each path runs spawn -> core. */
  readonly paths: readonly Path[];
  /** Campaign waves. A run's actual list is buildWaves(map, waveCount) (src/data/waves.ts). */
  readonly waves: readonly WaveDef[];
  /**
   * Enemies that generated custom waves (GDD §15) may use, bosses included. Default: every enemy in `waves`.
   * Set it only to add enemies the Campaign doesn't field (Dust Ridge adds anvil_tread for the heavy phase).
   */
  readonly roster?: readonly EnemyId[];
  /** Path indices that generated heavy and boss groups may use. Default: all (Ossuary Deep keeps its sally port light). */
  readonly heavyPaths?: readonly number[];
  /** Per-wave HP/shield growth base g_map (difficulty adds growthAdd). */
  readonly hpGrowth: number;
  /** Normal difficulty; scaled by DifficultyDef.startCashMult. */
  readonly startingCash: number;
}

export interface DifficultyDef {
  readonly id: DifficultyId;
  readonly name: string;
  readonly hpMult: number;
  /** Added to MapDef.hpGrowth. */
  readonly growthAdd: number;
  readonly speedMult: number;
  readonly armorAdd: number;
  /** Bounty, wave-clear and early-call bonus. */
  readonly cashMult: number;
  readonly startCashMult: number;
  readonly lives: number;
}

// ---- Command powers (GDD §14): free, infinite, gated only by charge time ----

export type PowerId = 'tremor_mines' | 'lance_strike';

interface PowerBase {
  readonly id: PowerId;
  readonly name: string;
  readonly description: string;
  /** Keyboard key that arms the power's targeting mode. */
  readonly hotkey: string;
  /** Sim seconds to gain one charge. Charging starts when wave 1 launches and holds while charges are full. */
  readonly chargeTime: number;
  /** Charges that can be stored. */
  readonly maxCharges: number;
}

/** Plants one mine on a free path tile; the first enemy to touch it opens a slow field. */
export interface MinePowerDef extends PowerBase {
  readonly kind: 'mine';
  /** Tiles, mine center to enemy center. Any enemy triggers it (slow-immune ones too). */
  readonly triggerRadius: number;
  /** Tiles, around the mine's tile center. */
  readonly fieldRadius: number;
  /** Seconds the field lasts after triggering. */
  readonly fieldDuration: number;
  /** Fraction 0..1 of speed removed; same rules as tower slow (strongest wins, bosses x BOSS_SLOW_FACTOR). */
  readonly slow: number;
  /** Slow duration (re)applied every step inside the field, so it lingers this long after leaving. */
  readonly slowLinger: number;
}

/** Orbital beam on a tile: telegraph, then `pulses` damage pulses over everything within `radius`. */
export interface StrikePowerDef extends PowerBase {
  readonly kind: 'strike';
  /** Tiles, around the target tile center. */
  readonly radius: number;
  /** Seconds from use to the first pulse (reticle on the ground, no damage). */
  readonly telegraph: number;
  readonly pulses: number;
  /** Seconds between pulses; the first fires at impact, the beam lasts pulses x pulseInterval. */
  readonly pulseInterval: number;
  /** Per pulse per enemy, before scaling by MapDef.hpGrowth^waveIndex (0-based, min 0). */
  readonly pulseDamage: number;
  readonly damageType: DamageType;
  readonly shieldMult: number;
  /** Bosses instead take this fraction of (maxHp + maxShield) per full strike, split evenly over pulses. */
  readonly bossFraction: number;
}

export type PowerDef = MinePowerDef | StrikePowerDef;
