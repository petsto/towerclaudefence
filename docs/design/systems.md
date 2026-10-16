# Core Systems

> Superseded by docs/GDD.md where they conflict.

Owner: systems design. Authoritative for combat rules, towers, economy, difficulty and wave scaling.
Per-enemy stats live in `enemies.md`, map layouts in `maps.md`. Where this doc overrides either, see §9.
Currency is **Credits** (cr). All times in seconds, distances in tiles (1 tile = 1 world unit).

## 1. Design pillars

- **Matchups over mass.** Damage type × size class plus flat armor means the *right* tower beats *more* towers.
- **Tiles are the scarce resource.** Upgrades are ~15–25% less cash-efficient than new towers but far more tile-efficient; tight maps (Hollow Spire, 22 pads) reward upgrading.
- **Deterministic and readable.** No RNG anywhere in combat: no crits, misses or random spawns. Same inputs, same outcome. Enables headless balance runs.
- **Pressure, not punishment.** Gentle exponential HP ramp against flat bounties; greed (early wave calls) is opt-in.
- **Every tower has a job.** Verified in §8: each tower leads at least one matchup column, none leads all.

## 2. Damage model

### 2.1 Type × size multipliers

| Damage type | LIGHT | MEDIUM | HEAVY | Armor applies | vs Shields |
|---|---|---|---|---|---|
| Normal | 1.00 | 1.00 | 1.00 | yes | ×1.0 |
| Concussive | 1.00 | 0.50 | 0.25 | yes | ×1.0 |
| Explosive | 0.50 | 0.75 | 1.00 | yes | ×1.0 |
| Plasma | 1.00 | 1.00 | 1.00 | **no** | ×1.5 (×2.0 at Arc Coil L3) |

Bosses use HEAVY. Size multipliers never apply to shields.

### 2.2 Hit resolution (per target, per hit)

1. `d` = tower damage (after upgrades; × splash ring factor for splash victims; × chain falloff for chain jumps).
2. **Shields** (if `shield > 0`): `s = d × shieldMult` (1.0, Plasma 1.5/2.0). `absorbed = min(shield, s)`; `shield -= absorbed`; `d = d × (1 − absorbed / s)`. If `d == 0`, stop. Shields have no armor.
3. **HP:** `armorEff = (Plasma ? 0 : armor)`; `hpDmg = max(0.5, (d − armorEff) × sizeMult)`; `hp -= hpDmg`.
4. Any damage (shield or HP) sets `lastDamagedTick` (drives shield-reboot abilities).
5. `hp ≤ 0` → dies this tick; bounty paid; death abilities (Brood burst) trigger.

Armor is subtracted **before** the size multiplier. Floor 0.5 applies only when step 3 runs. Keep HP as float; display `ceil(hp)`.

### 2.3 Shields — decision: yes, Remnant only

Shields absorb full damage regardless of type/size, with no armor. Consequence (intended, SC1-like): Concussive/Explosive towers pop shields at full strength even on the wrong size class, then fall off on the HP underneath. Shields regenerate **only** if the enemy's ability says so (`enemies.md`: Rivet Walker, Foundry Colossus).

### 2.4 Status effects

| Effect | Rule |
|---|---|
| Slow | `speed × (1 − slow)`. Does not stack: strongest active slow wins; reapplying refreshes duration. Bosses take half the slow %. `anvil_tread` immune. |
| Splash | Primary target takes 100%. Others: 100% within `0.5R`, 50% from `0.5R` to `R` (distance to enemy center). No friendly fire. |
| Chain | From last hit enemy, jump to the nearest enemy within 2.0 tiles not yet hit by this zap (tie: lowest spawn id). Each jump ×0.75 of the previous jump's damage. Ignores tower range. |
| Execute | Rail only: after the hit, if `shield == 0` and `hp ≤ threshold × maxHp` and not boss → `hp = 0`. |

## 3. Towers

Defaults: placement only on `B` tiles, one tower per tile, towers never block the path. Build and upgrade are instant.
Upgrade costs follow L2 = 0.75 × base, L3 = 1.25 × base (rounded to 5).
**Sell:** 70% of total invested. **Undo:** 100% if no enemy has spawned since the tower was bought or last upgraded.

