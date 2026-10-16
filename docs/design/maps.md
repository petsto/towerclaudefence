# Maps

> Superseded by docs/GDD.md where they conflict.

Six maps (§1–§3 original, §4–§6 Stage 10), increasing difficulty. Conventions for the engine:

- Coordinates are `[col,row]`, origin top-left; waypoints are tile centers, segments axis-aligned.
- Legend: `.` blocked ground (unbuildable terrain), `#` path, `B` build tile, `S` spawn (first waypoint of a path, also a path tile), `C` core/exit (last waypoint, also a path tile), `x` decorative obstacle (rock/crystal/wreck, unbuildable, may block line-of-sight visually only).
- On two-spawn maps both paths end at the same core and share their tail after the merge point.
- "Path length" = tiles walked from S to C inclusive (segments + 1). "Path tiles" = unique `#`/`S`/`C` tiles on the map.
- Palette keys: `ground` (`.`), `groundAlt` (noise/variation), `path`, `buildPad` (`B`), `decor` (`x`), `accent` (emissive/highlight), `core` (exit structure glow).

---

## 1. `dust-ridge-outpost` — Dust Ridge Outpost

- **Biome:** Badlands colony outpost (ochre dirt, mesas, prefab metal pads)
- **Difficulty tier:** 1 (Easy)
- **Briefing:** *Commander, the mining outpost on Dust Ridge has gone dark and hostile signatures are crossing the eastern flats. Hold the switchback road until the evacuation shuttles clear the core.*

| key | hex |
|---|---|
| ground | `#8A5A2B` |
| groundAlt | `#A86E36` |
| path | `#C9A56B` |
| buildPad | `#5F6B73` |
| decor | `#4A3420` |
| accent | `#E0B04A` |
| core | `#4FC3F7` |

**Grid:** 24 × 16

```
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
```

**Waypoints** (spawn `[0,2]` → core `[23,13]`):

```json
[[0,2],[20,2],[20,6],[3,6],[3,10],[20,10],[20,13],[23,13]]
```

**Stats:** build tiles **86**, path length **69** tiles.

**Intended strategy:** A three-lane serpentine. Build rows 4 and 8 sit between two parallel lanes, so every tower there covers the road twice — the obvious teaching spot for "place between lanes". The U-turns at `[20,2..6]` and `[3,6..10]` are corner chokepoints where splash towers hit enemies bunched on two legs at once. The right-edge column (cols 22–23) and the top/bottom rows give long-range towers clean sightlines down full 17-tile straights. Generous pads and a long path forgive misplacement.

**Waves:** 15. **HP growth:** ×1.10 per wave.

---

## 2. `cinder-forge` — Cinder Forge

- **Biome:** Ash / volcanic refinery installation (ash fields, lava fissures, scorched plating)
- **Difficulty tier:** 2 (Medium)
- **Briefing:** *The geothermal forge is our only fuel source in the sector, and two enemy columns are converging on it from the ash fields. Stop them at the junction or lose the refinery.*

| key | hex |
|---|---|
| ground | `#3A3634` |
| groundAlt | `#5C5752` |
| path | `#7A6F63` |
| buildPad | `#4D5A66` |
| decor | `#1E1B1A` |
| accent | `#FF5A1F` |
| core | `#FFB347` |

**Grid:** 22 × 14

```
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
```

**Waypoints** (two spawns, merge at `[9,7]`, core `[21,4]`):

```json
{
  "north": [[0,1],[9,1],[9,7],[15,7],[15,11],[19,11],[19,4],[21,4]],
  "south": [[0,12],[9,12],[9,7],[15,7],[15,11],[19,11],[19,4],[21,4]]
}
```

**Stats:** build tiles **45**, path length **39** tiles (north) / **38** tiles (south), unique path tiles **53**.

