# Enemies & Creatures

> Superseded by docs/GDD.md where they conflict.

Scope: v1 roster, ground units only (no air). Numbers are starting values for the balance pass (stage 6), not final.
Damage/armor/shield *rules* live in `docs/design/systems.md`; this doc only supplies per-enemy stats.

## 1. Factions

### The Chorus (bio-swarm) — organic
A planet-spanning hive organism that seeded itself on the colony world long before humans arrived. It does not think in individuals: every creature is a limb of a single slow mind that "sings" through pheromone and chitin resonance. It wants the colony's geothermal taps, and it is patient.

**Visual identity:** wet chitin, bulbous sacs, segmented legs, no straight lines. Palette: deep violet body, ochre/bone plating, magenta bio-glow in sacs and mouths.

| Token | Hex | Use |
|---|---|---|
| chorus-dark | `#2e1a3d` | shadowed carapace, legs |
| chorus-body | `#5e3a7a` | main flesh |
| chorus-plate | `#c8962e` | ochre armor plates |
| chorus-bone | `#d8c8a0` | claws, spines, teeth |
| chorus-glow | `#e05ab8` | sacs, eyes (emissive) |

### The Remnant (rogue machine collective) — mechanical
Automated mining and construction rigs left by a failed first colony wave, whose control lattice drifted for forty years and woke up hostile. They strip anything metal to build more of themselves, and they treat the new colony as raw stock. Old corporate hazard markings still show through the rust.

**Visual identity:** boxy hulls, treads and piston legs, exposed cylinders, single red optics. Palette: rust and gunmetal, hazard-yellow stripes, red emissive eyes, cold blue shield shimmer.

| Token | Hex | Use |
|---|---|---|
| remnant-steel | `#2e3238` | chassis, treads |
| remnant-gunmetal | `#4a5058` | main panels |
| remnant-rust | `#8a4a2a` | weathered plating |
| remnant-hazard | `#d8a820` | stripes, warning lights |
| remnant-optic | `#ff2a1a` | eyes (emissive) |
| remnant-shield | `#8ad0ff` | shield bubble (additive, ~25% opacity) |

## 2. Roster

Speed is tiles/second. Armor is flat reduction per hit (applied to HP damage). Shields absorb damage before HP; how damage types and armor interact with shields is defined in `systems.md`. Shields do **not** regenerate unless the enemy's ability says so.

| ID | Name | Faction | Size | HP | Armor | Shields | Speed | Lives | Bounty | Ability |
|---|---|---|---|---|---|---|---|---|---|---|
| `skitterling` | Skitterling | Chorus | LIGHT | 45 | 0 | — | 2.0 | 1 | 1 | — (fodder; also spawned by others) |
| `husk_crawler` | Husk Crawler | Chorus | MEDIUM | 220 | 1 | — | 1.2 | 2 | 4 | **Regenerate:** +4 HP/s, always on, capped at max HP |
| `brood_carrier` | Brood Carrier | Chorus | HEAVY | 750 | 2 | — | 0.7 | 5 | 12 | **Brood burst:** on death spawns 3 Skitterlings at its path position (spread ±0.2 tiles back along path) |
| `choir_mother` | Choir Mother (boss) | Chorus | HEAVY | 5000 | 3 | — | 0.5 | 20 | 100 | **Birthing:** every 8 s spawns 2 Skitterlings 0.3 tiles behind it on the path |
| `spindle_drone` | Spindle Drone | Remnant | LIGHT | 35 | 1 | 15 | 2.2 | 1 | 2 | — |
| `rivet_walker` | Rivet Walker | Remnant | MEDIUM | 160 | 2 | 60 | 1.0 | 2 | 5 | **Shield reboot:** shields regen 15/s after 2.5 s without taking damage |
| `mender_unit` | Mender Unit | Remnant | MEDIUM | 120 | 1 | 40 | 1.3 | 2 | 6 | **Repair field:** heals other enemies within 2 tiles for 6 HP/s (HP only, not self, not shields; does not stack — an enemy takes the single strongest heal) |
| `anvil_tread` | Anvil Tread | Remnant | HEAVY | 900 | 4 | 150 | 0.55 | 5 | 14 | **Inertial mass:** immune to slow effects |
| `foundry_colossus` | Foundry Colossus (boss) | Remnant | HEAVY | 4500 | 4 | 1500 | 0.45 | 20 | 100 | **Bulwark core:** shields regen 60/s after 4 s without taking damage |