### 3.1 Base stats (L1)

| Tower | Fantasy | Cost | Dmg | Type | Cooldown | Range | Delivery | Splash R | Special | Default target |
|---|---|---|---|---|---|---|---|---|---|---|
| **Picket Autocannon** | Bolted-down twin autocannon; the corps' first answer to anything soft. | 100 | 6 | Normal | 0.40 | 3.5 | Hitscan | — | — | First |
| **Thumper Mortar** | Lobs concussion shells that turn swarms into paste. | 150 | 20 | Concussive | 2.00 | 4.5 (min 1.0) | Lobbed shell, 5 t/s, tracks target | 1.25 | Shell lands at target's last position if it dies in flight | First |
| **Stasis Projector** | Cryo-field beam that drags anything to a crawl. | 120 | 4 | Concussive | 1.00 | 3.0 | Beam (continuous visual, damage on cooldown) | — | Slow 35% for 2.0 s | First, prefers not-slowed and not slow-immune |
| **Longshot Railgun** | Mag-rail marksman post on a tall gantry; one shot, one problem solved. | 175 | 50 | Normal | 2.50 | 7.0 | Hitscan | — | Execute ≤ 10% max HP | Strongest |
| **Breacher Missile Pod** | Armor-cracking warheads for things with treads or plates. | 200 | 35 ×2 | Explosive | 2.00 | 4.0 | Homing missiles, 7 t/s, salvo 0.15 s apart | — | Missile fizzles if its target dies | Strongest |
| **Arc Coil** | Overcharged capacitor stack that arcs plasma through packed ranks. | 160 | 14 | Plasma | 1.25 | 3.0 | Instant chain | — | Chains to 3 extra targets | First |

### 3.2 Upgrades (deltas from previous level)

| Tower | L2 cost | L2 changes | L3 cost | L3 changes | Total invested |
|---|---|---|---|---|---|
| Picket | 75 | dmg 6→9 | 125 | dmg 9→12, cd 0.40→0.30, range 3.5→4.0 | 300 |
| Thumper | 110 | dmg 20→30, splash 1.25→1.5 | 190 | dmg 30→44, cd 2.00→1.75 | 450 |
| Stasis | 90 | slow 35→45%, duration 2.0→2.5 s, range 3.0→3.5 | 150 | slow 45→50%, dmg 4→8, beam forks to 3 targets | 360 |
| Longshot | 130 | dmg 50→80, range 7.0→7.5 | 220 | dmg 80→120, cd 2.50→2.20, execute 10→15% | 525 |
| Breacher | 150 | missile dmg 35→50 | 250 | salvo 2→3 missiles, cd 2.00→1.80, range 4.0→4.5 | 600 |
| Arc Coil | 120 | dmg 14→20, chain 3→4 extra | 200 | dmg 20→26, cd 1.25→1.00, shield mult 1.5→2.0 | 480 |

Picket gains the most from upgrades against armor (bigger hits shrug off flat armor) — its late-game path.

## 4. Targeting and sim rules

| Rule | Value |
|---|---|
| Sim tick | Fixed 1/60 s. Game speed 1×/2×/3× = 1/2/3 sim ticks per rendered frame. Pause = 0. |
| Range check | Euclidean on ground plane, tower tile center → enemy center ≤ range. Enemy radius ignored. |
| Movement | Enemies follow their path polyline (waypoints = tile centers) at `speed` t/s. Track `distanceToCore` (remaining path length). |
| Target selection | Re-evaluated each time a tower is ready to fire (cooldown ≤ 0); no sticky targets. Tie-break: lowest spawn id. |
| Priorities (player-cyclable) | **First** = min `distanceToCore` (works across merging paths) · **Last** = max · **Strongest** = max `hp + shield` · **Weakest** = min `hp + shield` · **Closest** = min distance to tower |
| Firing | Cooldown starts on fire. No target in range → tower idles with cooldown at 0 and fires the tick a target enters. |
| Projectiles | Damage snapshot at fire time, applied on impact. Homing; cannot miss a living target. |
| Leak | Enemy reaching the core: remove, subtract lives (§5.3), no bounty. Lives ≤ 0 → defeat at end of tick. |
| Victory | Final wave fully spawned and no enemies alive. |

