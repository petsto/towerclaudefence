import type { MapDef, WaveDef } from '../types';
import { g, parseLayout } from './util';

// Verbatim from docs/design/maps.md.
const layout = `
.............xxxxx....
S#########...xxxxx....
.........#............
...BBB...#BBxx........
.........#BBxx..BBB##C
......xx.#BB....BBB#..
xxxx..xx.#.........#BB
xxxx.....#######...#BB
xxxx...BB#BB...#BBB#..
.......BB#BB.BB#BBB#..
...BBB.BB#...BB#...#..
.........#.....#####..
S#########.xxx......xx
xx.........xxx..BBB.xx
`;

// Wave comments: base pool = HP+shields at Normal before growth (mid boss at x0.55); curve = wave-1 pool x (1 + 0.25(w-1)).
// Path 0 = north, 1 = south. Waves 1-5 alternate north/south, both from wave 6. Mixed factions.
const cinderForgeWaves: readonly WaveDef[] = [
  // W1: base pool 560 (curve 500)
  { boss: null, groups: [
    g('skitterling', 8, 0.4, 0, 0),
    g('spindle_drone', 4, 0.4, 5.8, 0),
  ] },
  // W2: base pool 630 (curve 625)
  { boss: null, groups: [
    g('skitterling', 14, 0.4, 0, 1),
  ] },
  // W3: base pool 740 (curve 750)
  { boss: null, groups: [
    g('husk_crawler', 2, 0.9, 0, 0),
    g('spindle_drone', 6, 0.4, 3.9, 0),
  ] },
  // W4: base pool 890 (curve 875)
  { boss: null, groups: [
    g('skitterling', 10, 0.4, 0, 1),
    g('husk_crawler', 2, 0.9, 6.6, 1),
  ] },
  // W5: base pool 960 (curve 1000)
  { boss: null, groups: [
    g('husk_crawler', 3, 0.9, 0, 0),
    g('spindle_drone', 6, 0.4, 4.8, 0),
  ] },
  // W6: base pool 1150 (curve 1125)
  { boss: null, groups: [
    g('rivet_walker', 2, 0.9, 0, 0),
    g('rivet_walker', 2, 0.9, 0, 1),
    g('skitterling', 3, 0.4, 3.9, 0),
    g('skitterling', 3, 0.4, 3.9, 1),
  ] },
  // W7: base pool 1285 (curve 1250)
  { boss: null, groups: [
    g('brood_carrier', 1, 1.8, 0, 0),
    g('spindle_drone', 8, 0.4, 0, 1),
  ] },
  // W8: base pool 1480 (curve 1375)
  { boss: null, groups: [
    g('rivet_walker', 3, 0.9, 0, 0),
    g('husk_crawler', 3, 0.9, 0, 1),
    g('mender_unit', 1, 0.9, 4.8, 0),
  ] },
  // W9: base pool 3610 (curve 1500)
  { boss: 'mid', groups: [
    g('skitterling', 8, 0.4, 0, 0),
    g('skitterling', 10, 0.4, 0, 1),
    g('choir_mother', 1, 0, 5.8, 0),
    g('spindle_drone', 6, 0.4, 8.8, 0),
  ] },
  // W10: base pool 1620 (curve 1625)
  { boss: null, groups: [
    g('skitterling', 12, 0.4, 0, 0),
    g('skitterling', 12, 0.4, 0, 1),
    g('husk_crawler', 2, 0.9, 7.4, 0),
    g('spindle_drone', 2, 0.4, 7.4, 1),
  ] },
  // W11: base pool 1685 (curve 1750)
  { boss: null, groups: [
    g('brood_carrier', 1, 1.8, 0, 0),
    g('rivet_walker', 2, 0.9, 0, 1),
    g('mender_unit', 1, 0.9, 3.9, 1),
    g('spindle_drone', 4, 0.4, 6.9, 1),
  ] },
  // W12: base pool 1940 (curve 1875)
  { boss: null, groups: [
    g('skitterling', 6, 0.4, 0, 0),
    g('spindle_drone', 8, 0.4, 0, 1),
    g('anvil_tread', 1, 1.8, 5, 0),
    g('husk_crawler', 1, 0.9, 5.8, 1),
  ] },
  // W13: base pool 1950 (curve 2000)
  { boss: null, groups: [
    g('brood_carrier', 2, 1.8, 0, 0),
    g('skitterling', 4, 0.4, 0, 1),
  ] },
  // W14: base pool 2560 (curve 2125)
  { boss: null, groups: [
    g('anvil_tread', 1, 1.8, 0, 0),
    g('spindle_drone', 6, 0.4, 0, 1),
    g('mender_unit', 1, 0.9, 3, 0),
    g('anvil_tread', 1, 1.8, 6, 0),
  ] },
  // W15: base pool 2230 (curve 2250)
  { boss: null, groups: [
    g('husk_crawler', 4, 0.9, 0, 0),
    g('rivet_walker', 4, 0.9, 0, 1),
    g('skitterling', 6, 0.4, 5.7, 0),
    g('spindle_drone', 4, 0.4, 5.7, 1),
  ] },
  // W16: base pool 2335 (curve 2375)
  { boss: null, groups: [
    g('anvil_tread', 1, 1.8, 0, 0),
    g('brood_carrier', 1, 1.8, 0, 1),
    g('spindle_drone', 8, 0.4, 3, 0),
  ] },
  // W17: base pool 3450 (curve 2500); ramps into the final
  { boss: null, groups: [
    g('skitterling', 20, 0.3, 0, 0),
    g('skitterling', 20, 0.3, 0, 1),
    g('rivet_walker', 2, 0.9, 8.7, 0),
    g('mender_unit', 1, 0.9, 8.7, 1),
    g('anvil_tread', 1, 1.8, 11.7, 0),
  ] },
  // W18: base pool 5480 (curve 2625)
  { boss: 'final', groups: [
    g('rivet_walker', 2, 0.9, 0, 0),
    g('skitterling', 12, 0.4, 0, 1),
    g('foundry_colossus', 1, 0, 3.9, 0),
    g('rivet_walker', 2, 0.9, 6.9, 0),
    g('spindle_drone', 8, 0.4, 7.4, 1),
    g('mender_unit', 1, 0.9, 10.8, 0),
  ] },
];

export const cinderForge: MapDef = {
  id: 'cinder-forge',
  name: 'Cinder Forge',
  biome: 'volcanic',
  tier: 2,
  briefing:
    'The geothermal forge is our only fuel source in the sector, and two enemy columns are converging on it from the ash fields. Stop them at the junction or lose the refinery.',
  palette: {
    ground: '#3A3634',
    groundAlt: '#5E3A3C', // charcoal-red (olive read as green)
    path: '#7A6F63',
    buildPad: '#4D5A66',
    decor: '#1E1B1A',
    accent: '#FF5A1F',
    core: '#FFB347',
    cliff: '#2e2222',
    keyLight: '#ffd0a0',
    hemiSky: '#8a7a70',
    hemiGround: '#1a1210',
    void: '#0c0808',
  },
  cols: 22,
  rows: 14,
  layout,
  tiles: parseLayout(layout),
  paths: [
    [[0, 1], [9, 1], [9, 7], [15, 7], [15, 11], [19, 11], [19, 4], [21, 4]],
    [[0, 12], [9, 12], [9, 7], [15, 7], [15, 11], [19, 11], [19, 4], [21, 4]],
  ],
  waves: cinderForgeWaves,
  hpGrowth: 1.075,
  startingCash: 650,
};