Notes for implementation:
- Bosses carry an `isBoss` flag (HUD health bar, warning siren) but use the HEAVY size class for damage multipliers.
- Spawned Skitterlings give normal bounty (1) and normal leak cost. Brood burst / Birthing children inherit the parent's path progress so they never "teleport" backwards past a tower line. All spawn timing is tick-based (deterministic).
- Regen/heal/shield-regen all run on the fixed sim tick; "without taking damage" means a per-enemy `lastDamagedTick` counter.
- Mender Unit is the priority-target lesson: kill it first or the wave out-heals light DPS.

## 3. Visual construction notes

Scale: 1 tile = 1 world unit. Heights are top of model. All meshes flat-shaded (`flatShading: true`), low segment counts (spheres 8×6, cylinders 6–8 sides). Emissive parts use the glow/optic color as `emissive`. Models face +X along path direction.

| Enemy | Construction |
|---|---|
| **Skitterling** (~0.35 × 0.25 h) | Body: sphere r 0.12 squashed (scale y 0.6) `#5e3a7a`; head: smaller sphere r 0.07 front `#2e1a3d` with two tiny emissive spheres `#e05ab8` for eyes. 6 legs: thin cones (r 0.015, len 0.14) angled out/down `#d8c8a0`. Anim: legs alternate ±20° wiggle at 10 Hz, body bob 0.02 at 10 Hz. |
| **Husk Crawler** (~0.6 × 0.35 h) | Segmented body: 3 spheres r 0.14/0.16/0.12 in a row `#5e3a7a`, ochre box plates (0.18×0.04×0.16) on top of each `#c8962e`. Front mandibles: 2 cones `#d8c8a0`. Glowing sac: sphere r 0.07 on rear segment, emissive `#e05ab8`. Anim: segments undulate (sin y offset, phase-shifted per segment); sac pulses scale 1.0–1.2 at 2 Hz (pulse faster while regenerating below max). |
| **Brood Carrier** (~0.9 × 0.6 h) | Bloated abdomen: sphere r 0.3 `#5e3a7a` with 4–5 small emissive spheres r 0.06 pressed into the surface `#e05ab8` (egg sacs). Front: capsule r 0.12 len 0.25 `#2e1a3d`. Back plates: 3 boxes `#c8962e` like a shell. 4 thick legs: cylinders r 0.04 `#d8c8a0`. Anim: slow lumbering bob 0.04 at 1.5 Hz, abdomen breathes (scale 1.0–1.06), legs rock ±10°. |
| **Choir Mother** (~1.6 × 1.1 h) | Huge abdomen sphere r 0.55 `#5e3a7a`, upright torso capsule r 0.2 len 0.5 `#2e1a3d` on the front, crown of 6 cones (spines) `#d8c8a0` around the head, ochre box plates down the back `#c8962e`. Row of 6 emissive sacs `#e05ab8` along sides. 6 leg cylinders. Anim: slow bob; spines sway; sacs flash bright for 0.5 s right before each Birthing. |
| **Spindle Drone** (~0.35 × 0.3 h) | Hull: box 0.22×0.1×0.16 `#4a5058` on 3 thin cylinder legs (tripod) `#2e3238`. Single sensor: small sphere r 0.04 front, emissive `#ff2a1a`. Hazard stripe: thin box on top `#d8a820`. Anim: fast skitter bob 0.03 at 12 Hz; sensor yaws ±15° (scanning). |
| **Rivet Walker** (~0.55 × 0.55 h) | Torso: box 0.3×0.22×0.26 `#8a4a2a` with gunmetal side panels `#4a5058`. 2 piston legs: cylinder thigh + cylinder shin each `#2e3238`, box feet. Optic: cylinder r 0.05 short, emissive `#ff2a1a`. Shield: sphere r 0.4, `#8ad0ff`, additive, opacity 0.2. Anim: legs step (alternating rotation ±25° at 2.5 Hz), torso sways; shield bubble flashes to 0.6 opacity on hit, fades out when shields = 0, fades back in on reboot. |
| **Mender Unit** (~0.5 × 0.5 h) | Hull: cylinder r 0.18 h 0.18 `#4a5058` on 4 short box legs `#2e3238`. On top: rotating dish = flattened cone `#d8a820`. Green-ish repair is off-palette, so use a hazard-yellow torus ring (r 2 tiles on the ground, opacity 0.15) showing heal radius. Optic `#ff2a1a`. Shield sphere r 0.35 as Rivet Walker. Anim: dish rotates 90°/s; ground ring pulses opacity 0.1–0.25 at 1 Hz. |
| **Anvil Tread** (~0.9 × 0.55 h) | Two tread blocks: boxes 0.9×0.18×0.2 `#2e3238` on each side. Hull: box 0.65×0.28×0.5 `#8a4a2a` with front wedge (box rotated 30°) `#4a5058`. Hazard stripes on wedge `#d8a820`. Twin optics: 2 small spheres emissive `#ff2a1a`. Shield sphere r 0.6. Anim: treads scroll (UV offset or alternate stripe boxes), slight heavy hull rumble jitter 0.01. |
| **Foundry Colossus** (~1.6 × 1.4 h) | Base: 4 tread boxes in an X pattern `#2e3238`. Body: large box 1.0×0.6×0.8 `#8a4a2a` with stacked smaller box "furnace" on top `#4a5058`, 2 smokestack cylinders `#2e3238`. Furnace mouth: front box emissive `#ff2a1a`. Hazard bands `#d8a820`. Shield sphere r 1.1. Anim: furnace emissive pulses at 1 Hz; smokestacks emit small grey cube particles; shield bubble ripples (scale wobble) during regen. |