## 5. Economy

### 5.1 Income sources

| Source | Amount (Normal) |
|---|---|
| Starting cash | Dust Ridge 500 · Cinder Forge 550 · Hollow Spire 600 |
| Kill bounty | Per enemy, table below. Flat — does **not** scale with wave. |
| Wave-clear bonus | `20 + 5 × wave` when every enemy of that wave (incl. spawned children) is dead or leaked |
| Early-call bonus | `3 cr × floor(seconds left on countdown)`, max 60 |
| Interest | **None.** Interest rewards hoarding, conflicts with early-call greed and compounds unpredictably with exponential HP. |

### 5.2 Bounty per enemy (cr) — `enemies.md` values × 4

| Class | Enemy: bounty |
|---|---|
| LIGHT | Skitterling 4 · Spindle Drone 8 |
| MEDIUM | Husk Crawler 16 · Rivet Walker 20 · Mender Unit 24 |
| HEAVY | Brood Carrier 48 (+3 Skitterlings = 60) · Anvil Tread 56 |
| BOSS | Choir Mother 400 · Foundry Colossus 400 (mid-map boss variant: 200) |

Rule of thumb for new enemies: ≈ 0.085 cr per base effective HP (HP + shields), +25% for a support ability.

### 5.3 Lives

Default **20** (Normal). Leak cost: LIGHT 1 · MEDIUM 2 · HEAVY 5 · BOSS 20. A boss leak ends the run on Normal and above — intended.

### 5.4 Wave timeline

Wave 1 launches when the player presses **CALL WAVE**. When wave *w* finishes spawning, a **20 s** countdown to wave *w+1* starts; at 0 it auto-launches. Pressing CALL WAVE during the countdown launches immediately and pays the early-call bonus. Waves may overlap on the field.

## 6. Difficulty

| Modifier | Easy | Normal | Hard | Brutal |
|---|---|---|---|---|
| Enemy HP & shields | ×0.75 | ×1.00 | ×1.25 | ×1.50 |
| HP growth `g` | −0.010 | +0 | +0.010 | +0.015 |
| Enemy speed | ×0.90 | ×1.00 | ×1.10 | ×1.15 |
| Enemy armor | +0 | +0 | +0 | +1 |
| Bounty, clear & early-call bonus | ×1.25 | ×1.00 | ×0.90 | ×0.80 |
| Starting cash | ×1.30 | ×1.00 | ×0.90 | ×0.80 |
| Lives | 30 | 20 | 15 | 10 |

Round cash results down to integers. Wave count and composition are identical across difficulties.

## 7. Wave formula

**HP scaling.** `hp(w) = baseHp × diffHp × (g_map + g_diff)^(w − 1)`; shields scale identically. Armor and speed do not scale per wave. Bosses scale too.

| Map | Waves | `g_map` | Final-wave HP multiplier (Normal) | Mid boss | Final boss |
|---|---|---|---|---|---|
| Dust Ridge Outpost | 15 | 1.070 | ×2.6 | wave 8 | wave 15 |
| Cinder Forge | 18 | 1.085 | ×4.0 | wave 9 | wave 18 |
| Hollow Spire | 20 | 1.100 | ×6.1 | wave 10 | wave 20 |

Rough pressure model (wave HP ÷ cumulative cash, wave 1 = 1.0; flat bounties, count growing ~25%/wave): final wave ≈ 1.8 / 2.6 / 3.9. That is "exponentially slightly harder". `maps.md`'s 1.10/1.12/1.14 gives 2.5 / 4.0 / 6.9 and makes Hollow Spire Hard nearly impossible.

**Composition.** Waves are hand-authored in map data as ordered groups: `{ enemyId, count, spacing, pathId, delayAfterPrevGroup }`. Defaults:

