# Build Plan — Tower Defense (StarCraft 1 vibe)

Locked decisions (stack, 2.5D pixel look, sim/render split, original IP): see `AGENTS.md` and GDD §11.

## Stages
| # | Stage | Output | Owner(s) |
|---|-------|--------|----------|
| 0 | Concept & design | `docs/design/*.md` (systems, enemies, maps, art direction) | 4 designer agents (parallel) |
| 0' | Scaffold | Vite/TS/Three/Vitest project, AGENTS.md, architecture doc | tech-lead agent (parallel with 0) |
| 1 | Design synthesis | `docs/GDD.md` + `src/data/*.ts` definitions | lead-designer agent |
| 2 | Core simulation | `src/sim/*` + tests (pathing, targeting, damage, economy, waves) | sim engineer |
| 3 | Rendering | `src/render/*` (iso camera, pixel pass, models, FX) | render engineer(s) |
| 4 | UI | home screen (map list + difficulty), HUD, build/sell panel | UI engineer |
| 5 | Integration | game loop wiring, browser verification | integrator |
| 6 | Balance | headless sim runs per map × difficulty, tuning | balance agent |
| 7 | Review & docs | code review, docs refresh, handoff notes | reviewer |

Stages 2–4 run in parallel against the data/type contracts from stage 1.

## Compaction checkpoints
- **CP1** after stage 1 (design locked, data contracts in place).
- **CP2** after stage 5 (playable build verified in browser).
- **CP3** after stage 7 (final).

## Status log
- Stage 0 ✅ design docs in `docs/design/`; scaffold committed.
- Stage 1 ✅ `docs/GDD.md`, `src/data/*`, `src/sim/types.ts` contract (events accumulate; drained once per frame via `game.drainEvents()`). **CP1 reached.**
- Stages 2–4 ✅ parallel: sim (`src/sim`), render core (`src/render` excl. models/fx), models (`src/render/models`), FX + audio (`src/render/fx.ts`, `src/audio`), UI (`src/ui`). Each verifies via its own page under `dev/`; `src/main.ts` + `index.html` are reserved for stage 5 integration.
- Stage 5 ✅ playable, browser-verified (a86888a). **CP2 reached.** Game title: **Steel Meridian**. Known follow-ups for stage 6/7: Easy→Normal difficulty cliff (autoplay loses all maps on Normal), sim interpolation, build/sell animations, subtle tower upgrade visuals, Cinder Forge groundAlt posterizes olive.
- Stage 6 ✅ (49605ad polish, c2e135e balance) parallel: balance (src/data numbers, sim pacing, autoplay bot) + polish (render/UI feel). Integrator notes: final-wave boss cliff, Hollow Spire core hidden under console at start, +$ text too small, auto-launched waves overlap, README still has old title.
- Stage 7 ✅ review: correctness + simplicity reviewers → fixer (c05ea10, ad7bf06, 512e325). Deferred simplicity items (terrain/parts helper dupes, units.ts tower-mesh rebuild, duplicate PITCH) folded into 6b.
- Stage 6b 🔄 graphics fidelity: user feedback (2026-10-15) — towers/enemies look too pixelated/low quality vs StarCraft: Remastered reference (hi-res pre-rendered sprites, worn metal, specular, AO). Prototype `dev/fidelity.html` compares V0 current / V1 HD real-time PBR / V2 pre-rendered sprite atlas / V3 hybrid; user picks, then rollout. User likes current map look — preserve it.
  - Prototype done (01e0472). **Decision: V2 pre-rendered sprite atlas + pixel terrain** (HD PBR models baked to a sprite atlas at load; terrain stays 384p posterized). Rollout: 6a foundation (move prototype into `src/render/hd/`, per-unit model files + registry, showroom) → 6b parallel: pipeline integration in the game renderer + tower/enemy model agents → integration check. **CP3** after rollout + docs.
  - Stage 6b ✅ rollout (141e682..8b14bc1): all 6 towers × L1–L3 and 9 enemies are HD models in `src/render/hd/`, baked per map (67–80 MB at 1440p, ~0.7 s); low-poly `src/render/models/` deleted, registries are full Records. Default zoom 30 (steps 24/30/40). Browser-verified on all 3 maps incl. bosses. **CP3 reached.**