**Intended strategy:** Two columns descend the central shaft (col 9) from opposite ends and meet at `[9,7]`. The pads flanking the junction (`[7..8,8..10]`, `[10..11,8..9]`) are premium: they reach both incoming legs and the merged lane, so splash shines there once the streams combine. The post-merge loop around `[15..19, 7..11]` (pads `[16..18,8..9]` sit inside it) lets one ring of towers hit three legs. Early pads (`[3..5,3]`, `[3..5,10]`) only cover one stream each — long-range towers there can thin a single column before the merge. Fewer, clustered pads force commitment.

**Waves:** 18 (alternate north/south spawns early; both from wave 6). **HP growth:** ×1.12 per wave.

---

## 3. `hollow-spire` — Hollow Spire

- **Biome:** Alien-infested crystal world (violet creep, bioluminescent crystal spires)
- **Difficulty tier:** 3 (Hard)
- **Briefing:** *Creep has swallowed the research station and the hive is pushing through two breaches at once. Every pad we have left is under the spires — make each one count.*

| key | hex |
|---|---|
| ground | `#2A1F3D` |
| groundAlt | `#5B2A5E` |
| path | `#7A4A8C` |
| buildPad | `#3E5566` |
| decor | `#48E5C2` |
| accent | `#C0FF3E` |
| core | `#FF4F6D` |

**Grid:** 20 × 14

```
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
```

**Waypoints** (two spawns, merge at `[11,9]`, core `[2,12]`):

```json
{
  "north": [[5,0],[5,6],[11,6],[11,9],[2,9],[2,12]],
  "east":  [[19,3],[15,3],[15,9],[11,9],[2,9],[2,12]]
}
```

**Stats:** build tiles **22**, path length **28** tiles (north) / **27** tiles (east), unique path tiles **42**.

**Intended strategy:** Short paths and two breaches mean little time on target. The 2×2 pad at `[12..13,7..8]` is the map's premium spot: it sits between the north leg (col 11), the east leg (col 15) and the merged lane (row 9) — the best splash location on the map. `[9..10,7..8]` covers the north elbow and the merged lane. `[16,5..6]` is the only pad that sees the east leg early — long range belongs there. The final stretch (row 9 westward, then col 2) is guarded only by `[3..4,7..8]` and `[6..7,10..11]`, a last-ditch kill zone in front of the core. With only a handful of pads, upgrades matter more than tower count.

**Waves:** 20 (both breaches active from wave 1; east breach gets fast units). **HP growth:** ×1.14 per wave.


---

## Stage 10 additions: maps 4–6 and two new biomes

Home order by tier: Dust Ridge (1), **Whiteout Relay (2)**, Cinder Forge (2), **Blackwater Sluice (3)**, Hollow Spire (3), **Ossuary Deep (4)**. Each new map has its own play pattern: a **fork** (one spawn, two branches, one tail), **three inlets** that merge in two stages, and a **spiral plus a sally port** (a long lane and a 14-tile shortcut into the heart). Wave pools follow GDD §8: the curve is ±8% on regular waves, the mid boss sits at ×1.77, the ramp at ×1.2–1.36, and the final at ×1.6–1.7 of the wave before it. Custom-run settings (GDD §15) are listed under each map: all three default `roster` (their Campaign fields all nine enemies). Only Ossuary Deep sets `heavyPaths`.

Engineer checklist per map:

1. Add the id to `MapId`.
2. Write `src/data/maps/<id>.ts`, copying the layout, paths, waves and palette below verbatim.
3. Register the map in `MAPS` and `MAP_LIST` (tier order above).
4. Add the map to `EXPECTED` in `data.test.ts`.
5. For a new biome, add the `Biome` member, the `style()` case, the `ground`/`path`/`rock` branches and the thumbnail `SPECK` entry.
6. Check it in `/dev/render.html?map=<id>`.

Also, for the waves engineer: Dust Ridge sets `roster: ['skitterling', 'husk_crawler', 'spindle_drone', 'brood_carrier', 'choir_mother', 'rivet_walker', 'anvil_tread']`. That adds Anvil Treads, so its heavy phase has two heavy types. Cinder Forge and Hollow Spire keep the defaults.

---

## 4. `whiteout-relay` — Whiteout Relay

