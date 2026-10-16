import type { MapDef, WaveDef } from '../types';
import { g, parseLayout } from './util';

// Verbatim from docs/design/maps.md.
const layout = `
..............xx....xxxx
S###########........xxxx
...........#.........xxx
.....BBBBB.#.BBBB....xxx
xx..###############.....
xx..#.............#.....
..B.#....BBBBB....#.B...
..B.#.BB..xxx..BB.#.B...
..B.#.BB..xxx..BB.#.B...
..B.#....BBBBB....#.B...
....#.............#.....
....###############.....
.....BBBBB.#........BBB.
xxx........#.BBBBB......
xxx........############C
xxx...xxx.......xx......
`;

// Wave comments: base pool = HP+shields at Normal before growth (mid boss at x0.55); curve = wave-1 pool x (1 + 0.25(w-1)).
// Path 0 = west branch, 1 = east branch (one spawn, fork at [11,4], rejoin at [11,11]).
const whiteoutRelayWaves: readonly WaveDef[] = [
  // W1: base pool 570 (curve 570)
  { boss: null, groups: [
    g('spindle_drone', 6, 0.4, 0, 0),
    g('skitterling', 6, 0.4, 0, 1),
  ] },
  // W2: base pool 720 (curve 713)
  { boss: null, groups: [
    g('skitterling', 16, 0.3, 0, 1),
  ] },
  // W3: base pool 840 (curve 855)
  { boss: null, groups: [
    g('spindle_drone', 8, 0.4, 0, 0),
    g('husk_crawler', 2, 0.9, 0, 1),
  ] },
  // W4: base pool 980 (curve 998)
  { boss: null, groups: [
    g('rivet_walker', 2, 0.9, 0, 0),
    g('skitterling', 12, 0.4, 0, 1),
  ] },
  // W5: base pool 1140 (curve 1140)
  { boss: null, groups: [
    g('husk_crawler', 3, 0.9, 0, 1),
    g('spindle_drone', 6, 0.4, 0, 0),
    g('skitterling', 4, 0.4, 4.8, 1),
  ] },
  // W6: base pool 1280 (curve 1283)
  { boss: null, groups: [
    g('rivet_walker', 4, 0.9, 0, 0),
    g('spindle_drone', 8, 0.4, 0, 1),
  ] },
  // W7: base pool 1480 (curve 1425)
  { boss: null, groups: [
    g('mender_unit', 1, 0.9, 0, 0),
    g('rivet_walker', 3, 0.9, 3, 0),
    g('husk_crawler', 3, 0.9, 0, 1),
  ] },
  // W8: base pool 1700 (curve 1568)
  { boss: null, groups: [
    g('skitterling', 14, 0.4, 0, 0),
    g('skitterling', 14, 0.4, 0, 1),
    g('rivet_walker', 2, 0.9, 8.2, 1),
  ] },
  // W9: base pool 3025 (curve 1710) mid
  { boss: 'mid', groups: [
    g('spindle_drone', 6, 0.4, 0, 0),
    g('skitterling', 8, 0.4, 0, 1),
    g('foundry_colossus', 1, 0, 5, 0),
    g('rivet_walker', 2, 0.9, 8, 0),
  ] },
  // W10: base pool 1800 (curve 1853)
  { boss: null, groups: [
    g('husk_crawler', 5, 0.9, 0, 0),
    g('spindle_drone', 14, 0.4, 0, 1),
  ] },
  // W11: base pool 1925 (curve 1995)
  { boss: null, groups: [
    g('brood_carrier', 1, 1.8, 0, 1),
    g('rivet_walker', 4, 0.9, 0, 0),
    g('mender_unit', 1, 0.9, 5.7, 0),
  ] },
  // W12: base pool 2160 (curve 2138)
  { boss: null, groups: [
    g('rivet_walker', 4, 0.9, 0, 0),
    g('rivet_walker', 4, 0.9, 0, 1),
    g('spindle_drone', 8, 0.4, 5.7, 0),
  ] },
  // W13: base pool 2330 (curve 2280)
  { boss: null, groups: [
    g('anvil_tread', 1, 1.8, 0, 0),
    g('spindle_drone', 8, 0.4, 0, 1),
    g('husk_crawler', 4, 0.9, 5.8, 1),
  ] },
  // W14: base pool 2380 (curve 2423)
  { boss: null, groups: [
    g('skitterling', 20, 0.3, 0, 0),
    g('husk_crawler', 6, 0.9, 0, 1),
    g('mender_unit', 1, 0.9, 7.5, 1),
  ] },
  // W15: base pool 2535 (curve 2565)
  { boss: null, groups: [
    g('anvil_tread', 1, 1.8, 0, 1),
    g('brood_carrier', 1, 1.8, 0, 0),
    g('spindle_drone', 12, 0.4, 3, 0),
  ] },
  // W16: base pool 2800 (curve 2708)
  { boss: null, groups: [
    g('rivet_walker', 6, 0.9, 0, 0),
    g('mender_unit', 1, 0.9, 7.5, 0),
    g('husk_crawler', 6, 0.9, 0, 1),
  ] },
  // W17: base pool 3420 (curve 2850)
  { boss: null, groups: [
    g('anvil_tread', 1, 1.8, 0, 0),
    g('anvil_tread', 1, 1.8, 0, 1),
    g('spindle_drone', 10, 0.4, 3, 0),
    g('mender_unit', 1, 0.9, 3, 1),
    g('rivet_walker', 3, 0.9, 6, 1),
  ] },
  // W18: base pool 5600 (curve 2993) final
  { boss: 'final', groups: [
    g('spindle_drone', 8, 0.4, 0, 0),
    g('rivet_walker', 3, 0.9, 0, 1),
    g('choir_mother', 1, 0, 5.8, 0),
    g('rivet_walker', 3, 0.9, 4.8, 1),
    g('husk_crawler', 4, 0.9, 8.8, 0),
  ] },
];

export const whiteoutRelay: MapDef = {
  id: 'whiteout-relay',
  name: 'Whiteout Relay',
  biome: 'frost',
  tier: 2,
  briefing:
    'The relay on the ice shelf is the last voice this sector has, and a machine column is marching on it through the storm. The road splits around the old antenna field. Cover both lanes or lose the uplink.',
  palette: {
    ground: '#B4BEC6',
    groundAlt: '#95A3AE',
    path: '#6A6862',
    buildPad: '#46525E',
    decor: '#2C3842',
    accent: '#8FD8FF',
    core: '#FFB347',
    cliff: '#5B6D7A',
    keyLight: '#EEF4FF',
    hemiSky: '#C2D2E0',
    hemiGround: '#2B333B',
    void: '#0B0F13',
  },
  cols: 24,
  rows: 16,
  layout,
  tiles: parseLayout(layout),
  paths: [
    [[0, 1], [11, 1], [11, 4], [4, 4], [4, 11], [11, 11], [11, 14], [23, 14]],
    [[0, 1], [11, 1], [11, 4], [18, 4], [18, 11], [11, 11], [11, 14], [23, 14]],
  ],
  waves: whiteoutRelayWaves,
  hpGrowth: 1.07,
  startingCash: 650,
};
