# Game Design Document

Single source of truth for game design. Where `docs/design/*.md` disagree, this doc wins. Numbers here are mirrored by `src/data/*.ts` (data is authoritative for exact values; this doc for rules). Sim contract: `src/sim/types.ts`.

Currency: **Credits** (cr). Times in seconds, distances in tiles (1 tile = 1 world unit). Numbers are Normal difficulty unless noted.

## 1. Pillars

- **Matchups over mass.** Damage type × size class plus flat armor: the right tower beats more towers.
- **Tiles are the scarce resource.** Upgrades are less cash-efficient but far more tile-efficient.
- **Deterministic and readable.** No RNG in combat. Same inputs, same outcome; enables headless balance runs.
- **Pressure, not punishment.** Gentle exponential HP ramp vs flat bounties; greed (early calls) is opt-in.
- **Every tower has a job.** Each leads at least one matchup, none leads all.

## 2. Damage model (`src/data/damage.ts`)

| Damage type | LIGHT | MEDIUM | HEAVY | Armor applies | vs shields |
|---|---|---|---|---|---|
| Normal | 1.00 | 1.00 | 1.00 | yes | ×1.0 |
| Concussive | 1.00 | 0.50 | 0.25 | yes | ×1.0 |
| Explosive | 0.50 | 0.75 | 1.00 | yes | ×1.0 |
| Plasma | 1.00 | 1.00 | 1.00 | **no** | ×1.5 (×2.0 Arc Coil L3) |

**Hit resolution** (per target, per hit):
1. `d` = tower damage (× splash factor for splash victims, × chain falloff for chain jumps).
2. **Shields** (if `shield > 0`): `s = d × shieldMult`; `absorbed = min(shield, s)`; `shield -= absorbed`; `d *= 1 − absorbed/s`. Stop if `d == 0`. No armor, no size multiplier on shields.
3. **HP:** `armorEff = plasma ? 0 : armor`; `hp -= max(0.5, (d − armorEff) × sizeMult)`.
4. Any damage sets `lastDamagedTick`. `hp ≤ 0` → dies this tick, bounty paid, death abilities fire.

**Shields:** Remnant only. Absorb first, full damage from every type. Regenerate only if the enemy's ability says so. HP is a float; display `ceil(hp)`. Bosses are HEAVY.

| Effect | Rule |
|---|---|
| Slow | `speed × (1 − slow)`. Strongest active slow wins, reapply refreshes duration. Bosses take ×0.5 of the slow. Anvil Tread immune. |
| Splash | Primary 100%. Others: 100% within `0.5R`, 50% from `0.5R` to `R`. |
| Chain | From last hit enemy, jump to nearest unhit enemy within 2.0 tiles (tie: lowest id). Each jump ×0.75. Ignores tower range. |
| Execute | Railgun: after hit, if `shield == 0`, `hp ≤ threshold × maxHp`, not boss → `hp = 0`. |

## 3. Towers (`src/data/towers.ts`)

Build only on `B` tiles, one per tile, never blocks the path. Build/upgrade instant. **Sell** 70% of invested; **undo** 100% if no enemy spawned since the buy/last upgrade.

| Hotkey | Tower | Cost | Dmg | Type | Cooldown | Range | Delivery | Special | Default target |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Picket Autocannon | 100 | 6 | Normal | 0.40 | 3.5 | Hitscan | — | First |
| 2 | Thumper Mortar | 150 | 20 | Concussive | 2.00 | 4.5 (min 1.0) | Shell 5 t/s, homing | Splash 1.25; lands at last position if target dies | First |
| 3 | Stasis Projector | 120 | 4 | Concussive | 1.00 | 3.0 | Beam | Slow 35% / 2.0 s | First, prefers unslowed |
| 4 | Longshot Railgun | 175 | 50 | Normal | 2.50 | 7.0 | Hitscan | Execute ≤ 10% | Strongest |
| 5 | Breacher Missile Pod | 200 | 35 ×2 | Explosive | 2.00 | 4.0 | Missiles 7 t/s, salvo 0.15 s | Fizzles if target dies | Strongest |
| 6 | Arc Coil | 160 | 14 | Plasma | 1.25 | 3.0 | Instant chain | +3 chain targets | First |