- **Biome:** `frost` (new). A glacial ice shelf around a derelict deep-space relay: wind-packed snow, blue ice and buried antenna wreckage.
- **Difficulty tier:** 2. Sits between Dust Ridge and Cinder Forge; it teaches shields early.
- **Briefing:** *The relay on the ice shelf is the last voice this sector has, and a machine column is marching on it through the storm. The road splits around the old antenna field. Cover both lanes or lose the uplink.*

| key | hex |
|---|---|
| ground | `#B4BEC6` |
| groundAlt | `#95A3AE` |
| path | `#6A6862` |
| buildPad | `#46525E` |
| decor | `#2C3842` |
| accent | `#8FD8FF` |
| core | `#FFB347` |
| cliff | `#5B6D7A` |
| keyLight | `#EEF4FF` |
| hemiSky | `#C2D2E0` |
| hemiGround | `#2B333B` |
| void | `#0B0F13` |

The ground is mid grey-blue, not white, so units keep their contrast. The path is a warm grit grey so the lane never reads as snow.

**Grid:** 24 × 16

```
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
```

**Waypoints** (one spawn `[0,1]`; fork at `[11,4]`, rejoin at `[11,11]`, core `[23,14]`):

```json
{
  "west": [[0,1],[11,1],[11,4],[4,4],[4,11],[11,11],[11,14],[23,14]],
  "east": [[0,1],[11,1],[11,4],[18,4],[18,11],[11,11],[11,14],[23,14]]
}
```

**Stats:** build tiles **48**, path length **51** tiles on either branch (equal lengths, so First targeting stays fair across branches), unique path tiles **71**.

**Settings:** `hpGrowth` **1.07**, `startingCash` **650**, 18 waves (mid boss W9 Foundry Colossus, final W18 Choir Mother). `roster`/`heavyPaths`: defaults.

**Intended strategy:**

- **Shared lanes:** the 15-tile head and 15-tile tail carry everything.
- **The fork:** each group then takes one branch. A tower on a branch sees about half of a wave; a tower on a shared lane sees all of it.
- **Premium pads:** inside the island, the fork cluster `[9..13,6]` and the rejoin cluster `[9..13,9]` reach the first and last legs of both branches. The tail strip `[13..17,13]` sits between both bottom legs and the tail.
- **Weaker pads:** the flanks `[6..7,7..8]` and `[15..16,7..8]` and the outer columns `[2,6..9]` and `[20,6..9]` cover one branch each. They're cheap insurance when a heavy picks a side.
- **Island center:** `[10..12,7..8]` is the frozen relay mast (decor), so the island never gets a "sees everything" pad.
- **What it teaches:** pick shared lanes over branch-only pads. Twin-branch waves (W8, W12, W17) punish one-sided builds.

**Waves** (`g(enemy, count, interval s, delay s, pathIndex)`; path 0 = west branch, 1 = east branch; pool comments as in the existing files):

```ts
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
```

---

## 5. `blackwater-sluice` — Blackwater Sluice

- **Biome:** `marsh` (new). A drowned refinery basin: black peat mud, stagnant toxic pools, rusted grate causeways and mossy concrete levees.
- **Difficulty tier:** 3. Sits alongside Hollow Spire: more pads, but three fronts.
- **Briefing:** *The refinery's sluice gates are the last dry ground between the hive and the pumping core. Three channels feed the basin, and the brood is coming down all of them.*

| key | hex |
|---|---|
| ground | `#2E3828` |
| groundAlt | `#48512C` |
| path | `#7A7056` |
| buildPad | `#4D5A66` |
| decor | `#1A2016` |
| accent | `#A6E23A` |
| core | `#FF8A3D` |
| cliff | `#3C4334` |
| keyLight | `#E4EDC4` |
| hemiSky | `#8A9876` |
| hemiGround | `#12170E` |
| void | `#060904` |

**Grid:** 24 × 16

```
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
```

**Waypoints** (three spawns; west and north merge at `[8,4]`, south joins at `[15,9]`, core `[23,3]`):

