import type { MapDef, WaveDef } from '../types';
import { g, parseLayout } from './util';

// Verbatim from docs/design/maps.md.
const layout = `
xxx..S..xxxxx....xxx
xxx..#..xxxxx....xxx
xxx..#..xxxxx.......
.....#.........####S
.....#BB.....x.#....
xx...#BB.....x.#B...
xx...#######...#B...
xx.BB....BB#BB.#.xxx
...BB....BB#BB.#.xxx
..##############.xxx
..#...BB.........xxx
..#...BB.xxxxxxx.xxx
..C.x....xxxxxxx.xxx
xx..x....xxxxx...xxx
`;

// Wave comments: base pool = HP+shields at Normal before growth (mid boss at x0.5); curve = wave-1 pool x (1 + 0.25(w-1)).
// Path 0 = north, 1 = east (fast units). Both breaches from wave 1. Full roster, both bosses.
const hollowSpireWaves: readonly WaveDef[] = [
  // W1: base pool 570 (curve 550)
  { boss: null, groups: [
    g('skitterling', 6, 0.4, 0, 0),
    g('spindle_drone', 6, 0.4, 0, 1),
  ] },
  // W2: base pool 660 (curve 688)
  { boss: null, groups: [
    g('skitterling', 8, 0.4, 0, 0),
    g('spindle_drone', 6, 0.4, 0, 1),
  ] },
  // W3: base pool 760 (curve 825)
  { boss: null, groups: [
    g('husk_crawler', 1, 0.9, 0, 0),
    g('skitterling', 6, 0.4, 3, 0),
    g('spindle_drone', 8, 0.4, 0, 1),
  ] },
  // W4: base pool 1010 (curve 963)
  { boss: null, groups: [
    g('husk_crawler', 2, 0.9, 0, 0),
    g('spindle_drone', 6, 0.4, 0, 1),
    g('skitterling', 6, 0.4, 3.9, 0),
  ] },
  // W5: base pool 1120 (curve 1100)
  { boss: null, groups: [
    g('skitterling', 8, 0.4, 0, 0),
    g('rivet_walker', 3, 0.9, 0, 1),
    g('spindle_drone', 2, 0.4, 4.8, 1),
  ] },
  // W6: base pool 1180 (curve 1238)
  { boss: null, groups: [
    g('husk_crawler', 3, 0.9, 0, 0),
    g('rivet_walker', 1, 0.9, 0, 1),
    g('spindle_drone', 6, 0.4, 3, 1),
  ] },
  // W7: base pool 1385 (curve 1375)
  { boss: null, groups: [
    g('brood_carrier', 1, 1.8, 0, 0),
    g('spindle_drone', 10, 0.4, 0, 1),
  ] },
  // W8: base pool 1580 (curve 1513)
  { boss: null, groups: [
    g('skitterling', 16, 0.3, 0, 0),
    g('rivet_walker', 2, 0.9, 0, 1),
    g('spindle_drone', 4, 0.4, 3.9, 1),
    g('husk_crawler', 1, 0.9, 7.5, 0),
  ] },
  // W9: base pool 1680 (curve 1650)
  { boss: null, groups: [
    g('husk_crawler', 3, 0.9, 0, 0),
    g('rivet_walker', 3, 0.9, 0, 1),
    g('mender_unit', 1, 0.9, 4.8, 1),
    g('spindle_drone', 4, 0.4, 7.8, 1),
  ] },
  // W10: base pool 3940 (curve 1788)
  { boss: 'mid', groups: [
    g('skitterling', 12, 0.4, 0, 0),
    g('spindle_drone', 8, 0.4, 0, 1),
    g('foundry_colossus', 1, 0, 7.4, 0),
  ] },
  // W11: base pool 2070 (curve 1925)
  { boss: null, groups: [
    g('brood_carrier', 2, 1.8, 0, 0),
    g('spindle_drone', 6, 0.4, 0, 1),
  ] },
  // W12: base pool 2070 (curve 2063)
  { boss: null, groups: [
    g('anvil_tread', 1, 1.8, 0, 0),
    g('rivet_walker', 3, 0.9, 0, 1),
    g('mender_unit', 1, 0.9, 3, 0),
    g('spindle_drone', 4, 0.4, 4.8, 1),
  ] },
  // W13: base pool 2120 (curve 2200)
  { boss: null, groups: [
    g('husk_crawler', 4, 0.9, 0, 0),
    g('rivet_walker', 4, 0.9, 0, 1),
    g('skitterling', 8, 0.4, 5.7, 0),
  ] },
  // W14: base pool 2360 (curve 2338)
  { boss: null, groups: [
    g('anvil_tread', 1, 1.8, 0, 0),
    g('spindle_drone', 2, 0.4, 0, 1),
    g('mender_unit', 1, 0.9, 3, 0),
    g('anvil_tread', 1, 1.8, 6, 0),
  ] },
  // W15: base pool 2520 (curve 2475)
  { boss: null, groups: [
    g('brood_carrier', 2, 1.8, 0, 0),
    g('spindle_drone', 6, 0.4, 0, 1),
    g('skitterling', 10, 0.4, 4.8, 0),
  ] },
  // W16: base pool 2600 (curve 2613)
  { boss: null, groups: [
    g('anvil_tread', 2, 1.8, 0, 0),
    g('spindle_drone', 10, 0.4, 0, 1),
  ] },
  // W17: base pool 2720 (curve 2750)
  { boss: null, groups: [
    g('skitterling', 24, 0.3, 0, 0),
    g('spindle_drone', 24, 0.3, 0, 1),
    g('husk_crawler', 2, 0.9, 9.9, 0),
  ] },
  // W18: base pool 2790 (curve 2888)
  { boss: null, groups: [
    g('brood_carrier', 2, 1.8, 0, 0),
    g('rivet_walker', 3, 0.9, 0, 1),
    g('mender_unit', 1, 0.9, 4.8, 1),
    g('spindle_drone', 4, 0.4, 7.8, 1),
  ] },
  // W19: base pool 3580 (curve 3025); ramps into the final
  { boss: null, groups: [
    g('anvil_tread', 2, 1.8, 0, 0),
    g('rivet_walker', 6, 0.9, 0, 1),
    g('mender_unit', 1, 0.9, 4.8, 0),
  ] },
  // W20: base pool 8130 (curve 3163)
  { boss: 'final', groups: [
    g('skitterling', 10, 0.4, 0, 0),
    g('spindle_drone', 6, 0.4, 0, 1),
    g('choir_mother', 1, 0, 6.6, 0),
    g('foundry_colossus', 1, 0, 6.6, 1),
    g('husk_crawler', 2, 0.9, 9.6, 0),
    g('rivet_walker', 2, 0.9, 9.6, 1),
  ] },
];

export const hollowSpire: MapDef = {
  id: 'hollow-spire',
  name: 'Hollow Spire',
  biome: 'crystal',
  tier: 3,
  briefing:
    'Creep has swallowed the research station and the hive is pushing through two breaches at once. Every pad we have left is under the spires — make each one count.',
  palette: {
    ground: '#2A1F3D',
    groundAlt: '#5B2A5E',
    path: '#7A4A8C',
    buildPad: '#3E5566',
    decor: '#48E5C2',
    accent: '#C0FF3E',
    core: '#FF4F6D',
    cliff: '#3a2a50',
    keyLight: '#e8d8ff',
    hemiSky: '#9a7ac0',
    hemiGround: '#1a1024',
    void: '#07040c',
  },
  cols: 20,
  rows: 14,
  layout,
  tiles: parseLayout(layout),
  paths: [
    [[5, 0], [5, 6], [11, 6], [11, 9], [2, 9], [2, 12]],
    [[19, 3], [15, 3], [15, 9], [11, 9], [2, 9], [2, 12]],
  ],
  waves: hollowSpireWaves,
  hpGrowth: 1.08,
  startingCash: 700,
};
