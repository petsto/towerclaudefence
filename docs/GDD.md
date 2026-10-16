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
4. Any damage sets `lastDamagedAt` (sim seconds). `hp ≤ 0` → dies this tick, bounty paid, death abilities fire.

**Shields:** Remnant only. Absorb first, full damage from every type. Regenerate only if the enemy's ability says so. HP is a float; display `ceil(hp)`. Bosses are HEAVY.

| Effect | Rule |
|---|---|
| Slow | `speed × (1 − slow)`. Strongest active slow wins, reapply refreshes duration. Bosses take ×0.5 of the slow. Anvil Tread immune. |
| Splash | Primary 100%. Others: 100% within `0.5R`, 50% from `0.5R` to `R`. |
| Chain | From last hit enemy, jump to nearest unhit enemy within 2.0 tiles (tie: lowest id). Each jump ×0.75. Ignores tower range. |
| Execute | Railgun: after hit, if `shield == 0`, `hp ≤ threshold × maxHp`, not boss → `hp = 0`. |

## 3. Towers (`src/data/towers.ts`)

Build only on `B` tiles, one per tile, never blocks the path. Build/upgrade instant. **Sell** 70% of invested; **undo:** credits spent since the last enemy spawn refund at 100% (e.g. a build from wave 1 upgraded before wave 5 sells for 100% of the upgrade + 70% of the build).

| Hotkey | Tower | Cost | Dmg | Type | Cooldown | Range | Delivery | Special | Default target |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Picket Autocannon | 100 | 6 | Normal | 0.40 | 3.5 | Hitscan | — | First |
| 2 | Thumper Mortar | 150 | 20 | Concussive | 1.70 | 4.5 (min 1.0) | Shell 5 t/s, homing | Splash 1.25; lands at last position if target dies | First |
| 3 | Stasis Projector | 120 | 4 | Concussive | 1.00 | 3.0 | Beam | Slow 35% / 2.0 s | First, prefers unslowed |
| 4 | Longshot Railgun | 225 | 40 | Normal | 2.50 | 5.5 | Hitscan | Execute ≤ 10% | Strongest |
| 5 | Breacher Missile Pod | 200 | 35 ×2 | Explosive | 2.00 | 4.5 | Missiles 7 t/s, salvo 0.15 s | Fizzles if target dies | Strongest |
| 6 | Arc Coil | 160 | 14 | Plasma | 1.25 | 3.5 | Instant chain | +3 chain targets | First |

| Tower | L2 cost: changes | L3 cost: changes | Invested |
|---|---|---|---|
| Picket | 75: dmg 7, cd 0.33 | 125: dmg 9, cd 0.27, range 4.0 | 300 |
| Thumper | 110: 2 shells × dmg 16 (0.15 s apart), splash 1.5 | 190: 3 shells, cd 1.50 | 450 |
| Stasis | 90: slow 45%, 2.5 s, range 3.5 | 150: slow 50%, dmg 8, beam forks to 3 | 360 |
| Longshot | 130: dmg 65, range 6.5 | 220: dmg 105, range 7.5, execute 15% | 575 |
| Breacher | 150: dmg 50 | 250: 3 missiles, cd 1.80, range 5.0 | 600 |
| Arc Coil | 120: dmg 20, chain +4 | 200: dmg 26, cd 1.00, shield ×2.0 | 480 |

**Targeting** (player-cyclable): First (min distance to core) · Last · Strongest (max hp+shield) · Weakest · Closest (to tower). Re-evaluated whenever a tower is ready; tie-break lowest enemy id. Range: Euclidean, tower tile center → enemy center. Cooldown starts on fire; with no target the tower idles at 0 and fires the tick one enters. Projectiles snapshot damage at fire time and cannot miss a living target.

## 4. Enemies (`src/data/enemies.ts`)

| ID | Name | Faction | Size | HP | Armor | Shield | Speed | Lives | Bounty | Ability |
|---|---|---|---|---|---|---|---|---|---|---|
| `skitterling` | Skitterling | Chorus | L | 45 | 0 | — | 2.0 | 1 | 4 | — |
| `husk_crawler` | Husk Crawler | Chorus | M | 220 | 1 | — | 1.2 | 2 | 16 | Regen 4 HP/s |
| `brood_carrier` | Brood Carrier | Chorus | H | 750 | 2 | — | 0.7 | 5 | 48 | Death: 3 Skitterlings |
| `choir_mother` | Choir Mother (boss) | Chorus | H | 3000 | 3 | — | 0.5 | 20 | 400 | Every 10 s: 2 Skitterlings |
| `spindle_drone` | Spindle Drone | Remnant | L | 35 | 1 | 15 | 2.2 | 1 | 8 | — |
| `rivet_walker` | Rivet Walker | Remnant | M | 160 | 2 | 60 | 1.0 | 2 | 20 | Shields +15/s after 2.5 s undamaged |
| `mender_unit` | Mender Unit | Remnant | M | 120 | 1 | 40 | 1.3 | 2 | 24 | Heals others in 2 tiles 6 HP/s (no stack) |
| `anvil_tread` | Anvil Tread | Remnant | H | 900 | 4 | 150 | 0.55 | 5 | 56 | Slow-immune |
| `foundry_colossus` | Foundry Colossus (boss) | Remnant | H | 2600 | 4 | 900 | 0.45 | 20 | 400 | Shields +60/s after 4 s undamaged |

Spawned children give normal bounty/leak cost and inherit the parent's path progress (offset backwards). Mid-map boss variant: ×0.55 HP and shields, 200 bounty. Visual construction and death FX: `docs/design/enemies.md` §3–4.

## 5. Economy (`src/data/economy.ts`)

| Source | Amount |
|---|---|
| Starting cash | Dust Ridge 600 · Whiteout Relay 650 · Cinder Forge 650 · Blackwater Sluice 750 · Hollow Spire 700 · Ossuary Deep 750 |
| Kill bounty | Per enemy (§4). Flat, does not scale with wave. |
| Wave-clear bonus | `30 + 6 × w` (w = 1-based wave) when every enemy of that wave incl. children is dead or leaked. Boss waves ×2. |
| Early-call bonus | `4 × floor(countdown seconds left)`, max 60 |
| Interest | None |

