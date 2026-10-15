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
| Longshot | 130: dmg 70, range 6.0 | 220: dmg 105, cd 2.40, execute 15% | 575 |
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
| Starting cash | Dust Ridge 600 · Cinder Forge 650 · Hollow Spire 700 |
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

Tile legend: `.` ground · `#` path · `B` build · `S` spawn · `C` core · `x` decor. Strategy notes per map: `docs/design/maps.md`.

## 8. Waves

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

## 9. Game flow

State machine: `docs/architecture.md`.

- **Home:** map cards (thumbnail from map data, name, biome, wave count) and a 4-way difficulty switch.
- **Playing:** sim runs; before wave 1 the player builds freely and presses CALL WAVE.
- **Paused:** sim stops; only resume/speed commands accepted. Menu: Resume, Restart, Quit to Home.
- **Victory/Defeat:** summary (waves cleared, lives left), buttons Retry and Home. Sim is discarded on Home.

## 10. Controls

Key bindings: `README.md`. Towers use number keys `1`–`6` so WASD stays free for camera panning.

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

## 13. Balance

Headless bots (`src/sim/autoplay.ts`) play every map × difficulty; `npm run balance` prints the full table (`src/sim/balance.report.test.ts`, excluded from `npm test`; ~10 s). Deterministic: same numbers, same table.

- **naive**: fixed build order on the max-coverage pad, alternates build/upgrade from 6 towers.
- **competent**: looks 3 waves ahead; per wave group estimates kill ratio *r* = damage the defense deals while the group walks past ÷ group effective HP (armor, size, shields, splash/chain, regen, overkill), expects `stake × e^(−r/2)` lives to leak and buys the build/upgrade that most reduces the sum of squared expected leaks per credit. Mixes towers and prepares for bosses without hard-coded rules. `competentStrategy(['picket'])` etc. gives the mono-tower variants.

Both bots use the command powers via `withPowers` (§14); one extra block runs the competent bot without them to show what the powers are worth. Targets (check against `npm run balance`, with powers):

- **Recruit:** comfortable everywhere; the naive bot wins it.
- **Veteran:** the competent bot wins maps 1–2; Hollow Spire's twin-boss final is the wall.
- **Elite:** wins Dust Ridge narrowly; loses maps 2–3 on their last waves.
- **Brutal:** dies mid-to-late on every map.
- **Mixing matters:** no single-tower build (`competentStrategy(['picket'])` etc.) beats the mixed bot; mono builds lose Cinder Forge and Hollow Spire on Veteran; Stasis alone never gets past W2.

Known gap: on Brutal, Cinder Forge lasts longer than Dust Ridge (Dust's long single path gives the Choir Mother more births at the W8 mid boss).

## 14. Command powers (`src/data/powers.ts`)

Two orbital-support powers, free and unlimited, gated only by charge. They help a defense through a spike; towers still do the work.

**Charge** (both): sim time only (stops while paused, scales with game speed). Starts at **0 when wave 1 launches** (BEGIN ASSAULT), so idling in the build phase banks nothing. Charges between waves too; calling early trades charge time for credits. Recharging starts the moment a charge is spent; it holds at 0 while charges are full. No difficulty modifier: harder difficulties weaken the Lance only through enemy HP (`hpMult`, `growthAdd`).

| Hotkey | Power | Charge | Stored | Target | Effect |
|---|---|---|---|---|---|
| Q | Tremor Mines | 30 s | 3 | free path tile (not spawn/core, one mine per tile) | Armed mine waits, no expiry and no field cap. First enemy within 0.5 opens a slow field: radius 1.5, 8 s, **slow 60%** (lingers 0.5 s after leaving). No damage. |
| E | Lance Strike | 120 s | 1 | any tile | 1.5 s telegraph (reticle, no damage), then a 3 s beam: **6 pulses** 0.5 s apart on every enemy within 1.75. Pulse = 150 × `g_map`^(wave−1) Plasma (ignores armor, shields ×1.0). |

| Rule | Mines | Lance |
|---|---|---|
| Stacking | Slow goes through the normal slow rule (§2): strongest wins, so 60% beats Stasis L3's 50% and fields don't add up. Slowed enemies count as slowed for Stasis' prefers-unslowed. | Overlap impossible (1 charge). |
| Bosses | Take ×0.5 of the slow (30%). | Instead of pulse damage, each pulse deals `0.2 × (maxHp + maxShield) / 6`: a full strike takes **20%** of any boss, mid or final. |
| Slow-immune (Anvil Tread) | Triggers the mine (wastes it), is not slowed. | Normal. |
| Shields | No effect on slow. | Absorb first (×1.0), then HP; Plasma ignores armor. |
| Kills | — | Bounty paid as usual; no tower gets the kill or damage credit. |
| Airborne | None exist. If added: do not trigger and are not slowed. | Hit normally. |

**Expected impact** (Normal):

- **Lance:** about 5–8 strikes per map (~1 per 2–3 waves).
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
