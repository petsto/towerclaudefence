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
        commands  |    | state \ state
                  |    v        v
           +------+------+   +-------------+
           |   src/ui    |   | src/render  |
           | DOM overlay |   |  Three.js   |
           +------+------+   +------+------+
                  ^                 ^
                  +--------+--------+
                           |
                    +------+------+
                    | src/main.ts |  boot + game loop
                    +-------------+
```

Dependency direction: `data` <- `sim` <- `render` / `ui` <- `main`. `sim` imports nothing from `render`, `ui`, `three`, or the DOM.

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

Canvas mouse input (hover, build placement, tower selection) lives in `src/main.ts`; hotkeys live in the HUD.

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

`Home` and `Victory`/`Defeat` are UI states; the sim exists only during `Playing`/`Paused`. `Paused` makes `step()` a no-op. Restart / Retry recreate the game on the same config.