**Lives:** 20 on Normal; leak cost per enemy (L 1 · M 2 · H 5 · boss 20). Lives ≤ 0 → defeat at end of tick.
**Wave timeline:** wave 1 launches on CALL WAVE. When wave *w* finishes spawning, a 15 s countdown to *w+1* is set. It **holds** (does not tick) while wave *w* still has enemies alive, for at most 40 s (`WAVE_MAX_HOLD`), then ticks and auto-launches at 0. So auto-launched waves overlap only with slow stragglers (a Brood Carrier or boss still walking after 40 s), never pile up. CALL WAVE any time after spawning launches now and pays the early-call bonus; calling while the field is still busy (countdown held at 15) pays the full 60. **Victory:** final wave fully spawned and no enemies alive.

## 6. Difficulty (`src/data/difficulty.ts`)

| Modifier | Easy (Recruit) | Normal (Veteran) | Hard (Elite) | Brutal |
|---|---|---|---|---|
| Enemy HP & shields | ×0.75 | ×1.00 | ×1.10 | ×1.15 |
| HP growth `g` | −0.010 | +0 | +0.005 | +0.0075 |
| Enemy speed | ×0.90 | ×1.00 | ×1.05 | ×1.05 |
| Enemy armor | +0 | +0 | +0 | +1 |
| Bounty, clear & early-call bonus | ×1.25 | ×1.00 | ×0.95 | ×0.90 |
| Starting cash | ×1.30 | ×1.00 | ×1.00 | ×1.00 |
| Lives | 30 | 20 | 15 | 10 |

Cash results round down. Wave content is identical across difficulties.
**HP scaling:** `hp(w) = baseHp × diffHp × (g_map + g_diff)^(w − 1)` (w 1-based); shields identical; bosses too. Armor and speed do not scale per wave.

## 7. Maps (`src/data/maps/*.ts`, layouts verbatim from `docs/design/maps.md`)

| Map | Biome | Tier | Grid | Paths | Build tiles | Waves | `g_map` | Final ×HP | Mid boss | Final boss |
|---|---|---|---|---|---|---|---|---|---|---|
| Dust Ridge Outpost | Badlands | 1 | 24×16 | 1 (69 tiles) | 86 | 15 | 1.060 | ×2.3 | W8 Choir Mother | W15 Choir Mother |
| Cinder Forge | Volcanic | 2 | 22×14 | 2, merge at [9,7] | 45 | 18 | 1.075 | ×3.4 | W9 Choir Mother | W18 Foundry Colossus |
| Hollow Spire | Crystal / creep | 3 | 20×14 | 2, merge at [11,9] | 22 | 20 | 1.080 | ×4.3 | W10 Foundry Colossus | W20 both |
| Whiteout Relay | Frost (new) | 2 | 24×16 | 2: one spawn, fork at [11,4], rejoin at [11,11] (51 tiles each) | 48 | 18 | 1.0725 | ×3.3 | W9 Foundry Colossus | W18 Choir Mother |
| Blackwater Sluice | Marsh (new) | 3 | 24×16 | 3 inlets, merge at [8,4] then [15,9] (35 / 31 / 34 tiles) | 34 | 20 | 1.080 | ×4.3 | W10 Foundry Colossus | W20 Choir Mother |
| Ossuary Deep | Crystal (hive-heart palette) | 4 | 20×14 | 2: spiral (71 tiles) + sally port (14), cross at [17,8], share row 8 from [14,8] | 18 | 22 | 1.095 | ×6.7 | W11 Choir Mother | W22 Choir Mother + Foundry Colossus |

Home order (`MAP_LIST`, tier ascending): Dust Ridge, Whiteout Relay, Cinder Forge, Blackwater Sluice, Hollow Spire, Ossuary Deep. Tier pips scale to the highest tier (4). New maps are spec'd in `docs/design/maps.md` §4–§6 (balance errata there). Starting cash: §5.

Tile legend: `.` ground · `#` path · `B` build · `S` spawn · `C` core · `x` decor. Strategy notes per map: `docs/design/maps.md`.

## 8. Waves

These are the **Campaign** lists. Custom run lengths (10–50 waves) reuse them as a prefix and generate the rest: §15.

Authored as explicit groups `{ enemyId, count, interval, delay, pathIndex }` in each map file. `delay` = seconds from wave start to the group's first spawn (so groups on different paths run in parallel). Defaults: interval L 0.4 / M 0.9 / H 1.8 s (swarms 0.3); 3 s gap between consecutive groups on a path; boss escorts 3 s after the boss. Base HP pool tracks wave-1 pool × (1 + 0.25(w−1)) before growth; boss waves exceed it by design (mid ×1.6–1.9 of the curve, a skill check; final ×1.6–2.3 of the wave before it). The wave before each final runs ~1.2–1.4× the curve so defenses ramp into the boss instead of hitting a cliff. One new enemy per wave at most.

**Dust Ridge Outpost** (single path; Chorus with light Remnant intro)

| Waves | Content |
|---|---|
| 1–2 | Skitterlings (10, 12) |
| 3 | + Husk Crawler intro |
| 4 | + Spindle Drone intro |
| 5–7 | Husks; Brood Carrier intro (W6); 16-Skitterling stream |
| 8 | **Mid boss:** Skitterlings → Choir Mother (×0.55) → Spindle escort |
| 9 | Husks + Spindles |
| 10 | + Rivet Walker intro |
| 11–14 | Brood + Husks; 24-swarm + Rivets; wide-spaced Husks (regen test); Broods + stream + Husks (ramp) |
| 15 | **Final:** Skitterlings, Husks → Choir Mother (its own spawn is the escort) |

**Cinder Forge** (path 0 north, 1 south; W1–5 alternate N/S, both from W6; mixed)

