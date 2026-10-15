# AGENTS.md

Canonical guide for any agent (or human) working in this repo.

## Purpose

Browser tower defense game with a StarCraft 1 *vibe*: gritty sci-fi, metal console UI, armor/damage-type matchups, isometric 2.5D look. Original IP only. Build plan and locked decisions: `docs/PLAN.md`. Architecture: `docs/architecture.md`. Design docs: `docs/design/`.

## Stack

TypeScript (strict) + Vite + Three.js + Vitest. No UI framework: menus and HUD are plain DOM overlays. Node 24, npm.

## Commands

| Command | What |
|---|---|
| `npm run dev` | Dev server (localhost only) |
| `npm run typecheck` | `tsc --noEmit` (also our lint) |
| `npm test` | Vitest, single run |
| `npm run test:watch` | Vitest, watch mode |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve `dist/` |

## Directory map

```
index.html        #app: canvas container + #ui overlay
src/main.ts       boot: wires sim, render, ui, and the game loop
src/sim/          pure deterministic simulation (no three, no DOM)
src/data/         definitions: towers, enemies, maps, difficulty
src/render/       Three.js; reads sim state, draws it
src/ui/           DOM overlays: home screen, HUD, build/sell panel
docs/             plan, architecture, design docs
```

## Architecture rules

1. **Sim purity.** `src/sim` never imports `three`, never touches DOM/`window`, never reads wall-clock time, never calls `Math.random` (use a seeded RNG in state). It must run headlessly in Vitest.
2. **Data-driven.** Tower/enemy/map/difficulty stats live in `src/data` as typed plain objects. The sim reads them; no stats hard-coded in sim logic.
3. **Fixed timestep.** The sim advances only in steps of `FIXED_DT = 1/60` s (`src/sim/constants.ts`). The loop accumulates real frame time and calls `step` zero or more times per frame; rendering may interpolate.
4. **One-way flow.** Renderer and UI *read* sim state. UI (and input) *dispatch commands* (build, sell, upgrade, pause, start wave); the sim applies them at the next step. Nothing outside `src/sim` mutates sim state.
5. **Dependency direction.** `data` <- `sim` <- `render`/`ui` <- `main`. `sim` never imports from `render` or `ui`.

## Coding conventions

- TypeScript strict with `noUncheckedIndexedAccess`; no `any`, no `// @ts-ignore` without a reason in the comment.
- Small, focused files. Plain functions and data over classes and abstractions. No speculative code.
- No new dependencies without a stated reason (the platform or a few lines usually suffice).
- Original IP only: no StarCraft names, units, factions, sounds, or assets.

## Adding content (to be refined once `src/data` contracts land in stage 1)

- **Tower:** add a definition in `src/data` (cost, range, damage, damage type, fire rate, upgrades); add/extend sim tests if it introduces new behaviour; add a model in `src/render`.
- **Enemy:** add a definition in `src/data` (hp, armor, armor type, speed, bounty); reference it from wave data; add a model in `src/render`.
- **Map:** add a definition in `src/data` (grid, buildable tiles, path/waypoints, waves per difficulty); it appears on the home screen map list.

## Testing

All sim logic gets Vitest tests next to the code (`*.test.ts`): pathing, targeting, damage/armor, economy, waves, win/lose. Prefer deterministic scenario tests (seed + commands -> expected state). Render/UI are verified in the browser, not unit-tested.

## Definition of done

1. `npm run typecheck` passes.
2. `npm test` passes.
3. `npm run build` passes.
4. Browser check: run `npm run dev`, exercise the affected flow, no console errors.