## 4. Death effects

| Faction | Effect | Construction |
|---|---|---|
| **Chorus** | Goo splat + gibs | Flat circle decal on ground (`#2e1a3d` center, `#5e3a7a` rim), size ≈ model footprint, fades over 6 s. 8–14 small sphere/tetra particles in `#5e3a7a`/`#e05ab8` burst up and fall with gravity over 0.6 s. Model squashes (scale y → 0.2) over 0.15 s before vanishing. Brood Carrier/Choir Mother: larger decal + extra magenta particles. |
| **Remnant** | Spark burst + debris | 10–16 tiny additive boxes `#ffd060`→`#ff2a1a` shoot outward and fade in 0.4 s. 3–5 box debris chunks in hull colors tumble out and lie on the ground, fade over 4 s. Brief point-light flash (orange, 0.1 s). Shielded units: shield sphere pops (scale 1.0 → 1.3, opacity → 0) first. Bosses: 3 staggered explosions over 1 s. |

## 5. Wave composition hints

### Phasing
| Phase | Waves (of ~30) | Enemies introduced | Purpose |
|---|---|---|---|
| Early | 1–8 | Skitterling, Spindle Drone, then Husk Crawler (w4+) | Teach basic placement; light armor rewards rapid-fire Normal damage. |
| Mid | 9–18 | Rivet Walker, Brood Carrier, Mender Unit (w12+) | Force a damage-type mix: shields, armor 2, death spawns, healing. |
| Late | 19–29 | Anvil Tread, mixed-faction waves | Armor 4 neuters Normal damage; slow-towers can't stall Treads. |
| Boss | 10 (mini), 20, 30 | Choir Mother (Chorus maps), Foundry Colossus (Remnant maps); final wave may send both | Sustained DPS check + leak-cost threat (20 lives). |

### Pressure combos
| Combo | Pressures | Why it works |
|---|---|---|
| Skitterling swarm (20–30, tight spacing) | Single-target, slow-firing towers | Volume over HP; rewards splash/Concussive. |
| Husk Crawlers spaced far apart | Burst towers with long reload, gaps in coverage | Regen undoes chip damage between tower zones. |
| Brood Carriers followed by Skitterlings | Splash-light defenses at the path's end | Death spawns appear deep in the maze, stacked with the follow-up wave. |
| Rivet Walkers in pairs with ~3 s gaps | Long-cooldown heavy hitters | Shields reboot between volleys unless DPS is continuous. |
| Mender Unit inside an Anvil Tread column | Everything; tests target priority | Heavy armor soaks while the Mender out-heals. Teach "focus/first" targeting mode. |
| Anvil Treads + Spindle Drone screen | Slow-reliant defenses | Treads ignore slow; drones soak shots and leak fast. |
| Mixed faction (Husk + Rivet) | Single damage-type builds | Unshielded regen vs shielded armor wants different tools. |

### Rules of thumb
- Never introduce more than one new ability per wave.
- Spacing is a tuning lever as strong as count: tight spacing favors splash, wide spacing favors single-target and punishes regen/shield-reboot weakness.
- Bounty per wave should roughly track total wave HP; spawned Skitterlings count toward wave HP for this purpose.
