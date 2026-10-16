import type { MapDef, WaveDef } from '../types';
import { g, parseLayout } from './util';

// Verbatim from docs/design/maps.md.
const layout = `
xxxx....S......xxxx...xx
........#.BB...xxxx...xx
........#.BB............
........#...........###C
S########...xxx.....#...
.....BB.#BB.xxx.....#.B.
xxx..BB.#BB.xxx.BBB.#.B.
xxx.....#.......BBB.#.B.
xxx.....#...........#.B.
xxx.....#############...
...............#........
...BBBB...BBBB.#.BB.....
...............#.BB..xxx
S###############.....xxx
.....xxx...xxx.......xxx
.....xxx...xxx.......xxx
`;

// Wave comments: base pool = HP+shields at Normal before growth (mid boss at x0.55); curve = wave-1 pool x (1 + 0.25(w-1)).
// Path 0 = west, 1 = north, 2 = south. One inlet per wave W1-6; all three from W13.
const blackwaterSluiceWaves: readonly WaveDef[] = [
  // W1: base pool 540 (curve 540)
  { boss: null, groups: [
    g('skitterling', 12, 0.4, 0, 0),
  ] },
  // W2: base pool 675 (curve 675)
  { boss: null, groups: [
    g('skitterling', 15, 0.4, 0, 1),
  ] },
  // W3: base pool 800 (curve 810)
  { boss: null, groups: [
    g('skitterling', 8, 0.4, 0, 2),
    g('husk_crawler', 2, 0.9, 5.8, 2),
  ] },
  // W4: base pool 935 (curve 945)
  { boss: null, groups: [
    g('husk_crawler', 2, 1.5, 0, 0),
    g('skitterling', 11, 0.4, 3.9, 0),
  ] },
  // W5: base pool 1060 (curve 1080)
  { boss: null, groups: [
    g('spindle_drone', 8, 0.4, 0, 1),
    g('husk_crawler', 3, 0.9, 5.8, 1),
  ] },
  // W6: base pool 1155 (curve 1215)
  { boss: null, groups: [
    g('brood_carrier', 1, 1.8, 0, 2),
    g('skitterling', 6, 0.4, 3, 2),
  ] },
  // W7: base pool 1380 (curve 1350)
  { boss: null, groups: [
    g('husk_crawler', 3, 1.5, 0, 0),
    g('skitterling', 16, 0.3, 0, 1),
  ] },
  // W8: base pool 1460 (curve 1485)
  { boss: null, groups: [
    g('skitterling', 8, 0.4, 0, 0),
    g('rivet_walker', 2, 0.9, 0, 1),
    g('husk_crawler', 3, 1.5, 0, 2),
  ] },
  // W9: base pool 1540 (curve 1620)
  { boss: null, groups: [
    g('mender_unit', 1, 0.9, 0, 0),
    g('husk_crawler', 3, 1.5, 3, 0),
    g('skitterling', 16, 0.3, 0, 2),
  ] },
  // W10: base pool 3125 (curve 1755) mid
  { boss: 'mid', groups: [
    g('skitterling', 10, 0.4, 0, 1),
    g('skitterling', 10, 0.4, 0, 2),
    g('foundry_colossus', 1, 0, 0, 0),
    g('spindle_drone', 6, 0.4, 3, 0),
  ] },
  // W11: base pool 1990 (curve 1890)
  { boss: null, groups: [
    g('brood_carrier', 1, 1.8, 0, 2),
    g('husk_crawler', 1, 0.9, 0, 0),
    g('brood_carrier', 1, 1.8, 3, 0),
  ] },
  // W12: base pool 1920 (curve 2025)
  { boss: null, groups: [
    g('husk_crawler', 4, 0.9, 0, 1),
    g('rivet_walker', 4, 0.9, 0, 0),
    g('mender_unit', 1, 0.9, 5.7, 0),
  ] },
  // W13: base pool 2160 (curve 2160)
  { boss: null, groups: [
    g('skitterling', 16, 0.3, 0, 0),
    g('skitterling', 16, 0.3, 0, 1),
    g('skitterling', 16, 0.3, 0, 2),
  ] },
  // W14: base pool 2375 (curve 2295)
  { boss: null, groups: [
    g('anvil_tread', 1, 1.8, 0, 0),
    g('husk_crawler', 2, 0.9, 0, 1),
    g('brood_carrier', 1, 1.8, 0, 2),
  ] },
  // W15: base pool 2400 (curve 2430)
  { boss: null, groups: [
    g('husk_crawler', 7, 0.9, 0, 2),
    g('mender_unit', 1, 0.9, 8.4, 2),
    g('spindle_drone', 14, 0.4, 0, 1),
  ] },
  // W16: base pool 2485 (curve 2565)
  { boss: null, groups: [
    g('brood_carrier', 1, 1.8, 0, 0),
    g('rivet_walker', 4, 0.9, 0, 1),
    g('skitterling', 16, 0.3, 0, 2),
  ] },
  // W17: base pool 2690 (curve 2700)
  { boss: null, groups: [
    g('anvil_tread', 1, 1.8, 0, 2),
    g('husk_crawler', 4, 0.9, 0, 0),
    g('mender_unit', 1, 0.9, 5.7, 0),
    g('spindle_drone', 12, 0.4, 0, 1),
  ] },
  // W18: base pool 2845 (curve 2835)
  { boss: null, groups: [
    g('brood_carrier', 1, 1.8, 0, 1),
    g('rivet_walker', 4, 0.9, 0, 2),
    g('skitterling', 24, 0.3, 0, 0),
  ] },
  // W19: base pool 4025 (curve 2970)
  { boss: null, groups: [
    g('anvil_tread', 2, 1.8, 0, 0),
    g('brood_carrier', 1, 1.8, 0, 2),
    g('husk_crawler', 4, 0.9, 0, 1),
    g('mender_unit', 1, 0.9, 5.7, 1),
  ] },
  // W20: base pool 6435 (curve 3105) final
  { boss: 'final', groups: [
    g('skitterling', 12, 0.4, 0, 0),
    g('husk_crawler', 3, 0.9, 0, 1),
    g('choir_mother', 1, 0, 0, 2),
    g('brood_carrier', 1, 1.8, 3, 2),
    g('anvil_tread', 1, 1.8, 7.4, 0),
    g('spindle_drone', 6, 0.4, 4.8, 1),
  ] },
];

export const blackwaterSluice: MapDef = {
  id: 'blackwater-sluice',
  name: 'Blackwater Sluice',
  biome: 'marsh',
  tier: 3,
  briefing:
    "The refinery's sluice gates are the last dry ground between the hive and the pumping core. Three channels feed the basin, and the brood is coming down all of them.",
  palette: {
    ground: '#242C1E',
    groundAlt: '#3A4426',
    path: '#7A7056',
    buildPad: '#4D5A66',
    decor: '#1A2016',
    accent: '#A6E23A',
    core: '#FF8A3D',
    cliff: '#3C4334',
    keyLight: '#E4EDC4',
    hemiSky: '#8A9876',
    hemiGround: '#12170E',
    void: '#060904',
  },
  cols: 24,
  rows: 16,
  layout,
  tiles: parseLayout(layout),
  paths: [
    [[0, 4], [8, 4], [8, 9], [20, 9], [20, 3], [23, 3]],
    [[8, 0], [8, 4], [8, 9], [20, 9], [20, 3], [23, 3]],
    [[0, 13], [15, 13], [15, 9], [20, 9], [20, 3], [23, 3]],
  ],
  waves: blackwaterSluiceWaves,
  hpGrowth: 1.08,
  startingCash: 750,
};
