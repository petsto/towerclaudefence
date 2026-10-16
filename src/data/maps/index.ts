import type { MapDef, MapId } from '../types';
import { blackwaterSluice } from './blackwater-sluice';
import { cinderForge } from './cinder-forge';
import { dustRidgeOutpost } from './dust-ridge-outpost';
import { hollowSpire } from './hollow-spire';
import { ossuaryDeep } from './ossuary-deep';
import { whiteoutRelay } from './whiteout-relay';

export const MAPS: Readonly<Record<MapId, MapDef>> = {
  'dust-ridge-outpost': dustRidgeOutpost,
  'whiteout-relay': whiteoutRelay,
  'cinder-forge': cinderForge,
  'blackwater-sluice': blackwaterSluice,
  'hollow-spire': hollowSpire,
  'ossuary-deep': ossuaryDeep,
};

/** Home-screen order (tier ascending). */
export const MAP_LIST: readonly MapDef[] = [dustRidgeOutpost, whiteoutRelay, cinderForge, blackwaterSluice, hollowSpire, ossuaryDeep];
