# AGENTS.md

Canonical guide for any agent (or human) working in this repo.

## Purpose

Browser tower defense game with a StarCraft 1 *vibe*: gritty sci-fi, metal console UI, armor/damage-type matchups, isometric 2.5D look. Original IP only. Build plan and orchestration log: `docs/PLAN.md`. Architecture: `docs/architecture.md`. Design docs: `docs/design/`.

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
| `npm run balance` | Headless bots play every map × difficulty, prints the results table (GDD §13; excluded from `npm test`) |

## Directory map

```
index.html        #app: canvas container + #ui overlay
src/main.ts       boot: wires sim, render, ui, and the game loop
src/sim/          pure deterministic simulation (no three, no DOM)
src/data/         definitions: towers, enemies, maps, difficulty
src/render/       Three.js; reads sim state, draws it at native res (index.ts: renderer, load-time bakes, frame order;
                  units.ts: sprite billboards; fx.ts: event-driven VFX; camera.ts: pan/zoom input; view.ts: camera
                  sizing grid; hd/: HD unit models + sprite atlas bake, contract in hd/index.ts; hd/terrain/: HD map
                  scene pre-rendered once per map, spec docs/terrain-hd.md)
src/audio/        WebAudio-synthesised SFX driven by sim events
src/ui/           DOM overlays: home screen, HUD, build/sell panel
dev/              standalone sandbox pages (see below), not shipped
docs/             plan, architecture, design docs
```

### Dev sandboxes

Open via `npm run dev` at `/dev/<name>.html`:

- `render.html`: renderer on a real map with fake towers/enemies (`?map=<id>`, `?towers=all`, `?enemies=<n>` per path, `?res=WxH` fixed drawing buffer); `window.__bench(frames)` prints ms/frame + draw calls at zoom 24/30/40, `__step(dt)` renders one frame, `__load` has bake times/sizes.
- `models.html`: HD model showroom: real-time close-up + baked sprites over the baked HD terrain (`?unit=<id>&level=<n>`, no `unit` = all units; `&ppu=`, `&zoom=`, `&map=`, `&still`); `window.__draw(dt)` renders when the pane is hidden.
- `fx.html`: FX + SFX bench; the real renderer + sim played by the competent bot, plus buttons for every effect and sound.
- `ui.html`: home screen and HUD over a placeholder stage, driven by the real sim and the competent bot (no renderer).

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

## Adding content

Design rules: `docs/GDD.md`. Types: `src/data/types.ts`. Sim contract: `src/sim/types.ts`. `src/data/data.test.ts` validates all of it.

- **Tower:** add the id to `TowerId` in `src/data/types.ts`, a `TowerDef` (3 levels: base + 2 upgrades, full stats per level) to `TOWERS` and `TOWER_LIST` in `src/data/towers.ts`, rows in both GDD §3 tables; add sim tests if it needs new behaviour (new `Delivery` or stat). HD model: `src/render/hd/towers/<id>.ts` (`(level) => Built`, see the contract in `src/render/hd/index.ts`) registered in `HD_TOWERS` (a full `Record`, so typecheck demands it); FX muzzle points come from the model (turret's +X tip; `arc_coil` fires from its crown, see `muzzleOf` in `src/render/fx.ts`); check it in `/dev/models.html?unit=<id>`. Per-tower tables (typecheck flags the `Record`s): `TOWER_ICONS` in `src/ui/icons.ts`, and optionally `SHOT` in `src/audio/sfx.ts` (omit = silent shot) and `DEFAULT_ORDER` in `src/sim/autoplay.ts`. Hardcoded counts (not typechecked): the tower/hotkey count of `6` in `src/data/data.test.ts`, the "[1–6]" hint in `src/ui/hud.ts` and the README controls.
- **Enemy:** add the id to `EnemyId`, an `EnemyDef` to `ENEMIES` in `src/data/enemies.ts` (new ability = new `EnemyAbility` variant + sim support + test), a row in GDD §4; reference it from wave groups; add an HD model `src/render/hd/enemies/<id>.ts` (`(walkPhase) => Built`) registered in `HD_ENEMIES` (a full `Record`, so typecheck demands it).
- **Map:** add the id to `MapId`, a file `src/data/maps/<id>.ts` (ASCII `layout` + `parseLayout`, `paths` as `[col,row]` waypoints spawn -> core, `waves` built with `g(...)`, palette, `hpGrowth`, `startingCash`), register it in `MAPS` and `MAP_LIST` in `src/data/maps/index.ts`, add its expected wave count/mid boss to `data.test.ts`, a row in GDD §7–8. It appears on the home screen via `MAP_LIST`. A new `Biome` also needs a `style()` case in `src/render/hd/terrain/build.ts` (decor recipe + `TerrainLook`) and its own `ground`/`path`/`rock` branches in `src/render/hd/terrain/textures.ts` (otherwise it falls through to the crystal look); check it in `/dev/render.html?map=<id>`.

## Testing

All sim logic gets Vitest tests next to the code (`*.test.ts`): pathing, targeting, damage/armor, economy, waves, win/lose. Prefer deterministic scenario tests (seed + commands -> expected state). Render/UI are verified in the browser, not unit-tested.

## Definition of done

1. `npm run typecheck` passes.
2. `npm test` passes.
3. `npm run build` passes.
4. Browser check: run `npm run dev`, exercise the affected flow, no console errors.