| Tower | L2 cost: changes | L3 cost: changes | Invested |
|---|---|---|---|
| Picket | 75: dmg 9 | 125: dmg 12, cd 0.30, range 4.0 | 300 |
| Thumper | 110: dmg 30, splash 1.5 | 190: dmg 44, cd 1.75 | 450 |
| Stasis | 90: slow 45%, 2.5 s, range 3.5 | 150: slow 50%, dmg 8, beam forks to 3 | 360 |
| Longshot | 130: dmg 80, range 7.5 | 220: dmg 120, cd 2.20, execute 15% | 525 |
| Breacher | 150: dmg 50 | 250: 3 missiles, cd 1.80, range 4.5 | 600 |
| Arc Coil | 120: dmg 20, chain +4 | 200: dmg 26, cd 1.00, shield ×2.0 | 480 |

**Targeting** (player-cyclable): First (min distance to core) · Last · Strongest (max hp+shield) · Weakest · Closest (to tower). Re-evaluated whenever a tower is ready; tie-break lowest enemy id. Range: Euclidean, tower tile center → enemy center. Cooldown starts on fire; with no target the tower idles at 0 and fires the tick one enters. Projectiles snapshot damage at fire time and cannot miss a living target.

## 4. Enemies (`src/data/enemies.ts`)

| ID | Name | Faction | Size | HP | Armor | Shield | Speed | Lives | Bounty | Ability |
|---|---|---|---|---|---|---|---|---|---|---|
| `skitterling` | Skitterling | Chorus | L | 45 | 0 | — | 2.0 | 1 | 4 | — |
| `husk_crawler` | Husk Crawler | Chorus | M | 220 | 1 | — | 1.2 | 2 | 16 | Regen 4 HP/s |
| `brood_carrier` | Brood Carrier | Chorus | H | 750 | 2 | — | 0.7 | 5 | 48 | Death: 3 Skitterlings |
| `choir_mother` | Choir Mother (boss) | Chorus | H | 5000 | 3 | — | 0.5 | 20 | 400 | Every 8 s: 2 Skitterlings |
| `spindle_drone` | Spindle Drone | Remnant | L | 35 | 1 | 15 | 2.2 | 1 | 8 | — |
| `rivet_walker` | Rivet Walker | Remnant | M | 160 | 2 | 60 | 1.0 | 2 | 20 | Shields +15/s after 2.5 s undamaged |
| `mender_unit` | Mender Unit | Remnant | M | 120 | 1 | 40 | 1.3 | 2 | 24 | Heals others in 2 tiles 6 HP/s (no stack) |
| `anvil_tread` | Anvil Tread | Remnant | H | 900 | 4 | 150 | 0.55 | 5 | 56 | Slow-immune |
| `foundry_colossus` | Foundry Colossus (boss) | Remnant | H | 4500 | 4 | 1500 | 0.45 | 20 | 400 | Shields +60/s after 4 s undamaged |

Spawned children give normal bounty/leak cost and inherit the parent's path progress (offset backwards). Mid-map boss variant: ×0.5 HP and shields, 200 bounty. Visual construction and death FX: `docs/design/enemies.md` §3–4.

## 5. Economy (`src/data/economy.ts`)

| Source | Amount |
|---|---|
| Starting cash | Dust Ridge 500 · Cinder Forge 550 · Hollow Spire 600 |
| Kill bounty | Per enemy (§4). Flat, does not scale with wave. |
| Wave-clear bonus | `20 + 5 × w` (w = 1-based wave) when every enemy of that wave incl. children is dead or leaked. Boss waves ×2. |
| Early-call bonus | `3 × floor(countdown seconds left)`, max 60 |
| Interest | None |

**Lives:** 20 on Normal; leak cost per enemy (L 1 · M 2 · H 5 · boss 20). Lives ≤ 0 → defeat at end of tick.
**Wave timeline:** wave 1 launches on CALL WAVE. When wave *w* finishes spawning, a 20 s countdown to *w+1* starts and auto-launches at 0. CALL WAVE during a countdown launches now and pays the early-call bonus. Waves may overlap. **Victory:** final wave fully spawned and no enemies alive.

## 6. Difficulty (`src/data/difficulty.ts`)

