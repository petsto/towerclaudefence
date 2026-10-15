# Architecture

## Modules

```
                +-------------+
                |  src/data   |  tower/enemy/map/difficulty definitions
                +------+------+
                       |
                       v
                +-------------+
                |  src/sim    |  pure, deterministic, fixed 1/60 s step
                +------+------+
                  ^    |    \
        commands  |    | state \ state, events
                  |    v        v
           +------+------+   +-------------+   +-------------+
           |   src/ui    |   | src/render  |   |  src/audio  |
           | DOM overlay |   |  Three.js   |   |  WebAudio   |
           +------+------+   +------+------+   +------+------+
                  ^                 ^                 ^
                  +--------+--------+-----------------+
                           |
                    +------+------+
                    | src/main.ts |  boot + game loop
                    +-------------+
```

Dependency direction: `data` <- `sim` <- `render` / `ui` / `audio` <- `main`. `sim` imports nothing from `render`, `ui`, `three`, or the DOM.

## Data flow (per frame)

```
input (mouse/keys, UI buttons)
   -> commands (build, sell, upgrade, startWave, pause, ...)
   -> game.dispatch: validated and applied immediately (between steps)
   -> game.step()   x N   (accumulator: acc += min(dt, 0.25) * speed; one step per FIXED_DT;
                           renderer.interp.capture(state) before each step, interp.alpha = acc / FIXED_DT after,
                           so enemies/projectiles draw lerped one step behind)
   -> game.drainEvents() once per frame -> fx.handle, sfx.play, HUD reactions (floats, flashes)
   -> renderer.render(state, dt), hud.update(state)
```

Canvas mouse input (hover, build placement, tower selection) lives in `src/main.ts`; game hotkeys live in the HUD (`src/ui/hud.ts`); camera pan/zoom (WASD, arrows, edge-pan, wheel) lives in `src/render/camera.ts`.

Rendering (`src/render/index.ts`): everything draws at native resolution straight to the canvas; there is no low-res pass and no posterize. Two bakes run once per map load, both lit by the map's sun + hemi light, so the runtime scene has no lights:

- **Units:** HD PBR models (`src/render/hd/`, one file per tower/enemy, registered in full `Record`s so every id needs a model) are baked into a sprite atlas. Each tower level gets 16 turret yaws plus a base; each enemy gets 8 yaws × 4 walk phases.
- **Terrain:** the HD map scene (`src/render/hd/terrain/`: heightfield, mask, procedural texture sets, props; spec `docs/terrain-hd.md`) is pre-rendered from the fixed 55° ortho view into one texture, at the screen's px/unit at zoom 30 (capped at 180). It is drawn as one camera-plane quad.

Frame order:

1. World (layer 0): the baked terrain quad (no depth), then one merged depth-only occluder of the static terrain meshes, then the live terrain pieces (pad lights, portal rings, core glow), hover/range/selection and ground decals.
2. Unit sprites as painter-sorted billboards (`src/render/units.ts`, no depth test), then their opaque silhouettes into depth.
3. Overlay (layer `OVERLAY_LAYER`): airborne FX and HP bars. These are depth-tested against cliffs, rocks and unit silhouettes, so an FX behind a mesa or a unit hides behind it.

`src/render/view.ts` keeps a virtual ~384 px tall view grid only for camera sizing. Zoom steps are texels per unit on that grid, and the pan snaps to it, so baked terrain and sprite texels land on whole screen pixels and don't shimmer.

The sim never sees real time, only step counts. Same seed + same command log = same result, which is what makes headless tests and balance runs possible.

## Game state machine

```
          select map + difficulty
  Home  ---------------------------->  Playing
   ^                                   |    ^
   |                            pause  |    | resume
   |                                   v    |
   |                                  Paused
   |                                   |
   |               quit                |
   +-----------------------------------+
   |
   |   home            last wave cleared
   +-------------  Victory  <-----------  Playing
   |
   |   home            lives reach 0
   +-------------  Defeat   <-----------  Playing
```

`Home` is UI-only. `Playing`, `Paused`, `Victory` and `Defeat` are the sim's `GameStatus`: the sim emits `gameOver` and stays alive under the end overlay (dispatch rejects everything) until Retry recreates it on the same config or Home discards it. `Paused` makes `step()` a no-op.
