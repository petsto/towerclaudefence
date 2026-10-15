import type { MapDef, WaveDef } from '../types';
import { g, parseLayout } from './util';

// Verbatim from docs/design/maps.md.
const layout = `
xBBBBBBBBBBBBBBBBBBB.xxx
......................BB
S####################.BB
....................#.BB
xB..xBBBBBBxBBBBBBx.#.BB
BB..................#.BB
BB.##################.BB
BB.#..................BB
BB.#.xBBBBBBxBBBBBx.....
BB.#....................
...##################...
xx..................#...
.BBBBBBBBBBBBBBBBB..#...
....................###C
..xxx.....xxx...x.......
..xxx.....xxx......xx.BB
`;

// Wave comments: base pool = HP+shields at Normal before growth (mid boss at x0.5); curve = wave-1 pool x (1 + 0.25(w-1)).
// Single path. Mostly Chorus; Spindle Drones from wave 4, Rivet Walkers from wave 10.
const dustRidgeWaves: readonly WaveDef[] = [
  // W1: base pool 450 (curve 450)
  { boss: null, groups: [
    g('skitterling', 10, 0.4, 0, 0),
  ] },
  // W2: base pool 540 (curve 563)
  { boss: null, groups: [
    g('skitterling', 12, 0.4, 0, 0),
  ] },
  // W3: base pool 710 (curve 675)
  { boss: null, groups: [
    g('skitterling', 6, 0.4, 0, 0),
    g('husk_crawler', 2, 0.9, 5, 0),
  ] },
  // W4: base pool 750 (curve 788)
  { boss: null, groups: [
    g('skitterling', 10, 0.4, 0, 0),
    g('spindle_drone', 6, 0.4, 6.6, 0),
  ] },
  // W5: base pool 930 (curve 900)
  { boss: null, groups: [
    g('skitterling', 6, 0.4, 0, 0),
    g('husk_crawler', 3, 0.9, 5, 0),
  ] },
  // W6: base pool 1155 (curve 1013)
  { boss: null, groups: [
    g('skitterling', 6, 0.4, 0, 0),
    g('brood_carrier', 1, 1.8, 5, 0),
  ] },
  // W7: base pool 1160 (curve 1125)
  { boss: null, groups: [
    g('skitterling', 16, 0.4, 0, 0),
    g('husk_crawler', 2, 0.9, 9, 0),
  ] },
  // W8: base pool 3250 (curve 1238)
  { boss: 'mid', groups: [
    g('skitterling', 10, 0.4, 0, 0),
    g('choir_mother', 1, 0, 6.6, 0),
    g('spindle_drone', 6, 0.4, 9.6, 0),
  ] },
  // W9: base pool 1280 (curve 1350)
  { boss: null, groups: [
    g('husk_crawler', 4, 0.9, 0, 0),
    g('spindle_drone', 8, 0.4, 5.7, 0),
  ] },
  // W10: base pool 1420 (curve 1463)
  { boss: null, groups: [
    g('skitterling', 12, 0.4, 0, 0),
    g('rivet_walker', 3, 0.9, 7.4, 0),
    g('husk_crawler', 1, 0.9, 12.2, 0),
  ] },
  // W11: base pool 1545 (curve 1575)
  { boss: null, groups: [
    g('husk_crawler', 3, 0.9, 0, 0),
    g('brood_carrier', 1, 1.8, 4.8, 0),
  ] },
  // W12: base pool 1720 (curve 1688)
  { boss: null, groups: [
    g('skitterling', 24, 0.3, 0, 0),
    g('spindle_drone', 4, 0.4, 9.9, 0),
    g('rivet_walker', 2, 0.9, 14.1, 0),
  ] },
  // W13: base pool 1770 (curve 1800)
  { boss: null, groups: [
    g('husk_crawler', 6, 1.5, 0, 0),
    g('skitterling', 10, 0.4, 10.5, 0),
  ] },
  // W14: base pool 2430 (curve 1913); ramps into the final
  { boss: null, groups: [
    g('brood_carrier', 2, 1.8, 0, 0),
    g('skitterling', 6, 0.4, 4.8, 0),
    g('husk_crawler', 3, 0.9, 9, 0),
  ] },
  // W15: base pool 4200 (curve 2025)
  { boss: 'final', groups: [
    g('skitterling', 12, 0.4, 0, 0),
    g('husk_crawler', 3, 0.9, 7.4, 0),
    g('choir_mother', 1, 0, 12.2, 0),
  ] },
];

export const dustRidgeOutpost: MapDef = {
  id: 'dust-ridge-outpost',
  name: 'Dust Ridge Outpost',
  biome: 'badlands',
  tier: 1,
  briefing:
    'Commander, the mining outpost on Dust Ridge has gone dark and hostile signatures are crossing the eastern flats. Hold the switchback road until the evacuation shuttles clear the core.',
  palette: {
    ground: '#8A5A2B',
    groundAlt: '#A86E36',
    path: '#C9A56B',
    buildPad: '#5F6B73',
    decor: '#4A3420',
    accent: '#E0B04A',
    core: '#4FC3F7',
    cliff: '#5c4330',
    keyLight: '#ffe2b8',
    hemiSky: '#c9b08a',
    hemiGround: '#3a2a1c',
    void: '#140e09',
  },
  cols: 24,
  rows: 16,
  layout,
  tiles: parseLayout(layout),
  paths: [
    [[0, 2], [20, 2], [20, 6], [3, 6], [3, 10], [20, 10], [20, 13], [23, 13]],
  ],
  waves: dustRidgeWaves,
  hpGrowth: 1.06,
  startingCash: 600,
};