| Waves | Content |
|---|---|
| 1–5 | Skitterlings/Spindles, Husk intro W3; N, S, N, S, N |
| 6 | Rivet Walker intro, pairs on both paths |
| 7 | Brood Carrier intro (N) + Spindles (S) |
| 8 | Mender Unit intro behind Rivets (N) + Husks (S) |
| 9 | **Mid boss:** Choir Mother (×0.55) N + Skitterlings S |
| 10–11 | Twin Skitterling streams; Brood N vs Rivet+Mender S |
| 12 | Anvil Tread intro |
| 13–17 | Twin Broods; Anvil–Mender–Anvil column; Husk N vs Rivet S; Anvil + Spindle screen; twin 20-swarms + Anvil (ramp) |
| 18 | **Final:** Foundry Colossus N with Rivet/Mender escort, Spindle stream S |

**Hollow Spire** (path 0 north, 1 east; both from W1; east gets fast units; full roster)

| Waves | Content |
|---|---|
| 1–4 | Skitterlings N, Spindles E; single-Husk intro W3 |
| 5–6 | Rivet Walker intro E; Husks N vs one Rivet + Spindles E |
| 7 | Brood Carrier intro N |
| 8 | 16-swarm N; Rivets E |
| 9 | Mender Unit intro E |
| 10 | **Mid boss:** Foundry Colossus (×0.55) N + Spindles E |
| 11 | Twin Broods N |
| 12 | Anvil Tread intro with Mender N; Rivets E |
| 13–19 | Husk/Rivet split; Anvil–Mender–Anvil; Broods + stream; twin Anvils + Spindle screen; twin 24-swarms; Broods vs Rivet+Mender; Anvils + Mender vs 6 Rivets (ramp) |
| 20 | **Final:** Choir Mother N + Foundry Colossus E simultaneously, Husk/Rivet escorts |

**Whiteout Relay** (one spawn; path 0 = west branch, 1 = east branch, shared head and tail; every group picks a branch; Remnant-leaning)

| Waves | Content |
|---|---|
| 1–2 | Spindles W + Skitterlings E; 16-Skitterling stream E |
| 3–4 | Husk Crawler intro E vs Spindles W; Rivet Walker intro W vs Skitterlings E |
| 5–6 | Husks + Skitterlings E vs Spindles W; Rivets W vs Spindles E |
| 7 | Mender Unit intro leading Rivets W; Husks E |
| 8 | Twin 14-swarms (one per branch) + Rivets E |
| 9 | **Mid boss:** Spindles → Foundry Colossus (×0.55) W, Rivet escort; Skitterlings E |
| 10–12 | Husks W vs 14 Spindles E; Brood Carrier intro E vs Rivets + Mender W; Rivets on both branches + Spindles |
| 13 | Anvil Tread intro W; Spindles + Husks E |
| 14–16 | 20-swarm W vs Husks + Mender E; Anvil E vs Brood + Spindles W; Rivet column + Mender W vs Husks E |
| 17 | Twin Anvils (one per branch), Spindle screen, Mender + Rivets (ramp) |
| 18 | **Final:** Spindles → Choir Mother W, Husk escort; Rivets E before and after her |

**Blackwater Sluice** (path 0 = west, 1 = north, 2 = south; one inlet per wave W1–6, two from W7, all three from W13; Chorus-heavy)

| Waves | Content |
|---|---|
| 1–6 | W, N, S, W, N, S: Skitterlings; Husk intro W3 (S); Spindle intro W5 (N); Brood Carrier intro W6 (S) |
| 7–9 | Husks W + 16-swarm N; Rivet intro (2) N + Husks S + Skitterlings W; Mender intro with Husks W + 16-swarm S. Husks here and in W4 at 1.5 s spacing |
| 10 | **Mid boss:** Foundry Colossus (×0.55) W with Spindle escort; Skitterlings N and S |
| 11–12 | Broods S and W + Husk W; Husks N vs Rivets + Mender W |
| 13 | Triple 16-swarm, all inlets at once |
| 14–18 | Anvil intro W, Husks N, Brood S; 7 Husks + Mender S vs 14 Spindles N; Brood W, Rivets N, swarm S; Anvil S, Husks + Mender W, Spindles N; Brood N, Rivets S, 24-swarm W |
| 19 | Twin Anvils W, Brood S, Husks + Mender N (ramp) |
| 20 | **Final:** Choir Mother S (the long lone inlet) with Brood escort; Skitterlings + Anvil W; Husks + Spindles N |

**Ossuary Deep** (path 0 = spiral, 1 = sally port; heavies and bosses always take the spiral; sally from W4; full roster)

| Waves | Content |
|---|---|
| 1–3 | Spiral only: Skitterlings + one Husk; Skitterlings + Spindles; Husks |
| 4–5 | Sally port opens: Spindles through it while Skitterlings / Husks walk the spiral |
| 6–7 | Rivet intro (spiral) vs 14 Skitterlings (sally); Brood Carrier intro + Husks vs Spindles |
| 8–10 | Husks + swarm vs Rivets (sally); Mender intro with 5 Rivets vs 14 Spindles; 20-swarm + Husks vs 12-swarm |
| 11 | **Mid boss:** Skitterlings → Choir Mother (×0.55) on the spiral, Husk escort; Spindles + Rivets through the sally |
| 12–13 | Twin Broods vs 14 Spindles; Anvil Tread intro + Mender + Husks vs Rivets |
| 14–20 | 8 Husks vs 20-swarm + Mender; Broods vs Rivets + Spindles; twin Anvils vs Spindles + Rivets; Husks + swarm vs 6 Rivets + Mender; Anvil + Brood + Husks vs 16 Spindles; twin 24-swarms + Rivets + Mender; Broods + Anvil vs Rivets + Mender |
| 21 | Twin Anvils, Brood, Mender (spiral) vs 6 Rivets + Spindles (ramp) |
| 22 | **Final:** Choir Mother, then Foundry Colossus 8 s behind her on the spiral; Spindles + Rivets through the sally |

## 9. Game flow

State machine: `docs/architecture.md`. Layout and states: `docs/design/ui-revamp.md` §3–§4.