```json
{
  "west":  [[0,4],[8,4],[8,9],[20,9],[20,3],[23,3]],
  "north": [[8,0],[8,4],[8,9],[20,9],[20,3],[23,3]],
  "south": [[0,13],[15,13],[15,9],[20,9],[20,3],[23,3]]
}
```

**Stats:** build tiles **34**. Path length **35** (west), **31** (north) and **34** (south) tiles; unique path tiles **58**.

**Settings:** `hpGrowth` **1.08**, `startingCash` **700**, 20 waves (mid boss W10 Foundry Colossus, final W20 Choir Mother). `roster`/`heavyPaths`: defaults.

**Intended strategy:**

- **Waves 1–6:** one inlet per wave, rotating W, N, S. The early economy decides whether you spread thin or hold the merges.
- **First merge:** `[8,4]` (west + north). Pads `[9..10,5..6]` and `[5..6,5..6]` see both streams and the merged column.
- **South inlet:** a 15-tile lone causeway along row 13. Only `[3..6,11]` covers it early.
- **The levee:** `[10..13,11]` sits between the merged lane (row 9) and the south inlet (row 13), so it covers two streams.
- **Second merge:** at `[15,9]` everything shares one 15-tile tail. The elbow block `[16..18,6..7]`, the M2 pads `[17..18,11..12]` and the column `[22,5..8]` form the final kill zone.
- **Triple waves:** from W13, all three inlets fire at once (W13 is a triple swarm).
- **The final:** the Choir Mother walks the long lonely south inlet, so her Skitterling births stack up before the levee.

**Waves** (path 0 = west, 1 = north, 2 = south):

```ts
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
    g('husk_crawler', 2, 0.9, 0, 0),
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
    g('husk_crawler', 3, 0.9, 0, 0),
    g('skitterling', 16, 0.3, 0, 1),
  ] },
  // W8: base pool 1540 (curve 1485)
  { boss: null, groups: [
    g('rivet_walker', 3, 0.9, 0, 1),
    g('husk_crawler', 4, 0.9, 0, 2),
  ] },
  // W9: base pool 1540 (curve 1620)
  { boss: null, groups: [
    g('mender_unit', 1, 0.9, 0, 0),
    g('husk_crawler', 3, 0.9, 3, 0),
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
    g('brood_carrier', 2, 1.8, 0, 2),
    g('husk_crawler', 1, 0.9, 0, 0),
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
```

---

## 6. `ossuary-deep` — Ossuary Deep

- **Biome:** `crystal` (reused; palette only). The hive's heart, dug into the bone pits under an old mine: crimson creep, bone-white crystal growths and glowing red pustules. The crystal branches already take crystal tint and rock veins from `decor` and glow from `accent`, so the palette alone moves it away from Hollow Spire's violet and teal.
- **Difficulty tier:** 4. The new top tier: fewest pads, longest campaign, both bosses in the final.
- **Briefing:** *The hive dug its nest into the bone pits under the old mine. One tunnel winds down to the heart and another breaches straight in from the east. Hold the heart, Commander. There is nowhere left to fall back.*

| key | hex |
|---|---|
| ground | `#2B1518` |
| groundAlt | `#52202C` |
| path | `#74424A` |
| buildPad | `#3E5566` |
| decor | `#E3D3B8` |
| accent | `#FF3D5E` |
| core | `#38E0D0` |
| cliff | `#3E2026` |
| keyLight | `#FFE0D6` |
| hemiSky | `#A87878` |
| hemiGround | `#1C0A0D` |
| void | `#090304` |

**Grid:** 20 × 14

```
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
```

