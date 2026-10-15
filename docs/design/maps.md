# Maps

> Superseded by docs/GDD.md where they conflict.

Three maps, increasing difficulty. Conventions for the engine:

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
