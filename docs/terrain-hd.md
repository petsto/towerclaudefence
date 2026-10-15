# HD terrain spec (stage 8, terrain)

**Status: implemented** (prototype 11b4313, integration f29f518; V2 pre-rendered was chosen). The prototype page and the old `terrain.ts` / pixel pass are gone.

Goal: the same maps (layout, palettes, gritty mood) at the fidelity of the HD unit sprites, so terrain and units read as one game. Code: `src/render/hd/terrain/` (`build.ts` scene + per-biome `style()`, `textures.ts`, `material.ts`, `props.ts`, `bake.ts` entry point `createMapTerrain`). Check a map in `/dev/render.html?map=<id>`.

## What stays

Grid, heights and silhouettes of the old pixel terrain (path recessed to `PATH_Y`, pads at `PAD_Y`, decor tiles raised 0.4–0.6, map edge drops into the void), every `MapPalette` colour (ground/groundAlt macro blotches, path, pad, cliff, accent, core, void), the biome decor recipe (badlands rocks + wrecks, volcanic rocks + lava + ember shards, crystal spires on creep), pad lights in accent, amber when occupied, red spawn portals, blue colony core.

## Light (shared with the sprite bake)

One sun at `SUN_DIR (-6, 14, -5)`, intensity 3.2, colour `palette.keyLight`, plus a `HemisphereLight(hemiSky, hemiGround, 2.0)`. No tone mapping. Terrain is `MeshStandardMaterial` lit by this rig: the same BRDF as the units. Room env at 0.35 on natural ground; hard-surface props use the unit materials (env 1.2). Shadows are soft PCF with the same direction as the sprites' baked ground shadows, so cast shadows on terrain and in sprites fall the same way and have the same softness. AO is baked from a height raster (heightfield + pads + props) into the map mask. It darkens indirect light, plus a little albedo cavity.

## Material language per biome

| | Ground (blocked/open) | Path (enemy lane) | Cliffs / mesas | Props |
|---|---|---|---|---|
| Dust Ridge (badlands) | dry hardpan, broad tonal patches, faint warped mud cracks, sparse half-buried stones | lighter packed road dirt + gravel, darker worn curb | sandstone strata (horizontal bands, ledges, erosion streaks) | boulders in strata rock, crashed crates, snapped girders |
| Cinder Forge (volcanic) | charcoal ash crust in big, flat, faint plates (larger than the path's flagstones, so it never reads as paving); lava glows in the plate cracks only in sparse hot spots away from lanes and pads | basalt flagstones bedded in pale ash | basalt columns, lava seeping at the cliff base | basalt boulders, small ember shards |
| Hollow Spire (crystal) | dark creep: low swells, ridged wet veins, rare lime pustules | cracked station plates stained with creep (the brightest surface) | faceted violet rock, teal crystal veins | teal crystal spires (≤ 0.8 tall), wreckage |

All textures are procedural (canvas, tileable 256² over 2 tiles = 128 px/tile, about the bake density at 1440p; albedo + ORM + Sobel normal, ORM red = height for blending, ORM blue = glow mask). They are coloured from the palette, so a new map gets its look from its palette. Transitions blend by layer height (path vs ground) and by slope (rock on cliffs, triplanar so strata stay horizontal).

## Readability rules (non-negotiable)

1. **Path** is the most uniform and usually the lightest surface. It is recessed with a bevelled curb, and a soft AO/grime line runs along each edge. Its edge follows the tile boundary within ±0.05 tile.
2. **Buildable** = a metal deck plate in the unit materials (`buildPad` tint, hazard corners) with lit corner brackets and a thin continuous outline in `accent`, which turn amber when occupied. Nothing else on the map uses that shape or that light.
3. **Blocked** = natural ground (lower contrast than the path, no straight edges) or raised rock (cliffs cast soft shadows). Props never sit on pads or path.
4. Units stay the focus: ground detail is low in contrast, saturation stays at or below the palette, and emissive terrain is sparse and never under lanes or pads. Only units and pad lights use the brightest values.
5. Spawn = red ring in a chitin maw (spins). Core = the team-blue colony structure with a `palette.core` glow (flickers).

## Pipeline (V2, pre-rendered)

At map load (`createMapTerrain`, called from `src/render/index.ts` after the sprite atlas, sharing its unit materials):

1. Build the HD scene: heightfield (10 verts/tile) with a border skirt, map mask (16 px/tile: path, macro tint, AO, glow region), texture sets, props.
2. Render it once from the fixed 55° ortho view into one RGBA8 sRGB texture, the same recipe as the sprite bake: 512 px tiles, 2× supersampled, 4× MSAA half-float, 4096² PCF sun shadow, origin snapped to the texel grid.
   - **Density:** the screen's px/unit at zoom 30 (`grid.scale × 30`), capped at 180. At zoom 30 baked texels land 1:1 on screen pixels (the camera pan snaps to the same grid). Zoom 24 minifies by 0.8 and zoom 40 magnifies by 1.33, with no mips, like the sprites.
   - **Memory:** 1440p 16–21 MB, 720p ~5 MB, 5K 36–48 MB.
3. Merge the static meshes into one indexed, position-only, depth-only **occluder**, then free their GPU resources.
   - Rocks use low-poly stand-ins (`rockGeo(seed, 1)`); pads are skipped (flat). That keeps it at ~100k tris.
   - Hover, decals, FX and HP bars depth-test against it, so they hide behind cliffs and rocks. FX near rocks may clip slightly differently from the rendered rock.

Per frame the terrain is the quad (drawn first, no depth), then the occluder (`colorWrite` off), then the live pieces: pad lights (amber when occupied), portal rings, core glow. Terrain and sprites share density, filtering and light, and read as one painted image, like SC:Remastered.

Known limits:
- The bake is not redone after a WebGL context loss (render-target contents are lost; the sprite atlas has the same limit).
- It is not redone after a devicePixelRatio change either; the old bake is just scaled.
- A map larger than `maxTextureSize` at the chosen density throws. Today's maps peak at 4454×2802.
