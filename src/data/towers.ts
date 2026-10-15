import type { TowerDef, TowerId, TowerLevel } from './types';

const NONE: Omit<TowerLevel, 'cost' | 'damage' | 'cooldown' | 'range'> = {
  minRange: 0,
  splashRadius: 0,
  slow: 0,
  slowDuration: 0,
  beamTargets: 1,
  shots: 1,
  salvoInterval: 0,
  chainTargets: 0,
  executeThreshold: 0,
  shieldMult: 1,
  projectileSpeed: 0,
};

// Each level spreads the previous one, so the diff reads like the GDD upgrade table.
const picket1: TowerLevel = { ...NONE, cost: 100, damage: 6, cooldown: 0.4, range: 3.5 };
const picket2: TowerLevel = { ...picket1, cost: 75, damage: 7, cooldown: 0.33 };
const picket3: TowerLevel = { ...picket2, cost: 125, damage: 9, cooldown: 0.27, range: 4 };

const thumper1: TowerLevel = {
  ...NONE,
  cost: 150,
  damage: 20,
  cooldown: 1.7,
  range: 4.5,
  minRange: 1,
  splashRadius: 1.25,
  projectileSpeed: 5,
};
const thumper2: TowerLevel = { ...thumper1, cost: 110, damage: 16, splashRadius: 1.5, shots: 2, salvoInterval: 0.15 };
const thumper3: TowerLevel = { ...thumper2, cost: 190, damage: 16, cooldown: 1.5, shots: 3 };

const stasis1: TowerLevel = { ...NONE, cost: 120, damage: 4, cooldown: 1, range: 3, slow: 0.35, slowDuration: 2 };
const stasis2: TowerLevel = { ...stasis1, cost: 90, slow: 0.45, slowDuration: 2.5, range: 3.5 };
const stasis3: TowerLevel = { ...stasis2, cost: 150, slow: 0.5, damage: 8, beamTargets: 3 };

const longshot1: TowerLevel = { ...NONE, cost: 225, damage: 40, cooldown: 2.5, range: 5.5, executeThreshold: 0.1 };
const longshot2: TowerLevel = { ...longshot1, cost: 130, damage: 70, range: 6 };
const longshot3: TowerLevel = { ...longshot2, cost: 220, damage: 105, cooldown: 2.4, executeThreshold: 0.15 };

const breacher1: TowerLevel = {
  ...NONE,
  cost: 200,
  damage: 35,
  cooldown: 2,
  range: 4.5,
  shots: 2,
  salvoInterval: 0.15,
  projectileSpeed: 7,
};
const breacher2: TowerLevel = { ...breacher1, cost: 150, damage: 50 };
const breacher3: TowerLevel = { ...breacher2, cost: 250, shots: 3, cooldown: 1.8, range: 5 };

const arc1: TowerLevel = { ...NONE, cost: 160, damage: 14, cooldown: 1.25, range: 3.5, chainTargets: 3, shieldMult: 1.5 };
const arc2: TowerLevel = { ...arc1, cost: 120, damage: 20, chainTargets: 4 };
const arc3: TowerLevel = { ...arc2, cost: 200, damage: 26, cooldown: 1, shieldMult: 2 };

export const TOWERS: Readonly<Record<TowerId, TowerDef>> = {
  picket: {
    id: 'picket',
    name: 'Picket Autocannon',
    description: "Bolted-down twin autocannon; the corps' first answer to anything soft.",
    hotkey: '1',
    damageType: 'normal',
    delivery: 'hitscan',
    defaultTargeting: 'first',
    prefersUnslowed: false,
    levels: [picket1, picket2, picket3],
  },
  thumper: {
    id: 'thumper',
    name: 'Thumper Mortar',
    description: 'Lobs concussion shells that turn swarms into paste.',
    hotkey: '2',
    damageType: 'concussive',
    delivery: 'shell',
    defaultTargeting: 'first',
    prefersUnslowed: false,
    levels: [thumper1, thumper2, thumper3],
  },
  stasis: {
    id: 'stasis',
    name: 'Stasis Projector',
    description: 'Cryo-field beam that drags anything to a crawl.',
    hotkey: '3',
    damageType: 'concussive',
    delivery: 'beam',
    defaultTargeting: 'first',
    prefersUnslowed: true,
    levels: [stasis1, stasis2, stasis3],
  },
  longshot: {
    id: 'longshot',
    name: 'Longshot Railgun',
    description: 'Mag-rail marksman post on a tall gantry; one shot, one problem solved.',
    hotkey: '4',
    damageType: 'normal',
    delivery: 'hitscan',
    defaultTargeting: 'strongest',
    prefersUnslowed: false,
    levels: [longshot1, longshot2, longshot3],
  },
  breacher: {
    id: 'breacher',
    name: 'Breacher Missile Pod',
    description: 'Armor-cracking warheads for things with treads or plates.',
    hotkey: '5',
    damageType: 'explosive',
    delivery: 'missile',
    defaultTargeting: 'strongest',
    prefersUnslowed: false,
    levels: [breacher1, breacher2, breacher3],
  },
  arc_coil: {
    id: 'arc_coil',
    name: 'Arc Coil',
    description: 'Overcharged capacitor stack that arcs plasma through packed ranks.',
    hotkey: '6',
    damageType: 'plasma',
    delivery: 'chain',
    defaultTargeting: 'first',
    prefersUnslowed: false,
    levels: [arc1, arc2, arc3],
  },
};

/** Command-card order. */
export const TOWER_LIST: readonly TowerDef[] = [
  TOWERS.picket,
  TOWERS.thumper,
  TOWERS.stasis,
  TOWERS.longshot,
  TOWERS.breacher,
  TOWERS.arc_coil,
];