**Waypoints** (spiral from `[0,2]`; the sally port from `[19,8]` crosses the spiral's east arm at `[17,8]` and shares row 8 from `[14,8]` to the core `[6,8]`):

```json
{
  "spiral": [[0,2],[17,2],[17,11],[2,11],[2,5],[14,5],[14,8],[6,8]],
  "sally":  [[19,8],[6,8]]
}
```

**Stats:** build tiles **18**. Path length **71** (spiral) and **14** (sally) tiles; unique path tiles **75**. `[17,8]` is a crossing, not a merge: both paths pass through it in different directions.

**Settings:** `hpGrowth` **1.08**, `startingCash` **750**, 22 waves (mid boss W11 Choir Mother, final W22 Choir Mother + Foundry Colossus). `roster`: default. **`heavyPaths: [0]`**: generated heavies and bosses never use the sally port, matching the Campaign rule.

**Intended strategy:**

- **Two lanes:** the spiral is long but its arms sit 3 tiles apart, so its 18 pads are pockets between arms. The sally port is a 14-tile sprint into the heart: a Spindle crosses it in about 6 s.
- **The heart:** `[8..10,6..7]` sees the inner arm (row 5), the shared core lane (row 8) and the col-14 drop. It is the best pad block in the game, and it is six tiles.
- **Pockets:**
  - `[4..5,3..4]` sees the outer arm, the inner arm and the west column.
  - `[15..16,3..4]` sees the top arm, the east arm and the inner arm's end.
  - `[15..16,10]` and `[10..11,10]` see the bottom arm and the sally / core lane.
- **First targeting:** sally units always have the least distance to the core, so they always come first.
- **The pull:** heavies grind the spiral while lights rush the sally. Over-building the spiral's outer pockets loses the heart; over-building the heart lets an Anvil column walk 71 tiles barely scratched.
- **Upgrades and powers:** with 18 pads, upgrades and the Lance carry the late game. Tremor Mines on the sally lane are the cheapest answer to a W19 double swarm.

**Waves** (path 0 = spiral, 1 = sally port; heavies and bosses only on path 0):

```ts
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
```

---

## Biome specs (terrain engineer)

Both new biomes plug into `src/render/hd/terrain/build.ts` `style()` and `src/render/hd/terrain/textures.ts` (`ground`/`path`/`rock` branches; today unknown biomes fall through to crystal), plus `SPECK` in `src/ui/thumbnail.ts`. The palettes are in the map sections above. Keep the rule from the existing biomes: the ground stays low-contrast and the path is the clearest lane on the map.

### `frost`: glacial shelf (Whiteout Relay)

- **Ground:** wind-packed snow crust.
  - Broad, low sastrugi ridges: fbm stretched about 3:1 along +x, height ±0.3.
  - A faint sparkle grain (fine noise, ±4% value).
  - Sparse patches of exposed blue-black ice (worley cells about 1 per 2 units, mixed toward `decor` at 40%, roughness 0.3 vs 0.85 for snow, height −0.2).
  - No glow. Texture scale like badlands (1.8).
- **Path:** a ploughed service lane of compacted grit and grey slush.
  - Dense small gravel, like the badlands path pebbles but cold grey.
  - Darker wet tracks: fbm, mixed toward `decor` at 25%.
  - Rare frozen-puddle glints: roughness 0.2 spots, about 8% of the area. No glow.
- **Rock:** glacial ice cliffs.
  - Horizontal strata: the badlands band recipe with fewer, thicker bands (12 per 2 units), toned between `cliff` and `#DCE8F0`.
  - Vertical melt streaks.
  - A thick bright snow cap on top faces (mix toward `ground` by up-facing normal, or use the `top` term).
- **Props:**
  - Ice spires: the crystal prop pass with tint `#D8F0FF`, glow 0, size 0.8, sat 0.3.
  - Buried relay wreckage and antenna stubs: the wreck pass.
- **`style('frost')`:** `{ rocks: 2.0, crystals: 0.9, crystal: '#D8F0FF', crystalGlow: 0, crystalSize: 0.8, crystalSat: 0.3, wreck: 0.16, look: { glowG: '#000000', glowR: '#000000', top: 1.25, rim: 0.35, propGround: false } }`
- **Thumbnail `SPECK`:** `'keyLight'` (near-white ice shards on rock).

### `marsh`: drowned refinery (Blackwater Sluice)

- **Ground:** black-green peat mud.
  - Stagnant pools: worley cells about 3 per 2 units, flat, height −0.25, roughness 0.12, 30% toward `groundAlt` for an algae sheen.
  - Scum and algae blotches: low-frequency `groundAlt` patches.
  - Dead-reed stubble: fine dark specks.
  - Rare toxic bubbles in the pools glow `accent`, sparser than volcanic hot spots.
  - Everything else roughness 0.5: it should look wet.
- **Path:** a causeway of rusted steel grating and duckboard planks.
  - Planks: a tileable plank grid of 4 × 1 planks per unit, seams dark (mix toward `decor` at 75%), slight per-plank tone jitter (±10%).
  - Rust: stains mixed toward `#7A4A2A` at up to 35% by fbm.
  - Mud splashes near the plank ends. Roughness 0.7, no glow.
- **Rock:** concrete levee blocks.
  - Large offset-row blocks (a brick pattern, 3 rows per 2 units) with chipped edges.
  - Green moss on up-facing tops (mix toward `groundAlt`).
  - Vertical rust and water streaks.
  - An optional thin `accent` seep in a few seams (sparse glow).
- **Props:**
  - Fungal stalks: the crystal pass with tint `accent`, glow 0.5, size 0.5.
  - Rusted pipes and pump housings: the wreck pass, the densest wreck of any biome.
  - Props stand on the ground (`propGround`).
- **`style('marsh')`:** `{ rocks: 1.6, crystals: 0.3, crystal: p.accent, crystalGlow: 0.5, crystalSize: 0.5, crystalSat: 0.8, wreck: 0.25, look: { glowG: p.accent, glowR: '#000000', top: 0.9, rim: 0.4, propGround: true } }`
- **Thumbnail `SPECK`:** `'accent'` (glow stalks).

### Ossuary Deep on `crystal`

- **No code:** the palette alone does it. Creep veins tint toward the crimson `groundAlt`, crystal props and rock veins turn bone-white (`decor`), and pustules glow `accent` red.
- **Spawn marker:** if the red pustules compete with the spawn marker (`#ff3a3a`) in the thumbnail, drop `accent` to `#E0405A`. Don't change the spawn colour.

### Errata (terrain pass, as built)

The shipped looks deviate from the specs above in these points. The map files are authoritative.

- **Whiteout Relay palette:**
  - `ground #6E7A86` and `groundAlt #5F6C78`. The spec hexes rendered near-white (about `#C8D4E2`) under the cool key and sky light. The new values render mid grey-blue, about `#8EA0B4`.
  - `path #605649`. It is darker and warmer than the spec, so the lane keeps its value contrast against the darker ground.
  - `accent #9EEBFF`. The pad lights are drawn at 0.7 × accent, and the old value vanished on the grey-blue ground.
- **Blackwater Sluice palette:** `ground #242C1E` and `groundAlt #3A4426`. The macro tint multiplies by groundAlt/ground in linear light, and the spec pair (×2.2) lifted the peat to olive. The plank causeway must stay the clearly lighter lane.
- **Ossuary Deep palette:**
  - `accent #E0405A`, as allowed above. Unoccupied pad lights, and not only the pustules, sat next to the red spawn marker.
  - `decor #D4C4A8`. This tones down the near-white emissive rock veins on the cliff faces.
- **frost:**
  - Ice patches are irregular fbm blobs mixed 32% toward `decor`, not worley cells at 40%. Discs repeating every 2 tiles read as a polka-dot grid.
  - `look.top` is 1.35, not 1.25, and a new `look.cap` of 0.85 gives boulder tops and ledges the snow cap.
- **marsh:**
  - Pools are irregular fbm blobs, for the same repetition reason.
  - Planks are 0.25 units wide and 1 or 2 units long. Square-ended 1-unit planks read as brickwork.
  - About 1 plank in 7 is a rusted steel grating panel.
  - Levee blocks run 4 rows per 2 units (1 × 0.5), not 3. An odd row count breaks the running bond at the texture seam.
  - The accent seep is on: `glowR` is 0.35 × accent.