| Modifier | Easy (Recruit) | Normal (Veteran) | Hard (Elite) | Brutal |
|---|---|---|---|---|
| Enemy HP & shields | ×0.75 | ×1.00 | ×1.25 | ×1.50 |
| HP growth `g` | −0.010 | +0 | +0.010 | +0.015 |
| Enemy speed | ×0.90 | ×1.00 | ×1.10 | ×1.15 |
| Enemy armor | +0 | +0 | +0 | +1 |
| Bounty, clear & early-call bonus | ×1.25 | ×1.00 | ×0.90 | ×0.80 |
| Starting cash | ×1.30 | ×1.00 | ×0.90 | ×0.80 |
| Lives | 30 | 20 | 15 | 10 |

Cash results round down. Wave content is identical across difficulties.
**HP scaling:** `hp(w) = baseHp × diffHp × (g_map + g_diff)^(w − 1)` (w 1-based); shields identical; bosses too. Armor and speed do not scale per wave.

## 7. Maps (`src/data/maps/*.ts`, layouts verbatim from `docs/design/maps.md`)

| Map | Biome | Tier | Grid | Paths | Build tiles | Waves | `g_map` | Final ×HP | Mid boss | Final boss |
|---|---|---|---|---|---|---|---|---|---|---|
| Dust Ridge Outpost | Badlands | 1 | 24×16 | 1 (69 tiles) | 86 | 15 | 1.070 | ×2.6 | W8 Choir Mother | W15 Choir Mother |
| Cinder Forge | Volcanic | 2 | 22×14 | 2, merge at [9,7] | 45 | 18 | 1.085 | ×4.0 | W9 Choir Mother | W18 Foundry Colossus |
| Hollow Spire | Crystal / creep | 3 | 20×14 | 2, merge at [11,9] | 22 | 20 | 1.100 | ×6.1 | W10 Foundry Colossus | W20 both |

Tile legend: `.` ground · `#` path · `B` build · `S` spawn · `C` core · `x` decor. Strategy notes per map: `docs/design/maps.md`.

## 8. Waves

Authored as explicit groups `{ enemyId, count, interval, delay, pathIndex }` in each map file. `delay` = seconds from wave start to the group's first spawn (so groups on different paths run in parallel). Defaults: interval L 0.4 / M 0.9 / H 1.8 s (swarms 0.3); 3 s gap between consecutive groups on a path; boss escorts 3 s after the boss. Base HP pool tracks wave-1 pool × (1 + 0.25(w−1)) before growth; boss waves exceed it by design. One new enemy per wave at most.

**Dust Ridge Outpost** (single path; Chorus with light Remnant intro)

| Waves | Content |
|---|---|
| 1–2 | Skitterlings (10, 12) |
| 3 | + Husk Crawler intro |
| 4 | + Spindle Drone intro |
| 5–7 | Husks; Brood Carrier intro (W6); 16-Skitterling stream |
| 8 | **Mid boss:** Skitterlings → Choir Mother (×0.5) → Spindle escort |
| 9 | Husks + Spindles |
| 10 | + Rivet Walker intro |
| 11–14 | Brood + Husks; 24-swarm + Rivets; wide-spaced Husks (regen test); Broods + follow-up stream |
| 15 | **Final:** Skitterlings, Husks → Choir Mother → Skitterling escort |

**Cinder Forge** (path 0 north, 1 south; W1–5 alternate N/S, both from W6; mixed)

| Waves | Content |
|---|---|
| 1–5 | Skitterlings/Spindles, Husk intro W3; N, S, N, S, N |
| 6 | Rivet Walker intro, pairs on both paths |
| 7 | Brood Carrier intro (N) + Spindles (S) |
| 8 | Mender Unit intro behind Rivets (N) + Husks (S) |
| 9 | **Mid boss:** Choir Mother (×0.5) N + Skitterlings S |
| 10–11 | Twin Skitterling streams; Brood N vs Rivet+Mender S |
| 12 | Anvil Tread intro |
| 13–17 | Twin Broods; Anvil–Mender–Anvil column; Husk N vs Rivet S; Anvil + Spindle screen; twin 20-swarms |
| 18 | **Final:** Foundry Colossus N with Rivet/Mender escort, Spindle stream S |

**Hollow Spire** (path 0 north, 1 east; both from W1; east gets fast units; full roster)

