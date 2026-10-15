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
   -> queued, applied at the start of the next sim step
   -> sim.step(FIXED_DT)   x N   (accumulator: N = floor(elapsed / FIXED_DT))
   -> state (plain objects)
   -> render reads state, draws scene (may interpolate by leftover alpha)
   -> ui reads state, updates HUD
```

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
   |   continue        last wave cleared
   +-------------  Victory  <-----------  Playing
   |
   |   continue        lives reach 0
   +-------------  Defeat   <-----------  Playing
```

`Home` and `Victory`/`Defeat` are UI states; the sim exists only during `Playing`/`Paused`. `Paused` simply stops calling `sim.step`.