| Field | Default |
|---|---|
| Spacing | LIGHT 0.4 s · MEDIUM 0.9 s · HEAVY 1.8 s · BOSS n/a (single) |
| Gap between groups | 3.0 s |
| Count growth | ~+25% of wave-1 HP pool per wave (pre-`g`), via more groups or heavier mix (see `enemies.md` §5 phasing) |
| Boss waves | Mid boss = same boss at ×0.5 HP, 200 bounty. Final boss always last group, escorts spawn 3 s after it. Boss waves pay ×2 clear bonus. |
| Two-spawn maps | `pathId` per group; Cinder Forge alternates paths until wave 6, Hollow Spire uses both from wave 1 (per `maps.md`). |

Spacing converts to ticks with `round(seconds × 60)`.

## 8. Sanity check — DPS per 100 cr (L1)

Reference armor: LIGHT 0, MEDIUM 2, HEAVY 3 (roster averages). Group assumptions: Thumper splash hits ~3.5 light / 2 medium / 1 heavy target-equivalents; Arc chain multiplier 2.73× / 1.75× / 1.0× (packed lights, spaced mediums, lone heavies). Unshielded.

| Tower | vs LIGHT | vs MEDIUM | vs HEAVY | Niche |
|---|---|---|---|---|
| Picket | 15.0 (single) | 10.0 | 7.5 | Cheapest entry, best single-target vs light, scales with upgrades vs armor |
| Thumper | **23.3** (packed) | 6.0 | 1.4 | Swarm clear; useless on heavies' HP |
| Stasis | 3.3 | 0.8 | 0.4 | Force multiplier: 35% slow = 1.54× time-in-range for every tower covering the slowed zone |
| Longshot | 11.4 | 11.0 | 10.7 | Never best, never bad; 7.0 range covers ~4× the area of a 3.5 tower |
| Breacher | 8.75 | **12.4** | **16.0** | Heavy killer; wasteful on light |
| Arc Coil | 19.1 (packed) / 7.0 (single) | 12.25 | 7.0 | Shields (×1.5) and armor-ignoring; group-dependent |

Medium is deliberately contested (Breacher 12.4, Arc 12.25, Longshot 11.0, Picket 10.0); enemy abilities break the tie: Rivet shields → Arc, Husk regen → burst (Breacher/Longshot), Mender → Longshot snipes it (Strongest/Weakest priority). No tower leads more than two columns, and the one leading two (Breacher) is the worst against light, which dominates early waves.

Worked examples: Picket vs Anvil Tread (a4) = (6−4)×1 = 2/hit. Thumper vs Anvil = 20 to shields (full), then (20−4)×0.25 = 4 to HP. Arc vs Anvil shields = 21/hit, HP = 14/hit. Stasis vs any heavy = 0.5 floor.

## 9. Overrides and open questions for synthesis

| Topic | Other doc says | This doc | Why |
|---|---|---|---|
| HP growth | `maps.md`: 1.10 / 1.12 / 1.14 | 1.07 / 1.085 / 1.10 | §7 pressure model; difficulty adds up to +0.015 on top |
| Bounty | `enemies.md`: 1–14, boss 100 | × 4 | Matches tower costs (100–200 cr) |
| Wave count / bosses | `enemies.md` §5: ~30 waves, bosses at 10/20/30 | 15/18/20 waves (per `maps.md`), boss at midpoint + final | `enemies.md` phasing should compress to the map's wave count proportionally |

Open: whether Stasis slow should affect bosses at 50% (current) or 0%; whether Breacher missiles should retarget instead of fizzling (adds overkill tolerance; skipped for simplicity). Balance stage (6) tunes `g_map`, starting cash and the §8 assumptions with headless runs.

## 10. Custom wave count (Stage 10)

Spec lives in GDD §15 (`src/data/waves.ts`):

- **Run length:** Campaign or 10–50 waves. Authored prefix plus boss closer for short runs; generated waves for long runs, heavies and bosses only from W41, multi-boss finale.
- **HP growth:** halves its rate past the authored waves (`hpExponent`, `CUSTOM_GROWTH_TAIL` 0.5).
- **Economy:** no new rules.
