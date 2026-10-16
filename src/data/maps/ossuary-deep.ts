import type { MapDef, WaveDef } from '../types';
import { g, parseLayout } from './util';

// Verbatim from docs/design/maps.md.
const layout = `
xxxx........xxxxxxxx
....................
S#################..
....BB.........BB#xx
....BB.........BB#xx
..#############..#xx
xx#xx...BBBxx.#..#xx
xx#xx...BBBxx.#..#..
xx#...C############S
xx#...xx.........#..
..#...xx..BB...BB#xx
..################xx
xxxxx....xxxxxxxxxxx
xxxxx....xxxxxxxxxxx
`;

// Wave comments: base pool = HP+shields at Normal before growth (mid boss at x0.55); curve = wave-1 pool x (1 + 0.25(w-1)).
// Path 0 = spiral, 1 = sally port; heavies and bosses only on path 0.
const ossuaryDeepWaves: readonly WaveDef[] = [
  // W1: base pool 670 (curve 670)
  { boss: null, groups: [
    g('skitterling', 10, 0.4, 0, 0),
    g('husk_crawler', 1, 0.9, 6.6, 0),
  ] },
  // W2: base pool 840 (curve 838)
  { boss: null, groups: [
    g('skitterling', 12, 0.4, 0, 0),
    g('spindle_drone', 6, 0.4, 7.4, 0),
  ] },
  // W3: base pool 1020 (curve 1005)
  { boss: null, groups: [
    g('husk_crawler', 3, 0.9, 0, 0),
    g('skitterling', 8, 0.4, 4.8, 0),
  ] },
  // W4: base pool 1120 (curve 1173)
  { boss: null, groups: [
    g('skitterling', 16, 0.3, 0, 0),
    g('spindle_drone', 8, 0.4, 0, 1),
  ] },
  // W5: base pool 1330 (curve 1340)
  { boss: null, groups: [
    g('husk_crawler', 4, 0.9, 0, 0),
    g('spindle_drone', 9, 0.4, 0, 1),
  ] },
  // W6: base pool 1510 (curve 1508)
  { boss: null, groups: [
    g('rivet_walker', 4, 0.9, 0, 0),
    g('skitterling', 14, 0.4, 0, 1),
  ] },
  // W7: base pool 1725 (curve 1675)
  { boss: null, groups: [
    g('brood_carrier', 1, 1.8, 0, 0),
    g('spindle_drone', 8, 0.4, 0, 1),
    g('husk_crawler', 2, 0.9, 3, 0),
  ] },
  // W8: base pool 1860 (curve 1843)
  { boss: null, groups: [
    g('husk_crawler', 4, 0.9, 0, 0),
    g('rivet_walker', 2, 0.9, 0, 1),
    g('skitterling', 12, 0.4, 5.7, 0),
  ] },
  // W9: base pool 1960 (curve 2010)
  { boss: null, groups: [
    g('mender_unit', 1, 0.9, 0, 0),
    g('rivet_walker', 5, 0.9, 3, 0),
    g('spindle_drone', 14, 0.4, 0, 1),
  ] },
  // W10: base pool 2100 (curve 2178)
  { boss: null, groups: [
    g('skitterling', 20, 0.3, 0, 0),
    g('husk_crawler', 3, 0.9, 8.7, 0),
    g('skitterling', 12, 0.4, 0, 1),
  ] },
  // W11: base pool 4140 (curve 2345) mid
  { boss: 'mid', groups: [
    g('skitterling', 10, 0.4, 0, 0),
    g('choir_mother', 1, 0, 6.6, 0),
    g('husk_crawler', 3, 0.9, 9.6, 0),
    g('spindle_drone', 10, 0.4, 0, 1),
    g('rivet_walker', 4, 0.9, 6.6, 1),
  ] },
  // W12: base pool 2470 (curve 2513)
  { boss: null, groups: [
    g('brood_carrier', 2, 1.8, 0, 0),
    g('spindle_drone', 14, 0.4, 0, 1),
  ] },
  // W13: base pool 2530 (curve 2680)
  { boss: null, groups: [
    g('anvil_tread', 1, 1.8, 0, 0),
    g('mender_unit', 1, 0.9, 3, 0),
    g('husk_crawler', 3, 0.9, 6, 0),
    g('rivet_walker', 3, 0.9, 0, 1),
  ] },
  // W14: base pool 2820 (curve 2848)
  { boss: null, groups: [
    g('husk_crawler', 8, 0.9, 0, 0),
    g('skitterling', 20, 0.3, 0, 1),
    g('mender_unit', 1, 0.9, 8.7, 1),
  ] },
  // W15: base pool 3050 (curve 3015)
  { boss: null, groups: [
    g('brood_carrier', 2, 1.8, 0, 0),
    g('rivet_walker', 4, 0.9, 0, 1),
    g('spindle_drone', 8, 0.4, 5.7, 1),
  ] },
  // W16: base pool 3140 (curve 3183)
  { boss: null, groups: [
    g('anvil_tread', 2, 1.8, 0, 0),
    g('spindle_drone', 12, 0.4, 0, 1),
    g('rivet_walker', 2, 0.9, 7.4, 1),
  ] },
  // W17: base pool 3340 (curve 3350)
  { boss: null, groups: [
    g('husk_crawler', 6, 0.9, 0, 0),
    g('rivet_walker', 6, 0.9, 0, 1),
    g('mender_unit', 1, 0.9, 7.5, 1),
    g('skitterling', 12, 0.4, 7.5, 0),
  ] },
  // W18: base pool 3615 (curve 3518)
  { boss: null, groups: [
    g('anvil_tread', 1, 1.8, 0, 0),
    g('brood_carrier', 1, 1.8, 3, 0),
    g('spindle_drone', 16, 0.3, 0, 1),
    g('husk_crawler', 4, 0.9, 6, 0),
  ] },
  // W19: base pool 3640 (curve 3685)
  { boss: null, groups: [
    g('skitterling', 24, 0.3, 0, 0),
    g('skitterling', 24, 0.3, 0, 1),
    g('rivet_walker', 6, 0.9, 9.9, 1),
    g('mender_unit', 1, 0.9, 17.4, 1),
  ] },
  // W20: base pool 3860 (curve 3853)
  { boss: null, groups: [
    g('brood_carrier', 2, 1.8, 0, 0),
    g('anvil_tread', 1, 1.8, 4.8, 0),
    g('rivet_walker', 4, 0.9, 0, 1),
    g('mender_unit', 1, 0.9, 5.7, 1),
  ] },
  // W21: base pool 4865 (curve 4020)
  { boss: null, groups: [
    g('anvil_tread', 2, 1.8, 0, 0),
    g('mender_unit', 1, 0.9, 4.8, 0),
    g('brood_carrier', 1, 1.8, 7.8, 0),
    g('rivet_walker', 6, 0.9, 0, 1),
    g('spindle_drone', 8, 0.4, 7.5, 1),
  ] },
  // W22: base pool 8200 (curve 4188) final
  { boss: 'final', groups: [
    g('skitterling', 12, 0.4, 0, 0),
    g('choir_mother', 1, 0, 7.4, 0),
    g('foundry_colossus', 1, 0, 15.4, 0),
    g('spindle_drone', 10, 0.4, 7.4, 1),
    g('rivet_walker', 3, 0.9, 14, 1),
  ] },
];

export const ossuaryDeep: MapDef = {
  id: 'ossuary-deep',
  name: 'Ossuary Deep',
  biome: 'crystal',
  tier: 4,
  briefing:
    'The hive dug its nest into the bone pits under the old mine. One tunnel winds down to the heart and another breaches straight in from the east. Hold the heart, Commander. There is nowhere left to fall back.',
  palette: {
    ground: '#2B1518',
    groundAlt: '#52202C',
    path: '#74424A',
    buildPad: '#3E5566',
    decor: '#D4C4A8',
    accent: '#E0405A',
    core: '#38E0D0',
    cliff: '#3E2026',
    keyLight: '#FFE0D6',
    hemiSky: '#A87878',
    hemiGround: '#1C0A0D',
    void: '#090304',
  },
  cols: 20,
  rows: 14,
  layout,
  tiles: parseLayout(layout),
  paths: [
    [[0, 2], [17, 2], [17, 11], [2, 11], [2, 5], [14, 5], [14, 8], [6, 8]],
    [[19, 8], [6, 8]],
  ],
  waves: ossuaryDeepWaves,
  // Generated heavies and bosses never take the 14-tile sally port (GDD §15).
  heavyPaths: [0],
  hpGrowth: 1.095,
  startingCash: 750,
};
