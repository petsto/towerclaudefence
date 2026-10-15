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

Rendering (`src/render/index.ts`): terrain, decals and overlays render at ~384p and are posterized; units are HD PBR models (`src/render/hd/`, one file per tower/enemy, registered in full `Record`s so every id needs a model) baked once per map load into a sprite atlas (16 turret yaws + base per tower level, 8 yaws × 4 walk phases per enemy) and drawn as native-resolution billboards (`src/render/units.ts`) between the world pass and the overlay pass (airborne FX, HP bars; depth-tested against the world and a depth-only pass of the sprites' silhouettes, so FX behind a unit hide behind it).

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
