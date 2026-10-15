import type { DamageType, SizeClass } from './types';

/** HP damage multiplier by damage type x target size. Never applied to shields. */
export const SIZE_MULT: Readonly<Record<DamageType, Readonly<Record<SizeClass, number>>>> = {
  normal: { light: 1, medium: 1, heavy: 1 },
  concussive: { light: 1, medium: 0.5, heavy: 0.25 },
  explosive: { light: 0.5, medium: 0.75, heavy: 1 },
  plasma: { light: 1, medium: 1, heavy: 1 },
};

/** Plasma ignores armor. Shield multiplier lives on TowerLevel.shieldMult. */
export const IGNORES_ARMOR: Readonly<Record<DamageType, boolean>> = {
  normal: false,
  concussive: false,
  explosive: false,
  plasma: true,
};

/** Minimum HP damage per hit once damage reaches HP: max(ARMOR_FLOOR, (d - armor) * sizeMult). */
export const ARMOR_FLOOR = 0.5;

/** Splash: 100% within SPLASH_INNER * R, SPLASH_OUTER_MULT from there to R. Primary always 100%. */
export const SPLASH_INNER = 0.5;
export const SPLASH_OUTER_MULT = 0.5;
/** Extra shells with no other target land this many tiles off the primary (evenly spaced around it). */
export const SHELL_SCATTER = 0.4;

/** Chain: jump to nearest unhit enemy within CHAIN_JUMP_RANGE tiles; each jump x CHAIN_FALLOFF. */
export const CHAIN_JUMP_RANGE = 2;
export const CHAIN_FALLOFF = 0.75;

/** Bosses take this fraction of a slow's strength. */
export const BOSS_SLOW_FACTOR = 0.5;
