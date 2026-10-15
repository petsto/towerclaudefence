// HD model contract. Units are HD PBR models baked at load into a sprite atlas (./sprites.ts) and drawn as billboards
// over the baked HD terrain. Showroom: /dev/models.html (?unit=<id>&level=<n>).
//
// Coordinates: 1 unit = 1 tile, +Y up, the model faces +X (yaw 0), origin at its feet / footprint centre on the
//   ground. Towers fit the 0.9×0.9 footprint (the standard plinth is 0.88²; barrels may overhang a little) and stand
//   on the build pad; parts added after k.setTurret(true) are relative to (0, pivot, 0) and rotate with yaw.
// Towers: TowerModel(level 1|2|3) => Built. All three levels must build (L2/L3 may be L1 + rankDress for now).
// Enemies: EnemyModel(phase 0..1 of one walk cycle) => Built; baked at phase i/WALK, so phase 0 and 1 must match.
//   Flyers hover by building their body above y = 0 (sprites anchor at the path surface).
// Materials (MatId, one shared material each, ./materials.ts): 'metal' | 'paint' | 'hazard' (PBR hard-surface sets),
//   'chitin' (clearcoat organic), 'glow' (unlit, colour × gain, k.glow). Colour is per part (vertex colour ×
//   texture); pick from C in ./kit.ts or pass any sRGB hex. A new MatId = add it to MatId and makeMaterials.
// Budget: ~5–20k tris per unit is fine (only rendered during the bake). Bake cost is per atlas cell, so keep units
//   compact: cell size follows the model's radius and height (+ shadow), see ./sprites.ts.
// Adding a unit: one file in ./towers/<id>.ts or ./enemies/<id>.ts exporting the model function, built with ./kit.ts
//   (kit, finalize, primitives, plinth/turretRing/rankDress), then register it below. Every TowerId / EnemyId must
//   have a model: the registries are full Records, so typecheck fails until it does.
//
// Atlas budget (RGBA8, no mips, measured in the showroom with ?ppu=): frames = towers 16 turret yaws + 1 base;
//   enemies 8 yaws × 4 walk phases. Cells at 128 px/unit: tower ≈ 210×225 px (≈3.2 MB per tower level), medium
//   enemy ≈ 140×150 (≈2.7 MB), boss ≈ 260×290 (≈9.6 MB). Full roster (18 tower levels + 9 enemies): 100 MB at 128
//   px/unit (8192×3205), 57 MB at 96. Bake ≈ 0.1 s. Bake per map: 18 tower levels + only that map's enemies.
import type { EnemyId, TowerId } from '../../data/types';
import { broodCarrier } from './enemies/brood_carrier';
import { choirMother } from './enemies/choir_mother';
import { anvilTread } from './enemies/anvil_tread';
import { foundryColossus } from './enemies/foundry_colossus';
import { huskCrawler } from './enemies/husk_crawler';
import { menderUnit } from './enemies/mender_unit';
import { rivetWalker } from './enemies/rivet_walker';
import { spindleDrone } from './enemies/spindle_drone';
import { skitterling } from './enemies/skitterling';
import type { Built, Level } from './kit';
import { WALK, type BakeEntry } from './sprites';
import { arcCoil } from './towers/arc_coil';
import { breacher } from './towers/breacher';
import { longshot } from './towers/longshot';
import { picket } from './towers/picket';
import { stasis } from './towers/stasis';
import { thumper } from './towers/thumper';

export type TowerModel = (level: Level) => Built;
export type EnemyModel = (phase: number) => Built;

export const HD_TOWERS: Record<TowerId, TowerModel> = { picket, stasis, longshot, thumper, breacher, arc_coil: arcCoil };
export const HD_ENEMIES: Record<EnemyId, EnemyModel> = { husk_crawler: huskCrawler, rivet_walker: rivetWalker, skitterling, brood_carrier: broodCarrier, choir_mother: choirMother,
  spindle_drone: spindleDrone, mender_unit: menderUnit, anvil_tread: anvilTread, foundry_colossus: foundryColossus };

const cache = new Map<string, Built>();
const cached = (key: string, make: () => Built): Built => {
  let b = cache.get(key);
  if (!b) cache.set(key, (b = make()));
  return b;
};

export const towerKey = (id: TowerId, level: Level): string => `${id}:${level}`;

/** Cached: never dispose the geometry. */
export const towerBuilt = (id: TowerId, level: Level): Built => cached(towerKey(id, level), () => HD_TOWERS[id](level));
export const enemyBuilt = (id: EnemyId, walk: number): Built => cached(`${id}~${walk}`, () => HD_ENEMIES[id](walk / WALK));

/** Atlas entry for one tower level (sprite key = towerKey) / one enemy (sprite key = its id). */
export const towerEntry = (id: TowerId, level: Level): BakeEntry => ({ key: towerKey(id, level), tower: true, builds: [towerBuilt(id, level)] });
export const enemyEntry = (id: EnemyId): BakeEntry => ({
  key: id, tower: false, builds: Array.from({ length: WALK }, (_, w) => enemyBuilt(id, w)),
});

export type { Built, Level, MatId, Part } from './kit';
export { makeMaterials } from './materials';
export * from './sprites';