- **Home:** map tiles in `MAP_LIST` order (thumbnail from map data, name, biome, campaign wave count, tier badge and pips), a mission briefing (intel rows, typed briefing text), a 4-way difficulty switch and the **wave count**: Campaign (default, the map's authored length) or Custom (10–50, §15). Map, difficulty, mode and custom count persist in `localStorage`. BEGIN OPERATION (or Enter) starts `{ mapId, difficultyId, waveCount }`, `waveCount` undefined for Campaign.
- **Playing:** sim runs; before wave 1 the player builds freely and presses CALL WAVE. The top bar shows `WAVE 07 / 50` with a progress bar, a tick at every boss wave (and at wave 41 in runs of 41+), the next-wave countdown or HOLD, credits, lives, speed, pause and mute. A `CUSTOM` chip marks custom runs. Toasts: gold info, red for boss waves (`final assault` only on the last wave, by index), green for wave clears.
- **Paused:** sim stops; only resume/speed commands accepted. Modal: Resume, Restart mission, Quit to menu.
- **Victory/Defeat:** modal with theatre, difficulty, "Waves X / N cleared", lives, credits, kills, damage dealt and mission time; buttons Retry mission and Main menu. Retry recreates the sim on the same config (same wave count); Main menu discards it.

## 10. Controls

Key bindings: `README.md`. Towers use number keys `1`–`6` so WASD stays free for camera panning. Home: Tab / arrows move between controls, Enter launches.

## 11. Art direction (detail: `docs/design/art-direction.md`)

- Orthographic camera, yaw 0°, pitch 55°. Units are HD PBR models baked to a sprite atlas per map; terrain is an HD scene pre-rendered once per map (`docs/terrain-hd.md`). Everything draws at native resolution.
- Player = steel blue / gunmetal / amber; hostiles never blue or amber.
- Per-map palettes live in `MapDef.palette`. Biomes: badlands (Dust Ridge), volcanic (Cinder Forge), crystal (Hollow Spire; Ossuary Deep with a hive-heart palette), frost (Whiteout Relay), marsh (Blackwater Sluice). Each biome has its own terrain look (`src/render/hd/terrain/`).
- DOM UI (Stage 10): a StarCraft II-style navy glass console with cyan state borders, a gold primary call to action and white tabular numbers, set in Saira. Spec: `docs/design/ui-revamp.md`; tokens and components in `src/ui/tokens.css` / `components.css`.

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
| Mid boss: same boss at ×0.55 HP/shields, 200 bounty; flagged by `WaveDef.boss = 'mid'` | systems.md §7 |
| Tower hotkeys 1–6 (WASD is camera pan) | Lead designer |
| Sim events accumulate until `drainEvents()` instead of clearing each step (a frame may run 0–3 steps) | Lead designer |
| Commands apply immediately on `dispatch` (between steps); paused accepts only resume/speed | Lead designer |
| Countdown holds while the previous wave is alive (max 40 s), 15 s once clear; early call 4 cr/s, max 60 | Balance pass |
| Bosses 3000 / 2600+900 base, mid ×0.55, Choir births every 10 s; `g_map` 1.06 / 1.075 / 1.08; final escorts trimmed, pre-final waves ramp | Balance pass |
| Longshot 225 cr, 40 dmg, range 5.5 (was mono-spam optimal on Dust Ridge); Picket L2/L3 trimmed; Thumper faster; Breacher/Arc +0.5 range | Balance pass |
| Clear bonus 30 + 6w, starting cash +100; Elite/Brutal softened so Recruit→Veteran→Elite→Brutal is a ramp, not a cliff | Balance pass |
| Picket upgrades raise fire rate as well as damage; Thumper L2/L3 fire 2/3 shells (16 dmg each): extras hit the next-best targets in range, else land 0.4 tiles around the primary | Balance pass |
| Command powers (§14): Tremor Mines (Q, 30 s, 3 stored, 60% slow field) and Lance Strike (E, 120 s, 6 Plasma pulses, 20% of a boss). Charging starts at wave 1 launch, not map load (no build-phase banking). Lance damage scales with `g_map`, bosses take a fixed fraction instead (mid and final alike). No difficulty modifier. | Product/game design |
| Lance charge 120 → 150 s: at 120 s the powers flipped Cinder Forge Elite to a comfortable win. Mines 30 → 40 s and a per-difficulty charge multiplier were tried and dropped (no target moved; Dust Brutal needs ×3 and is non-monotonic below) | Balance pass |
| Longshot range grows per level 5.5 / 6.5 / 7.5 (was 5.5 / 6.0 / 6.0); L2 dmg 70 → 65 and L3 keeps cd 2.50 (was 2.40) to pay for the reach. L3 fires an energy beam (own FX and SFX) | Stage 10 |
| Custom wave count (§15): Campaign default, Custom 10–50; waves past the authored list are generated by `buildWaves`, heavies and bosses only from wave 41; growth halves past the authored length (`CUSTOM_GROWTH_TAIL` 0.5) | Stage 10, systems design |
| Three new maps (§7–8): Whiteout Relay (frost, tier 2), Blackwater Sluice (marsh, tier 3), Ossuary Deep (crystal hive-heart palette, tier 4); home order by tier | Stage 10, systems design |
| New-map balance to the tier ladder: Whiteout `g_map` 1.07 → 1.0725, Ossuary 1.08 → 1.095, Blackwater cash 700 → 750 plus wave edits (Husks at 1.5 s spacing, W8/W11 split) | Balance pass |
| UI moves from the SC1 riveted-metal console to an SC2-style navy glass look (Saira, state-ladder borders, gold CTA); `docs/design/ui-revamp.md` | Stage 10, UI art director |

## 13. Balance

Headless bots (`src/sim/autoplay.ts`) play every map × difficulty; `npm run balance` prints the full table (`src/sim/balance.report.test.ts`, excluded from `npm test`; ~225 s since the custom N = 50 block). Deterministic: same numbers, same table.

- **naive**: fixed build order on the max-coverage pad, alternates build/upgrade from 6 towers.
- **competent**: looks 3 waves ahead; per wave group estimates kill ratio *r* = damage the defense deals while the group walks past ÷ group effective HP (armor, size, shields, splash/chain, regen, overkill), expects `stake × e^(−r/2)` lives to leak and buys the build/upgrade that most reduces the sum of squared expected leaks per credit. Mixes towers and prepares for bosses without hard-coded rules. `competentStrategy(['picket'])` etc. gives the mono-tower variants.

Both bots use the command powers via `withPowers` (§14); one extra block runs the competent bot without them to show what the powers are worth. Targets (check against `npm run balance`, with powers):

- **Recruit:** comfortable everywhere; the naive bot wins it.
- **Veteran:** the competent bot wins maps 1–2; Hollow Spire's twin-boss final is the wall.
- **Elite:** wins Dust Ridge narrowly; loses maps 2–3 on their last waves.
- **Brutal:** dies mid-to-late on every map.
- **Mixing matters:** no single-tower build (`competentStrategy(['picket'])` etc.) beats the mixed bot; mono builds lose Cinder Forge and Hollow Spire on Veteran; Stasis alone never gets past W2.

**Stage 10 maps.** Competent bot with powers, Recruit / Veteran / Elite / Brutal (W = win, else the wave of the loss). Tuned 2026-10-16:

| Map (tier) | Campaign | Custom N = 50 |
|---|---|---|
| Whiteout Relay (2) | W · W · W (15 lives) · 18 | W · 47 · 31 · 19 |
| Blackwater Sluice (3) | W · 20 · 18 · 15 | 50 · 21 · 19 · 15 |
| Ossuary Deep (4) | W · 20 · 19 · 19 | 43 · 20 · 19 · 19 |

- **Whiteout** sits between Dust Ridge (wins all four) and Cinder Forge (loses Elite). Its wall is the Choir Mother final.
- **Blackwater** loses Veteran at the final, as Hollow Spire does. Its Elite and Brutal leaks are spread over the mid-to-late waves, not on one wall wave.
- **Ossuary** is the hardest map: it loses Veteran before or at the twin-boss final, and the Recruit win leaves 30 lives. The naive bot wins Recruit on every new map. No mono-tower build wins any new map on Veteran.
- **Bot sensitivity:** the competent bot is chaotic, so ±50 starting cash moves single cells by several waves. Blackwater Brutal is the most sensitive: it ranges from W11 (the mid-boss Colossus leaks) to W17 for 700–850 cash. The other cells keep their result across ±50 cash and ±0.0025 growth.

Known gaps:

- On Brutal without powers, Cinder Forge lasts longer than Dust Ridge (Dust's long single path gives the Choir Mother more births at the W8 mid boss).
- With powers, the competent bot wins Dust Ridge on Elite comfortably and on Brutal outright: one Lance on the W9 mid boss breaks the wall (with only the Lance it ends on 6 lives, with only mines on 2). Open design call.

## 14. Command powers (`src/data/powers.ts`)

Two orbital-support powers, free and unlimited, gated only by charge. They help a defense through a spike; towers still do the work.

**Charge** (both): sim time only (stops while paused, scales with game speed). Starts at **0 when wave 1 launches** (BEGIN ASSAULT), so idling in the build phase banks nothing. Charges between waves too; calling early trades charge time for credits. Recharging starts the moment a charge is spent; it holds at 0 while charges are full. No difficulty modifier: harder difficulties weaken the Lance only through enemy HP (`hpMult`, `growthAdd`).

| Hotkey | Power | Charge | Stored | Target | Effect |
|---|---|---|---|---|---|
| Q | Tremor Mines | 30 s | 3 | free path tile (not spawn/core, one mine per tile) | Armed mine waits, no expiry and no field cap. First enemy within 0.5 opens a slow field: radius 1.5, 8 s, **slow 60%** (lingers 0.5 s after leaving). No damage. |
| E | Lance Strike | 150 s | 1 | any tile | 1.5 s telegraph (reticle, no damage), then a 3 s beam: **6 pulses** 0.5 s apart on every enemy within 1.75. Pulse = 150 × `g_map`^(wave−1) Plasma (ignores armor, shields ×1.0). |

| Rule | Mines | Lance |
|---|---|---|
| Stacking | Slow goes through the normal slow rule (§2): strongest wins, so 60% beats Stasis L3's 50% and fields don't add up. Slowed enemies count as slowed for Stasis' prefers-unslowed. | Overlap impossible (1 charge). |
| Bosses | Take ×0.5 of the slow (30%). | Instead of pulse damage, each pulse deals `0.2 × (maxHp + maxShield) / 6`: a full strike takes **20%** of any boss, mid or final. |
| Slow-immune (Anvil Tread) | Triggers the mine (wastes it), is not slowed. | Normal. |
| Shields | No effect on slow. | Absorb first (×1.0), then HP; Plasma ignores armor. |
| Kills | — | Bounty paid as usual; no tower gets the kill or damage credit. |
| Airborne | None exist. If added: do not trigger and are not slowed. | Hit normally. |

**Expected impact** (Normal):

- **Lance:** at most 4–5 strikes per map (~1 per 3–4 waves; Dust ~690 s, Cinder ~855 s, Hollow ~780 s on Normal).
  - Non-boss enemies: 6 pulses deal 900 × `g_map`^(w−1) to a target that stays in the beam. Any L/M enemy dies in 1–2 pulses; a Brood Carrier dies on pulse 5 and its brood dies to pulse 6; an Anvil Tread is left at ~15%.
  - Hordes: a 24-Skitterling stream loses ~half (the beam catches ~5 at once plus ~1.7 more per pulse). A Husk or Rivet group in the beam is wiped.
  - Bosses: 20% per strike. Final bosses take ~1,350 (Dust Choir 6,780), ~2,400 (Cinder Colossus 8,890 + 3,080 sh) and ~2,600 / 3,000 (Hollow Choir 12,950 / Colossus 11,230 + 3,890 sh). Dust's ~150 s final boss walk allows a second strike at most.
- **Mines:** ~1.5 per wave cycle, 3 banked for a rush. One field turns a 3-tile crossing from 2.5 s to ~6 s for a Husk (1.2 t/s), and bunches streams for splash and chain. That is roughly one extra Stasis L2's worth per wave, aimed where needed.

**UX.**

- **Console:** two power buttons in a 1×2 column left of the tower grid, in the same tray with a divider. At ≤760 px they sit side by side in the cell under the command card (`'wave cmd' 'info pow'`).
- **Button:** icon, hotkey top-left, and a clockwise sweep fill over the uncharged part. Bottom-right shows `n/3` for mines and the seconds left for the Lance.
- **Ready state:** at ≥1 charge the border glows and the button reads READY. 0→1 charge plays a cue; the Lance also flashes "LANCE STRIKE READY".
- **Targeting:** Q/E (or a click on the button) arms targeting. It is exclusive with build mode and clears the tower selection.
  - Hover shows the tile highlight plus a ring: the mine's field footprint (1.5, teal) or the strike reticle (1.75, amber), red when invalid.
  - Left-click uses the power and leaves targeting. Shift keeps mine targeting while charges remain.
  - Esc, right-click or the same hotkey cancels.
- **Tooltip:** in the info panel (like the tower tip), with name, description, charge time, key numbers and the targeting hint. Before wave 1: "Charging begins with the assault".

**Look and sound** (original; player colours steel blue / gunmetal / amber, never hostile red or magenta):

- **Mine:** a small gunmetal disc (~0.3 tile) with three prongs and a steel-blue rim, seated in the path recess, with an amber LED blinking at 1 Hz. On trigger: a ground thump ring out to 1.5 tiles and a dust kick. The field is a low teal ring decal with tremor ripples every 0.5 s that fades over its last 1.5 s.
- **Lance telegraph:** a faint targeting thread from the sky and an amber triangular reticle at 1.75 whose brackets close in over 1.5 s. The center blinks, then flashes white 0.3 s before impact.
- **Lance beam:** a white-hot core (~0.6 tile) inside a steel-blue/violet column glow. Each pulse flashes the ground and throws a shock ring. A glassy scorch decal (r 1.5) fades over 10 s. Optional camera shake of ≤2 px on impact, off under reduced motion.
- **Audio** (WebAudio, synthesised):
  - ready: a two-tone console chirp, distinct from the wave-clear chime;
  - mine plant: a clunk and arming beep; mine trigger: a sub thump with a warble;
  - telegraph: a rising whine with targeting ticks; pulse 0: a deep boom; later pulses: a sizzling hum.

**Bots** (`npm run balance` stays meaningful): `withPowers(strategy)` wraps any strategy.

- **Mines:** whenever a charge is ready, plant on the free path tile covered by the most tower range rings, skipping tiles within 1.5 of an armed mine. Ties go to the tile nearer the core.
- **Lance:** when ready, target the tile of a living boss. Otherwise target the enemy tile whose 1.75 radius holds the most enemy HP + shields, and fire only if that is ≥ one full strike on one target (900 × `g_map`^(w−1)). No lead on fast targets.

## 15. Custom wave count (`src/data/waves.ts`)

The home screen offers **Campaign** (default: the map's authored waves, §8) or **Custom**: the player picks a run length **N = 10–50** waves (`CUSTOM_WAVES_MIN`/`MAX`, step 1). Every map's Campaign length (15–22) lies in that range, and picking it gives the Campaign list itself. The list is `buildWaves(map, N)`: pure and deterministic from map + N (no RNG, no seed), identical across difficulties. Past wave 40 only heavies and bosses come (`HEAVY_ONLY_FROM` = 41), ending in a multi-boss finale.

Why 10 and not 1: a closing boss needs a defense to meet. At N = 10 every map's closer sits at 0.89–1.04× its Campaign mid-boss pressure (closer HP ÷ cash earned before it). At N = 5 it would sit 20–40% above, a near-certain loss in the first 3 minutes with at most one Lance charge.

### Building the list (L = authored count, M = authored mid-boss wave, both 1-based)

| N | Waves 1..N−1 | Wave N (closer) |
|---|---|---|
| N = L | Campaign, unchanged (`map.waves`, same reference) | Campaign final |
| N ≤ M + 2 ("quick") | The first N−1 **non-boss** authored waves (skips M) | Authored mid-boss wave M, flag `'mid'` (×0.55 boss) |
| M + 2 < N < L ("truncated") | Authored 1..N−1 (keeps the mid boss at M, ≥3 waves before the closer) | Authored final wave, flag `'final'` |
| N > L ("extended") | Authored 1..L−1; wave L = authored final if L ≤ N−3, else a generated wave; L+1..N−1 generated | Generated finale, flag `'final'` |

Every run ends on a boss. **Boss clearance:** no boss wave sits in the two waves before the closer (that is why quick runs skip M and long runs drop the authored final when N ≤ L+2). The model puts truncated closers at 1.0–1.18× the Campaign closer's pressure, and quick closers at 0.9–1.04× the Campaign mid boss.

`WaveDef.boss` keeps its two values: `'mid'` = ×0.55 bosses with `MID_BOSS_BOUNTY`, `'final'` = full-strength bosses. In custom runs `'final'` also marks milestone and heavy-phase boss waves, so "last wave" is `index === waveCount − 1` and not the flag (the HUD "final assault" flash must check the index).

### Generated waves (waves L..N−1 of extended runs)

- **Budget** (base HP + shields before growth, the §8 curve continued): `B(w) = W1 × (1 + 0.25(w − 1))`. `W1` is the authored wave 1's pool. An enemy's pool is `hp + shield`, plus its brood-burst children (Brood Carrier = 885).
- **Roster:** `MapDef.roster`, or by default every enemy id in the authored waves, in order of first appearance. Classes come from `ENEMIES`: light, medium, heavy (`size === 'heavy' && !isBoss`), boss. **Heavy ids: `brood_carrier`, `anvil_tread`.** Bosses: `choir_mother`, `foundry_colossus`.
- **Shape**, rotating with `w % 4`. Each share becomes one group: id = `classIds[(w + k) % classIds.length]` (k = group index), count = `max(1, round(share × budget / pool(id)))`. If the roster lacks a class, its share falls back to heavy→medium→light (light→medium).

| `w % 4` | Shape | Shares |
|---|---|---|
| 0 | Swarm | light 60%, medium 40% |
| 1 | Line | medium 70%, light 30% |
| 2 | Armor | heavy 50%, medium 30%, light 20% |
| 3 | Siege | heavy 60%, medium 40% |

- **Paths:** group k goes on `allowed[(w + k) % allowed.length]`. `allowed` = all paths for light groups, and `MapDef.heavyPaths` (default: all paths) for medium, heavy and boss groups. Mediums follow heavies because generated counts grow with the budget: 15–21 Rivets through Ossuary's 14-tile sally port killed every Ossuary run by W26–33 in the balance pass; with lights only there, Recruit reaches W44 and Veteran W38.
- **Timing** (§8 defaults): interval L 0.4 s (0.3 s at count ≥ 16), M 0.9, H 1.8, boss 0. Groups are timed in list order: the first group on each path starts at 0, the next group on the same path starts 3 s after the previous one's last spawn. Round delays to 0.1 s.
- **Milestone bosses:** w ∈ {20, 30, 40} (w % 10 = 0), if generated and w ≤ N−3. The boss is `bosses[floor(w/2) % bosses.length]` (roster order) at full strength (`'final'`), listed first as group 0 on `heavyPaths[w % len]`. Its escort is the wave's shape at **0.5 × B(w)** (shape groups keep their own k for id and path), so by the timing rule escort groups on the boss's path start 3 s after it and the others at 0.

### Heavy phase (waves 41..N−1)

- **Odd waves**, and even waves inside the clearance: two heavy groups, `heavies[w % h]` at 60% of B(w) and `heavies[(w+1) % h]` at 40%, interval 1.8 s, on `heavyPaths`. That makes 5–9 heavies a wave (Dust W45: 3 Anvil + 2 Brood).
- **Even waves up to N−3** (42, 44, 46 at N = 50): one boss as for milestones, plus the two heavy groups at 0.5 × B(w).
- No lights or mediums are authored here. Choir Mother births and Brood Carrier bursts still spawn Skitterlings: that's their kit, not filler.

### Finale (wave N of an extended run)

- **K bosses:** N ≤ 40 → one of each boss in the roster (1–2); 41 ≤ N ≤ 49 → 2; N = 50 → 3.
- Boss ids are the roster bosses sorted by base speed descending (Choir 0.5 before Colossus 0.45), cycled to K, then sorted by speed again (stable): K = 3 with both bosses is Choir, Choir, Colossus. Plain cycling (Choir, Colossus, Choir) would put a faster boss behind a slower one and close the gap. Boss k spawns at `k × FINALE_BOSS_SPACING` (8 s) on `heavyPaths[k % len]`. Faster in front means the gaps only grow (≥3.6 tiles), so one Lance (radius 1.75) catches at most one boss, except where paths merge. That merge exception is a skill reward.
- **Escort:** 0.5 × B(N) as two heavy groups (N ≥ 41) or the `N % 4` shape (N ≤ 40). Every escort group starts 3 s after the last boss spawns (later groups on a shared path follow the timing rule).
- Size check: the W50 finale is about 1.8× wave 49, inside §8's "final ×1.6–2.3 of the wave before".

### HP scaling

`hp(w) = baseHp × diffHp × (g_map + g_diff)^e` with `e = hpExponent(i, L)` (i 0-based). That's `i` for authored waves, and `(L−1) + (i − (L−1)) × CUSTOM_GROWTH_TAIL` (0.5) past them. So Campaign and short runs are unchanged, and growth halves its rate after the authored length. Raw `g^49` reaches ×17–85 (a W50 Hollow Choir Mother at 130k HP); the tail keeps W50 at ×6–24.

| Map (L) | W50 growth (raw) | Choir Mother W50: Recruit / Veteran / Brutal | Lance pulse W50 (full strike) | Anvil Tread W50 HP+sh (Veteran) |
|---|---|---|---|---|
| Dust Ridge (15) | ×6.3 (×17.4) | 10.5k / 18.8k / 27.0k | 940 (5.6k) | 6.6k |
| Whiteout Relay (18) | ×10.1 (×30.9) | 16.6k / 30.2k / 43.7k | 1,511 (9.1k) | 10.6k |
| Cinder Forge (18) | ×10.9 (×34.6) | 18.0k / 32.6k / 47.2k | 1,631 (9.8k) | 11.4k |
| Blackwater Sluice (20) | ×13.7 (×43.4) | 22.5k / 41.1k / 59.8k | 2,054 (12.3k) | 14.4k |
| Hollow Spire (20) | ×13.7 (×43.4) | 22.5k / 41.1k / 59.8k | 2,054 (12.3k) | 14.4k |
| Ossuary Deep (22) | ×24.0 (×85.4) | 39.1k / 71.9k / 105.0k | 3,594 (21.6k) | 25.2k |

Pressure model (wave HP ÷ cash earned before it): the heavy phase holds about 1.4–1.6 on Dust, about 2.3–2.7 on tier-2 maps and about 3.0–4.3 on tier 3–4. That's 1.0–1.7× each map's own Campaign final, rising slowly, with the finale as the spike. (Modelled before the balance pass raised Whiteout and Ossuary growth; Ossuary now sits above that band.) `CUSTOM_GROWTH_TAIL` is the one knob the balance pass turns.

### Economy

**No new rules.** Bounty stays flat (§5) and the clear bonus stays `30 + 6w`: 276–330 cr in the heavy phase, doubled on boss waves.

- **Income:** cumulative income at W50 is about 24–33k cr per map.
- **Cash-bound maps:** income is the limit on cash-bound maps. Dust Ridge never fills its 86 pads (all pads at L3 ≈ 40k), so every wave there is still a spending decision.
- **Pad-bound maps:** income outruns the pads on pad-bound maps (all pads at L3 ≈ pads × 460 cr). They saturate around Ossuary W24, Hollow W29, Sluice W38, Cinder W44 and Whiteout W45. From there the run is pure endurance: the "upgrades over count" identity of those maps taken to its end. That is deliberate.
- **Bounty dip:** heavy-phase bounty runs lower per HP (Anvil 0.053 cr/HP vs ~0.085 average). The linear clear bonus covers most of the gap.
- **Interest:** none, still.

### Difficulty and Command Powers

- **Difficulty:** unchanged and orthogonal. `hpMult` and `growthAdd` apply as in §6; the tail exponent applies to `g_map + g_diff`. Wave content and N are identical across difficulties.
- **Lance pulse:** `150 × g_map^hpExponent(i, L)` (no `g_diff`, as in §14). It tracks enemy HP on Veteran: a full strike still leaves a W50 Anvil at ~15%, as at W1. On Brutal it falls behind the curve (W50 Hollow ×13.7 vs ×20.7), as intended by §14.
- **Lance on bosses:** the 20% boss share is a fraction, so it scales by itself (8.2k of a W50 Hollow Choir).
- **Lance supply:** a 50-wave run lasts roughly 45–60 min of sim time, about 18–24 Lance charges. Only one can be stored, so the finale sees 1–2 strikes: 20% of one boss each.
- **Mines:** unchanged. Bosses take 30%; Anvils ignore them, so the heavy phase leans on slow-immune Anvils by design (towers, not mines, answer the heavy phase).

### HUD and home (for `docs/design/ui-revamp.md`)

- **Home** (as built, `ui-revamp.md` §3.3): a `Campaign · L` | `Custom` switch. Custom shows a −/+ stepper with a 10–50 range slider (ticks every 10 plus 41, hatched heavy zone from 41); its first value is the map's campaign length, then the last pick. At ≥ 41 a red note and a `!` badge warn "bosses and heavies only". Mode and count persist like map and difficulty. Map tiles always show the campaign length; the briefing's Waves row shows the chosen N. Start passes `{ mapId, difficultyId, waveCount }`, with `waveCount` undefined for Campaign.
- **HUD:** `WAVE 07 / 50` (`waveIndex + 1` / `waveCount`, two digits) in both modes, a wave bar with boss ticks (plus a wave-41 tick), and a small `CUSTOM` chip in custom runs (hidden when N equals the campaign length).
- **Wave 41 flash:** a "Heavy assault" warning toast when wave 41 launches (`src/main.ts`), alongside the wave-41 tick and the home warning.
- **Boss flash:** "Final assault" only on the last wave; other `'final'` waves get "massive signature".
- **Next-wave preview and summary:** both read `buildWaves(MAPS[mapId], waveCount)` (compute once per run), never `map.waves`. The summary shows "Waves 50 / 50 cleared".

### Bots and balance

- **Autoplay:** `threats()` reads `buildWaves(map, game.state.waveCount)`, and the Lance threshold uses `hpExponent`. `runAutoplay` already takes `SimConfig`, so `waveCount` passes through. A 50-wave run needs `maxSteps` ≈ `60 × 60 × 180`.
- **`npm run balance`** gains a block "Custom runs (competent + powers)": every map × difficulty at N = 50, and every map at N = 10 on Veteran.
- **Targets:**
  - N = 10, Veteran: wins every map.
  - N = 50, Recruit: reaches the heavy phase (W41+) everywhere and wins tiers 1–2.
  - N = 50, Veteran: ≥ W30 on every map whose Campaign final the bot clears, wins at most Dust Ridge. Where the Campaign bot already loses at or before the authored final (Sluice, Hollow and Ossuary on Veteran), the custom run dies there too: waves 1..L of an N ≥ L+3 run *are* the Campaign.
  - N = 50, Elite and Brutal: dies before W45 everywhere.
- **Results** (2026-10-16 after the new-map balance pass, `CUSTOM_GROWTH_TAIL` 0.5; wave reached, W = win):

| N = 50 | Recruit | Veteran | Elite | Brutal |
|---|---|---|---|---|
| Dust Ridge | W | W | W | 50 |
| Whiteout Relay | W | 47 | 31 | 19 |
| Cinder Forge | W | 50 | 19 | 19 |
| Blackwater Sluice | 50 | 21 | 19 | 15 |
| Hollow Spire | 46 | 21 | 17 | 17 |
| Ossuary Deep | 43 | 20 | 19 | 19 |

  N = 10 Veteran wins every map on 20 lives. Off target: **Dust Ridge Elite wins and Brutal reaches the finale**. That is the §13 known gap (with powers the bot already wins Campaign Dust on Brutal), and Dust's heavy-phase pressure (~1.5) is the lowest by design. Elite and Brutal deaths at W15–21 elsewhere are the Campaign walls, not the generator. Whiteout Elite, which wins its Campaign, reaches W31. Ossuary Veteran now dies where its Campaign run does (W20, before the W22 final), since its growth went 1.08 → 1.095.
- **Tail sensitivity** (N = 50, wave reached; measured before the new-map balance pass): `CUSTOM_GROWTH_TAIL` 0.4 makes Dust Brutal a win and Cinder Veteran a win; 0.6 keeps Dust Elite at the finale (loss at 50) but cuts Whiteout Veteran to 43 and Elite to 31, and Recruit Sluice/Hollow to 47/43. One global knob can't pull Dust down without breaking tier 2–3, so it stays 0.5. If Dust Elite should lose, the fix is per-map (a harder Dust roster or a per-map tail, which would need a `MapDef` field), or the §13 Lance-on-mid-boss call.

### Contract

| What | Where |
|---|---|
| `SimConfig.waveCount?: number` (undefined = Campaign; rounded and clamped by `clampWaveCount`, NaN throws; never rejected) | `src/sim/types.ts` |
| `GameState.waveCount` = N; wave list = `buildWaves(MAPS[mapId], waveCount)` (not stored on state) | `src/sim/types.ts` |
| `CUSTOM_WAVES_MIN` 10, `CUSTOM_WAVES_MAX` 50, `HEAVY_ONLY_FROM` 41, `CUSTOM_GROWTH_TAIL` 0.5, `FINALE_BOSS_SPACING` 8 | `src/data/waves.ts` |
| `hpExponent(waveIndex, authoredCount)`, `clampWaveCount(count)`, `buildWaves(map, count?)`, all re-exported from `src/data` | `src/data/waves.ts` |
| `MapDef.roster?: EnemyId[]` (default: enemies in `waves`), `MapDef.heavyPaths?: number[]` (default: all) | `src/data/types.ts` |

Other rules stay local constants inside `buildWaves`: milestone every 10, clearance 2, escort share 0.5, the shape table, and finale K.