| Waves | Content |
|---|---|
| 1–4 | Skitterlings N, Spindles E; Husk intro W3 |
| 5–6 | Rivet Walker intro E; Husks N |
| 7 | Brood Carrier intro N |
| 8 | 16-swarm N; Rivets E |
| 9 | Mender Unit intro E |
| 10 | **Mid boss:** Foundry Colossus (×0.5) N + Spindles E |
| 11 | Twin Broods N |
| 12 | Anvil Tread intro with Mender N; Rivets E |
| 13–19 | Husk/Rivet split; Anvil–Mender–Anvil; Broods + stream; twin Anvils + Spindle screen; twin 24-swarms; Broods vs Rivet+Mender; Anvils + Mender vs Rivets |
| 20 | **Final:** Choir Mother N + Foundry Colossus E simultaneously, Husk/Rivet escorts |

## 9. Game flow

```
Home --(pick map + difficulty)--> Playing <--(pause/resume)--> Paused
                                     |-- final wave cleared --> Victory --> Home
                                     |-- lives reach 0 -------> Defeat  --> Home
Paused --(quit)--> Home
```

- **Home:** map cards (thumbnail from map data, name, biome, wave count) and a 4-way difficulty switch.
- **Playing:** sim runs; before wave 1 the player builds freely and presses CALL WAVE.
- **Paused:** sim stops; only resume/speed commands accepted. Menu: Resume, Restart, Quit to Home.
- **Victory/Defeat:** summary (waves cleared, lives left), buttons Retry and Home. Sim is discarded on Home.

## 10. Controls

| Input | Action |
|---|---|
| `1`–`6` / command card | Select tower to build (ghost follows cursor) |
| Left click | Place tower / select tower |
| Right click / `Esc` | Cancel placement or deselect; `Esc` with nothing selected toggles pause |
| `U` | Upgrade selected tower |
| `X` | Sell selected tower |
| `Tab` | Cycle targeting mode of selected tower |
| `Space` | CALL WAVE (start / call early) |
| `P` | Pause / resume |
| `F` | Cycle game speed 1× → 2× → 3× |
| WASD / arrows / edge-scroll | Pan camera |
| Mouse wheel | Zoom (3 fixed steps) |

Towers use number keys so WASD stays free for panning.

## 11. Art direction (detail: `docs/design/art-direction.md`)

- Orthographic camera, yaw 0°, pitch 55°; low-res render target upscaled at integer scale with nearest filtering; 8-level posterize + Bayer dither.
- Flat-shaded Lambert, one hard-shadow directional key light, per-biome hemisphere fill, no fog.
- Primitive-built low-poly models, instanced per type. Player = steel blue / gunmetal / amber; hostiles never blue or amber.
- Per-map palettes live in `MapDef.palette`: tile colors from `maps.md`, lighting (key, hemi, cliff, void) from `art-direction.md` (Dustbelt → Dust Ridge, Cinder → Cinder Forge, new crystal set → Hollow Spire). Orbital and Frostline biomes are dropped.
- DOM HUD at native resolution: metal console panels, Share Tech Mono / Rajdhani / Orbitron.

## 12. Changelog of decisions

| Decision | Source |
|---|---|
| HP growth `g_map` = 1.07 / 1.085 / 1.10 (not `maps.md`'s 1.10 / 1.12 / 1.14) | systems.md wins on numbers |
| Bounties = `enemies.md` × 4 | systems.md |
| Shields: Remnant only; absorb first; full damage from all types, no armor or size multiplier; Plasma ×1.5; no regen unless the ability says so | Director |
| Biomes/palettes: the 3 maps.md biomes; art-direction lighting mapped onto them; unused biomes dropped | Director |
| Waves: explicit lists, 15/18/20; bosses at midpoint and final; Map 1 Chorus-heavy, Map 2 mixed, Map 3 everything incl. both bosses | Director |
| Difficulty Easy/Normal/Hard/Brutal per systems.md; UI names Recruit/Veteran/Elite/Brutal | Director + lead designer |
| Group `delay` is absolute from wave start (allows parallel streams on two-path maps) | Lead designer |
| Mid boss: same boss at ×0.5 HP/shields, 200 bounty; flagged by `WaveDef.boss = 'mid'` | systems.md §7 |
| Tower hotkeys 1–6 (WASD is camera pan) | Lead designer |
| Sim events accumulate until `drainEvents()` instead of clearing each step (a frame may run 0–3 steps) | Lead designer |
| Commands apply immediately on `dispatch` (between steps); paused accepts only resume/speed | Lead designer |
