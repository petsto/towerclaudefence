# Steel Meridian

A browser tower defense with a gritty late-90s RTS feel: an isometric 2.5D battlefield rendered at low resolution and upscaled as pixel art, a metal command console, and armor-versus-damage-type matchups. Hold the colony core against the Chorus swarm and Remnant war machines across three theatres and four difficulties.

TypeScript + Three.js + Vite, no UI framework. Original IP.

## Quickstart

```sh
npm install
npm run dev    # http://localhost:5173
npm test
npm run build
```

Node 24+.

## Controls

| Input | Action |
|---|---|
| `1`–`6` | Pick a structure from the command card |
| Left-click pad | Deploy the picked structure (hold `Shift` to keep placing) |
| Left-click structure | Select it |
| Right-click / `Esc` | Cancel build mode / deselect (`Esc` with nothing selected pauses) |
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
- [docs/GDD.md](docs/GDD.md): game design (towers, enemies, maps, economy)
- [docs/architecture.md](docs/architecture.md): modules and data flow

## Dev sandboxes

With `npm run dev` running, `/dev/render.html`, `/dev/models.html`, `/dev/fx.html` and `/dev/ui.html` each exercise one module with fake state (renderer, tower and enemy models, effects and sound, HUD). See [AGENTS.md](AGENTS.md#dev-sandboxes).
