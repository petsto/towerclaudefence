import type { EnemyDef, EnemyId } from './types';

// Bounties are enemies.md values x4 (systems.md §5.2).
export const ENEMIES: Readonly<Record<EnemyId, EnemyDef>> = {
  skitterling: {
    id: 'skitterling', name: 'Skitterling', faction: 'chorus', size: 'light', isBoss: false,
    hp: 45, armor: 0, shield: 0, speed: 2, lives: 1, bounty: 4, ability: null,
  },
  husk_crawler: {
    id: 'husk_crawler', name: 'Husk Crawler', faction: 'chorus', size: 'medium', isBoss: false,
    hp: 220, armor: 1, shield: 0, speed: 1.2, lives: 2, bounty: 16,
    ability: { kind: 'regen', hpPerSecond: 4 },
  },
  brood_carrier: {
    id: 'brood_carrier', name: 'Brood Carrier', faction: 'chorus', size: 'heavy', isBoss: false,
    hp: 750, armor: 2, shield: 0, speed: 0.7, lives: 5, bounty: 48,
    ability: { kind: 'broodBurst', spawn: 'skitterling', count: 3, spread: 0.2 },
  },
  choir_mother: {
    id: 'choir_mother', name: 'Choir Mother', faction: 'chorus', size: 'heavy', isBoss: true,
    hp: 3000, armor: 3, shield: 0, speed: 0.5, lives: 20, bounty: 400,
    ability: { kind: 'birthing', spawn: 'skitterling', count: 2, interval: 10, offset: 0.3 },
  },
  spindle_drone: {
    id: 'spindle_drone', name: 'Spindle Drone', faction: 'remnant', size: 'light', isBoss: false,
    hp: 35, armor: 1, shield: 15, speed: 2.2, lives: 1, bounty: 8, ability: null,
  },
  rivet_walker: {
    id: 'rivet_walker', name: 'Rivet Walker', faction: 'remnant', size: 'medium', isBoss: false,
    hp: 160, armor: 2, shield: 60, speed: 1, lives: 2, bounty: 20,
    ability: { kind: 'shieldReboot', delay: 2.5, perSecond: 15 },
  },
  mender_unit: {
    id: 'mender_unit', name: 'Mender Unit', faction: 'remnant', size: 'medium', isBoss: false,
    hp: 120, armor: 1, shield: 40, speed: 1.3, lives: 2, bounty: 24,
    ability: { kind: 'repairField', radius: 2, hpPerSecond: 6 },
  },
  anvil_tread: {
    id: 'anvil_tread', name: 'Anvil Tread', faction: 'remnant', size: 'heavy', isBoss: false,
    hp: 900, armor: 4, shield: 150, speed: 0.55, lives: 5, bounty: 56,
    ability: { kind: 'slowImmune' },
  },
  foundry_colossus: {
    id: 'foundry_colossus', name: 'Foundry Colossus', faction: 'remnant', size: 'heavy', isBoss: true,
    hp: 2600, armor: 4, shield: 900, speed: 0.45, lives: 20, bounty: 400,
    ability: { kind: 'shieldReboot', delay: 4, perSecond: 60 },
  },
};
