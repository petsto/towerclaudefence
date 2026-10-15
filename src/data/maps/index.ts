import type { MapDef, MapId } from '../types';
import { cinderForge } from './cinder-forge';
import { dustRidgeOutpost } from './dust-ridge-outpost';
import { hollowSpire } from './hollow-spire';

export const MAPS: Readonly<Record<MapId, MapDef>> = {
  'dust-ridge-outpost': dustRidgeOutpost,
  'cinder-forge': cinderForge,
  'hollow-spire': hollowSpire,
};

/** Home-screen order (tier ascending). */
export const MAP_LIST: readonly MapDef[] = [dustRidgeOutpost, cinderForge, hollowSpire];