- Stage 8 ✅ polish + HD terrain. Polish ✅: start framing fits spawns + core, boss bar in the top-bar layout with camera top inset, narrow HUD/home down to 375 px, turret ground shadows baked, clumped HP bars deduped, units occlude overlay FX via depth-only cut-outs, UniformsUtils warning gone. HD terrain: prototype (11b4313, `dev/terrain.html`, spec `docs/terrain-hd.md`) compared V0 current / V1 real-time / V2 pre-rendered / V3 hybrid; **user approved V2** (terrain baked once at map load at the atlas px/unit, drawn as one quad).
  - HD terrain rollout ✅ (f29f518, plus QA fixes). The map scene in `src/render/hd/terrain/` is pre-rendered once per map at the screen's px/unit at zoom 30 (capped at 180) and drawn as one quad, with a merged depth-only occluder so FX and decals hide behind cliffs and rocks.
    - Removed: the 384p pixel pass and posterize (`pixel.ts`), the old `terrain.ts` and `dev/terrain.html`. FX now run at native resolution (fat-line bolts, smoother blasts and splats). `src/render/view.ts` keeps the camera sizing grid.
    - QA pass: all 3 maps at 1280×720 physical, 1280×720 CSS at DPR 2, and 375×812 at DPR 2 (5K covered earlier). Checked build/upgrade/sell, hover/range/selection, boss waves, zoom 24/30/40, pan edges, mid-game resize and FX occlusion behind mesas and towers.
    - Cinder Forge ground is now big faint ash plates, so the flagstone path is the only paved surface.
  - Before → after (e03ac08 → f29f518, measured with `dev/render.html … &res=2560x1440` and `__bench`):
    - Load at 1440p: ~0.75–0.84 s → ~1.0–1.1 s (terrain build + bake ~250–300 ms).
    - Frame time: unchanged (0.26–0.55 → 0.25–0.48 ms).
    - Draw calls: 10–19 → 6–9.
    - Terrain GPU memory at 1440p: ~4 MB → 16–21 MB (720p ~5 MB, 5K 36–48 MB).

## Backlog (deferred until playtest says so)
- **Sprite atlas memory** (user decides after playtesting; not started). Full roster at 128 px/unit ≈ 100 MB GPU; per-map bake (18 tower levels + that map's enemies only) is lower. Levers, cheapest first:
  1. Lower `pxPerUnit` (128 → 96 ≈ 57 MB full roster; one constant in `src/render/hd/`).
  2. Separate cell sizes for tower base vs turret (≈20–30% of tower memory, costs a second quad per tower).
  3. Fewer frames: enemies 8 yaw → 4 (sim paths are axis-aligned), walk frames 4 → 2 for light enemies.
  4. Bake L2/L3 tower levels lazily on first upgrade instead of at map load.
  5. GPU texture compression (KTX2/Basis) of the baked atlas; largest saving, most work.
- **Re-bake after WebGL context loss / devicePixelRatio change** (not done: the load path isn't re-entrant, and units hold the atlas texture). After a context loss the terrain and sprites come back blank; after a DPR change the old bake is only rescaled. Fix: on `webglcontextrestored` / DPR change, rebuild the renderer from `main.ts` (sim state survives).
- **Terrain load time** (+~250–300 ms; mostly CPU texture generation and mask/AO). Options: a Web Worker or per-biome texture caching.
- Native-res explosion/death flashes draw as an opaque white disc for a few frames (harsh at 720p); soften in `src/render/fx.ts`.
- Picket L3 cooldown 0.27 s rounds to 17 ticks (0.283 s); use 0.25 if a tick-exact value matters. Also in Stage 8: Picket upgrades raise rate, Thumper fires 1/2/3 shells (3f5cea2); home previews redrawn in the HD style (2cd0a6d, 2D canvas; a real HD bake cost ~1.6 s).
