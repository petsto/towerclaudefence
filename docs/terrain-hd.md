# HD terrain spec (stage 6b, terrain)

Goal: the same maps (layout, palettes, gritty mood) at the fidelity of the HD unit sprites, so terrain and units read as one game. Prototype: `/dev/terrain.html?map=dust-ridge|cinder-forge|hollow-spire&v=0..3`. Code: `src/render/hd/terrain/`.

## What stays

Grid, heights and silhouettes from `terrain.ts` (path recessed to `PATH_Y`, pads at `PAD_Y`, decor tiles raised 0.4–0.6, map edge drops into the void), every `MapPalette` colour (ground/groundAlt macro blotches, path, pad, cliff, accent, core, void), the biome decor recipe (badlands rocks + wrecks, volcanic rocks + lava + ember shards, crystal spires on creep), pad lights in accent, amber when occupied, red spawn portals, blue colony core.

## Light (shared with the sprite bake)

One sun at `SUN_DIR (-6, 14, -5)`, intensity 3.2, colour `palette.keyLight`, plus a `HemisphereLight(hemiSky, hemiGround, 2.0)`. No tone mapping. Terrain is `MeshStandardMaterial` lit by this rig: the same BRDF as the units. Room env at 0.35 on natural ground; hard-surface props use the unit materials (env 1.2). Shadows are soft PCF with the same direction as the sprites' baked ground shadows, so cast shadows on terrain and in sprites fall the same way and have the same softness. AO is baked from a height raster (heightfield + pads + props) into the map mask. It darkens indirect light, plus a little albedo cavity.

## Material language per biome

| | Ground (blocked/open) | Path (enemy lane) | Cliffs / mesas | Props |
|---|---|---|---|---|
| Dust Ridge (badlands) | dry hardpan, broad tonal patches, faint warped mud cracks, sparse half-buried stones | lighter packed road dirt + gravel, darker worn curb | sandstone strata (horizontal bands, ledges, erosion streaks) | boulders in strata rock, crashed crates, snapped girders |
| Cinder Forge (volcanic) | charcoal ash crust, plate cracks; lava glows only in sparse hot spots away from lanes and pads | basalt flagstones bedded in pale ash | basalt columns, lava seeping at the cliff base | basalt boulders, small ember shards |
| Hollow Spire (crystal) | dark creep: low swells, ridged wet veins, rare lime pustules | cracked station plates stained with creep (the brightest surface) | faceted violet rock, teal crystal veins | teal crystal spires (≤ 0.8 tall), wreckage |

All textures are procedural (canvas, tileable 512² over 2 tiles = 256 px/tile, albedo + ORM + Sobel normal). They are coloured from the palette, so a new map gets its look from its palette. Transitions blend by layer height (path vs ground) and by slope (rock on cliffs, triplanar so strata stay horizontal).

## Readability rules (non-negotiable)

1. **Path** is the most uniform and usually the lightest surface. It is recessed with a bevelled curb, and a soft AO/grime line runs along each edge. Its edge follows the tile boundary within ±0.05 tile.
2. **Buildable** = a metal deck plate in the unit materials (`buildPad` tint, hazard corners) with lit corner brackets and a thin continuous outline in `accent`, which turn amber when occupied. Nothing else on the map uses that shape or that light.
3. **Blocked** = natural ground (lower contrast than the path, no straight edges) or raised rock (cliffs cast soft shadows). Props never sit on pads or path.
4. Units stay the focus: ground detail is low in contrast, saturation stays at or below the palette, and emissive terrain is sparse and never under lanes or pads. Only units and pad lights use the brightest values.
5. Spawn = red ring in a chitin maw (spins). Core = the team-blue colony structure with a `palette.core` glow (flickers).

## Pipeline (recommended: V2, pre-rendered)

Build the HD scene at map load: heightfield (10 verts/tile), map mask (16 px/tile: path, macro tint, AO, glow region), texture sets, props. Then render it once from the fixed 55° ortho view into one RGBA8 sRGB texture at the sprite atlas's px/unit (2× supersampled, 4× MSAA, 4096² PCF shadows), the same recipe as the sprite bake. Per frame the terrain is one quad, plus a depth-only proxy of the heightfield for hover and FX depth. Animated or state-driven pieces stay live: pad lights, portal rings, core glow. Terrain and sprites then share density, filtering and light, and look like one painted image, like SC:Remastered.
