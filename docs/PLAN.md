# Build Plan — Tower Defense (StarCraft 1 vibe)

## Locked decisions
- **Stack:** TypeScript + Vite + Three.js + Vitest. No UI framework (DOM overlays for menus/HUD).
- **2.5D look:** Three.js orthographic camera at a fixed isometric angle (SC1-style ~3/4 view), low-poly 3D models built from primitives, rendered to a low-res target and upscaled with nearest-neighbour filtering for a pixel-art feel. Limited palette, hard shadows.
- **Architecture:** a pure, deterministic simulation (`src/sim`, no DOM/Three imports, fixed timestep) driven by data definitions (`src/data`). The renderer (`src/render`) and UI (`src/ui`) only read sim state and dispatch commands. This keeps the game logic testable headlessly and easy for agents to extend.
- **Original IP only:** SC1 *vibe* (gritty sci-fi, metal console UI, armor/damage-type matchups). No StarCraft names, units, or assets.

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
- Stages 2–4 🔄 parallel: sim (`src/sim`), render core (`src/render` excl. models/fx), models (`src/render/models`), FX + audio (`src/render/fx.ts`, `src/audio`), UI (`src/ui`). Each verifies via its own page under `dev/`; `src/main.ts` + `index.html` are reserved for stage 5 integration.
