# Steel Meridian

A browser tower defense with a gritty late-90s RTS feel: an isometric 2.5D battlefield of pre-rendered HD terrain and unit sprites, a glass command console, and armor-versus-damage-type matchups. Hold the colony core against the Chorus swarm and Remnant war machines across six theatres and four difficulties.

TypeScript + Three.js + Vite, no UI framework. Original IP.

## Quickstart

```sh
npm install
npm run dev    # http://localhost:5173
npm test
npm run build
npm run balance  # headless bot results per map × difficulty (~4 min)
```

Node 24+.

## Features

- **Six theatres**, home order by threat tier: Dust Ridge Outpost (badlands, 1), Whiteout Relay (frost, 2), Cinder Forge (volcanic, 2), Blackwater Sluice (marsh, 3), Hollow Spire (crystal, 3), Ossuary Deep (crystal hive, 4).
- **Four difficulties:** Recruit, Veteran, Elite, Brutal.
- **Wave count:** Campaign (each map's authored 15–22 waves) or Custom, 10–50 waves. From wave 41 only heavies and bosses come, and every run ends on a boss.
- **Six structures** with three levels each, damage types against armor classes, and two command powers (Tremor Mines, Lance Strike).

## Controls

On the home screen, `Tab` / arrow keys move between controls and `Enter` launches. In game:

| Input | Action |
|---|---|
| `1`–`6` | Pick a structure from the command card |
| Left-click pad | Deploy the picked structure (hold `Shift` to keep placing) |
| Left-click structure | Select it |
| `Q` / `E` | Arm Tremor Mines / Lance Strike targeting (command powers; charge from the first wave) |
| Left-click tile | Use the armed power (mines: lane tiles, hold `Shift` to keep planting) |
| Right-click / `Esc` | Cancel build mode or power targeting / deselect (`Esc` with nothing selected pauses) |
| `U` / `X` | Upgrade / sell the selected structure |
| `Tab` | Cycle the selected structure's targeting |
| `Space` | Call the next wave (early calls pay a bonus) |
| `F` | Cycle game speed 1× / 2× / 3× |
| `P` | Pause |
| `WASD` / arrows / screen edge | Pan the camera |
| Mouse wheel | Zoom |

Add `?dmg` to the URL to show damage numbers.

## Docs

- [AGENTS.md](AGENTS.md): contributor and agent guide (commands, architecture rules, how to add towers, enemies and maps)
- [docs/GDD.md](docs/GDD.md): game design (towers, enemies, maps, economy, custom wave count)
- [docs/design/ui-revamp.md](docs/design/ui-revamp.md): UI look and components
- [docs/architecture.md](docs/architecture.md): modules and data flow

## Dev sandboxes

With `npm run dev` running, `/dev/render.html`, `/dev/models.html`, `/dev/fx.html` and `/dev/ui.html` each exercise one module (renderer, tower and enemy models, effects and sound, HUD). See [AGENTS.md](AGENTS.md#dev-sandboxes).
