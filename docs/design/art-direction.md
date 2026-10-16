# Art Direction & Tech Art

> Superseded by docs/GDD.md where they conflict.

Target: late-90s pre-rendered RTS sprites, faked with real-time low-poly 3D. Gritty, readable, chunky pixels, hard light, limited palette. Original IP: evoke the mood, copy nothing (no names, logos, unit silhouettes, UI layouts lifted 1:1).

Pillars: **readability over detail** (path, towers, enemies distinguishable at a glance), **one pixel grid** (everything in the 3D scene shares one low-res texel grid), **crisp UI** (DOM at native resolution).

## 1. Camera

**Decision: orthographic, yaw 0°, pitch 55° below horizontal ("steep 3/4"). Not true isometric.**

| Option | Pros | Cons |
|---|---|---|
| True iso (yaw 45°, pitch 35.264°) | Shows two faces of every model, "more 3D" | Diamond-shaped 24×16 map wastes ~half the screen; diagonal grid edges create pixel staircases; more occlusion behind towers |
| **Steep 3/4 (yaw 0°, pitch 55°)** | Axis-aligned square tiles read like classic RTS tiles; rectangular map fills a widescreen view; horizontal/vertical edges stay pixel-clean; path is rarely occluded | Only top + south faces visible. Mitigate with 6/8-sided cylinders, chamfers, random yaw on decor |

Conventions: world units = tiles. Tile `(col, row)` center = `(col + 0.5, 0, row + 0.5)`, x right, +z toward the viewer (screen-down). Map spans `x ∈ [0,24], z ∈ [0,16]`.

```ts
const PITCH = THREE.MathUtils.degToRad(55);
const DIST = 60;              // ortho: only matters for near/far
export let PPU = 32;          // low-res pixels per world unit: 1 tile = 32 px. Zoom levels: 24 / 32 / 40

export function sizeCamera(cam: THREE.OrthographicCamera, rtW: number, rtH: number) {
  const w = rtW / PPU, h = rtH / PPU;   // frustum derived from render-target size => exactly PPU px per unit
  Object.assign(cam, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2, near: 1, far: 200 });
  cam.updateProjectionMatrix();
}

export function placeCamera(cam: THREE.OrthographicCamera, tx: number, tz: number) {
  // Snap the target to the texel grid so static geometry doesn't shimmer while panning.
  const s = Math.sin(PITCH);
  tx = Math.round(tx * PPU) / PPU;
  tz = Math.round(tz * PPU * s) / (PPU * s);  // ground depth is foreshortened by sin(pitch)
  cam.position.set(tx, DIST * s, tz + DIST * Math.cos(PITCH));
  cam.lookAt(tx, 0, tz);
}
```

Sizing: at 1080p the internal target is 360 px tall (see §2) → view = 11.25 × 20 units; the map's 16-row depth projects to `16·sin55° ≈ 13.1` units, so the full width almost fits and vertical needs a small pan. That's intentional: panning is part of the feel.

Pan: WASD/arrows + edge-scroll (12 CSS px margin, disabled when the pointer is over UI). Speed `14 units/s × (32 / PPU)`. Middle-drag pan optional. Clamp target so the view never shows more than 1 tile of void past the map:
- `x ∈ [viewW/2 − 1, 24 − viewW/2 + 1]` (center if the range inverts)
- `z ∈ [viewH/(2s) − 1, 16 − viewH/(2s) + 1 + consoleH/s]`, `s = sin(PITCH)`, `consoleH` = console height in world units (`consolePx / scale / PPU`) so the bottom row can scroll above the HUD.

Zoom: mouse wheel steps PPU through `[24, 32, 40]` and recomputes frustum + clamp. No continuous zoom (breaks the pixel grid). Picking: raycast with `Raycaster.setFromCamera` using CSS-pixel NDC; the ortho frustum maps to the full canvas.

## 2. Pixel look

Render the scene into a low-res `WebGLRenderTarget`, then blit to the canvas with nearest filtering at an **integer** scale (non-integer scaling makes uneven pixel widths).

```ts
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.NoToneMapping;  // exact palette control
const rt = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  const phys = renderer.getDrawingBufferSize(new THREE.Vector2());
  const scale = Math.max(1, Math.round(phys.y / 384));   // internal height lands in ~320-480
  const w = Math.ceil(phys.x / scale), h = Math.ceil(phys.y / scale);
  rt.setSize(w, h);
  blitMat.uniforms.uvScale.value.set(phys.x / (w * scale), phys.y / (h * scale)); // crop the <1 texel overshoot
  sizeCamera(camera, w, h);
}
// frame: renderer.setRenderTarget(rt); renderer.render(scene, camera);
//        renderer.setRenderTarget(null); renderer.render(blitScene, blitCam);  // fullscreen quad
```

No MSAA anywhere (aliasing is the look). DPR is handled by measuring the physical drawing buffer, so a 2× retina display just gets a bigger integer scale, never more internal detail.

**Palette quantization + ordered dither: yes, on by default, toggle in settings.** It's one cheap fullscreen pass and is what turns "low-res 3D" into "90s pre-rendered sprite". Quantize in display (sRGB) space, after the output transform, so the steps look even:

```glsl
// blit fragment (THREE.ShaderMaterial; linearToOutputTexel is injected by three)
uniform sampler2D tScene; uniform vec2 uvScale; uniform float levels; // levels = 8.0 (0 disables)
varying vec2 vUv;
const mat4 BAYER = mat4( 0., 8., 2.,10., 12., 4.,14., 6., 3.,11., 1., 9., 15., 7.,13., 5.) / 16.;
void main() {
  vec2 uv = vUv * uvScale;
  vec4 c = linearToOutputTexel(texture2D(tScene, uv));
  if (levels > 0.0) {
    ivec2 p = ivec2(uv * vec2(textureSize(tScene, 0))) % 4;      // dither on the LOW-RES texel grid
    float d = BAYER[p.x][p.y] - 0.5;
    c.rgb = floor(c.rgb * (levels - 1.0) + 0.5 + d * 0.6) / (levels - 1.0);
  }
  gl_FragColor = vec4(c.rgb, 1.0);   // no colorspace_fragment include: already converted above
}
```

Per-channel posterize (8 levels = 512 colors) is the v1 choice. A true 32-64 color palette LUT per biome looks more authentic but needs palette authoring; upgrade later if the posterize reads too "digital".

UI (HUD, tooltips, floating bounty text, health numbers) is DOM at native resolution layered over the canvas, never rendered into the low-res target.

## 3. Lighting & materials

- **`MeshLambertMaterial({ flatShading: true })` everywhere.** Per-fragment Lambert is far cheaper than `MeshStandardMaterial` (no PBR, no env map) and the faceted look is exactly what we want. Standard's specular/roughness subtlety is destroyed by 360p + posterize anyway. `MeshToonMaterial` is redundant with the posterize pass.
- Emissives (lights, glows, VFX): `MeshBasicMaterial`, unlit, full-saturation. These are the only pure-bright pixels in a frame, which makes them pop after quantization.
- **Key light:** one `DirectionalLight`, from screen upper-left (shadows fall down-right), `position = target + (-6, 14, -5)`, intensity ~2.0 (tune). `castShadow`, `shadow.mapSize = 1024` (≈ 1 shadow texel per screen pixel over the 28×20 shadow frustum), `renderer.shadowMap.type = THREE.BasicShadowMap` (hard, unfiltered, cheapest), `shadow.bias = -0.0005`, `normalBias = 0.02`. Shadow camera covers the whole map once (`left -14 … right 14`, etc.), static.
- **Fill:** `HemisphereLight(sky, ground, ~0.8)` tinted per biome. No ambient-only fill (looks dead).
- **Fog: none.** Ortho cameras have near-constant depth so fog just tints everything. `scene.background` = biome void color.
- Casters: towers, enemies, cliffs, tall decor. Receivers: terrain only.

Biome palettes (hex; ground base/alt are jittered ±6% per tile):

| Biome | Ground base / alt | Path | Cliff | Accent emissive | Key light | Hemi sky / ground | Void |
|---|---|---|---|---|---|---|---|
| Dustbelt (badlands) | `#7a5a3a` / `#6b4e33` | `#4a3828` | `#5c4330` | `#ffb030` | `#ffe2b8` | `#c9b08a` / `#3a2a1c` | `#140e09` |
| Cinder (ash world) | `#3c3a3a` / `#333131` | `#26201e` | `#2a2626` | `#ff5a1a` lava cracks | `#ffd0a0` | `#8a7a70` / `#1a1210` | `#0c0808` |
| Orbital Platform | `#4a5058` / `#40464e` (metal plates) | `#2c3036` | `#5a6068` | `#38e0d0` | `#dfe8ff` | `#8fa4c0` / `#1a1e26` | `#04050a` + starfield |
| Frostline (ice) | `#a8bccb` / `#98aebe` | `#6a7f90` | `#7c90a2` | `#7af0ff` | `#f0f6ff` | `#cfe4ff` / `#3a4a5a` | `#0a1018` |

## 4. Terrain

- One `InstancedMesh` of `BoxGeometry(1,1,1)` **per tile kind**; instance matrix sets position + y-scale; `setColorAt` gives per-tile color jitter (the cheapest ground detail there is).
  - **Ground:** top at `y = 0 ± 0.03` jitter, alternate base/alt color via hashed `(col,row)`.
  - **Path:** top recessed to `y = -0.08`, darker, slight jitter. A thin curb (0.04 high) along path edges via one more instanced mesh is optional.
  - **Build pad:** metal plate top `y = +0.05`, color `#5a6470`, plus a glowing frame: 4 thin boxes merged with `BufferGeometryUtils.mergeGeometries` → one `InstancedMesh` with `MeshBasicMaterial` in the biome accent (dim, `0.6×`). Occupied pads switch frame color to team amber via `setColorAt`.
  - **Blocked/high ground:** plateaus raised 0.5-1.0 with darker cliff color; they cast shadows onto the path for depth.
- **Decor** (`InstancedMesh` per prop type, ≤ 6 types): rocks (`IcosahedronGeometry(0.15, 0)`, random yaw/scale), crystal shards (5-sided `ConeGeometry`, emissive), pipes/vents, crates, dead spires, debris. Placed with a seeded RNG from the map id on non-path, non-pad tiles only, 0-3 per tile. Never on build pads or path (readability).
- Ground detail beyond color jitter (cracks, rivet lines on metal): only if cheap, e.g. a 16×16 `NearestFilter` `DataTexture` tiled on the ground material. Skip for v1.
- Spawn/exit markers: emissive hostile-red portal ring at spawn, team-blue gate at the exit.

## 5. Towers & enemies

Construction rules: primitives only (`Box`, 6/8-sided `Cylinder`, `Cone`, `Icosahedron` detail 0), 50-300 tris per model, chunky silhouettes, at least one emissive detail per model. Each part's geometry is baked with vertex colors and merged per type (see §8).

- **Scale:** tile = 1 unit. Tower footprint 0.8×0.8, height 0.6-1.2. Enemies: small 0.3-0.35, medium 0.5, heavy 0.7-0.8, boss 1.1-1.3 (may exceed a tile). Taller = more important.
- **Player team colors:** steel blue `#4a6f9a` panels, gunmetal `#2e3540` base, amber `#ffb030` emissive lights/visors. Every tower shares this so the player's stuff reads as one faction.
- **Hostiles:** an original bio-mechanical swarm, chitin purples/bone `#6a3a6e` / `#c8b89a`, toxic green `#8cff4a` or magenta `#ff3ab0` glow. Never blue or amber (reserved for the player).
- **Tower rig:** `base` (static) → `turret` (yaw pivot at top of base) → `barrel` (optional pitch). Yaw toward target with a turn rate (e.g. 6 rad/s, shortest-angle lerp) so turrets visibly swing; snap is acceptable for beam towers. Muzzle point = local offset transformed by the turret instance matrix.
- **Idle:** turret slow sweep ±30° when no target; blinking amber light (1 Hz, phase offset per tower); radar/dish spin on support towers. Build: scale-y 0→1 over 0.4 s + dust puff. Sell: reverse.
- **Enemy anim (all via instance matrix, no skeletons):** yaw toward movement direction, bob `y += 0.03·|sin(t·speed·8)|`, waddle roll ±5°, flyers hover at y=0.6 with a drop shadow blob. Hit flash: `setColorAt(i, (3,3,3))` for 60 ms (instance color multiplies vertex color; clamps to near-white).
- **Health bars:** one `InstancedMesh` of thin boxes above enemies, only for damaged enemies, green→yellow→red via instance color.
- **Selection:** green ground ellipse (`RingGeometry`) under the selected tower; range shown as a `LineLoop` circle (48 segments) in team blue. Placement ghost = tower geometry with translucent green/red `MeshBasicMaterial`.

## 6. VFX

Everything pooled: preallocate per effect type, recycle by index, `mesh.count = live`. No allocation in the frame loop.

| Effect | Technique | Life |
|---|---|---|
| Muzzle flash | Instanced 4-point star quad, camera-facing, `MeshBasicMaterial` additive, amber/white | 50 ms |
| Tracers | One shared `LineSegments`, preallocated `Float32Array`, `setDrawRange`. WebGL lines are 1 px, which at low-res = one chunky texel: perfect | 60-80 ms |
| Projectiles | `InstancedMesh` per type (small emissive box/icosahedron), sim-interpolated position | flight |
| Explosion | Instanced `IcosahedronGeometry(1,0)` `MeshBasicMaterial`: scale 0.2→0.8 ease-out, color white→amber→dark red via `setColorAt`, then shrink; plus 6-8 instanced debris cubes with gravity. Posterize makes it read as a sprite. Flipbook billboard shader: skip unless this falls short | 300 ms |
| Slow field | Flat `RingGeometry` at y=0.02, cyan, transparent, `depthWrite:false`, opacity + radius pulse; small rising cyan cubes optional | while active |
| Chain lightning | Same `LineSegments` buffer: each hop subdivided into 6 points with ±0.15 perpendicular jitter, re-jittered every 2 frames, white core + cyan duplicate offset 1 texel | 120 ms |
| Death splat | Instanced flat 7-gon on ground (y=0.01), ichor color, fades by lerping instance color toward ground color (no per-instance opacity needed), pool 64, oldest recycled | 4 s |
| Floating "+$15" | DOM `<span>` pool (≤ 24) in an overlay; position via `Vector3.project(camera)` → CSS px; CSS keyframe rise 24px + fade over 800 ms; amber Share Tech Mono with 1px black text-shadow | 800 ms |

Screen shake: only on leak (enemy reaches exit) and boss death, ±2 low-res texels, 200 ms.

## 7. UI style (DOM/CSS)

> **Superseded (Stage 10).** The UI now follows `docs/design/ui-revamp.md`: a StarCraft II-style navy glass console set in Saira, with tokens in `src/ui/tokens.css` and components in `src/ui/components.css`. The SC1 riveted-metal console below (scanlines, CRT green, portrait box, Share Tech Mono / Rajdhani / Orbitron) is kept for history only.

Fonts (Google Fonts, free): **Share Tech Mono** (all numbers/readouts), **Rajdhani** 600/700 (labels, buttons, body), **Orbitron** 700 (game title and screen headers only).

```css
:root {
  --metal-900: #12151a; --metal-800: #1c2026; --metal-700: #2a3038; --metal-600: #3a414b; --metal-400: #6b7480;
  --bevel-hi: rgba(255,255,255,.14); --bevel-lo: rgba(0,0,0,.65);
  --readout: #3cff9e; --readout-dim: #1f8a58; --teal: #38e0d0; --team-blue: #4a6f9a;
  --amber: #ffb030; --danger: #ff4a3a; --text: #c8d0d8; --text-dim: #7d8794;
  --font-mono: 'Share Tech Mono', monospace; --font-ui: 'Rajdhani', sans-serif; --font-title: 'Orbitron', sans-serif;
}
.panel {
  background:
    radial-gradient(circle at 8px 8px, var(--metal-400) 2px, transparent 3px),            /* rivets */
    radial-gradient(circle at calc(100% - 8px) 8px, var(--metal-400) 2px, transparent 3px),
    linear-gradient(180deg, var(--metal-600), var(--metal-800) 60%, var(--metal-900));
  box-shadow: inset 1px 1px 0 var(--bevel-hi), inset -1px -1px 0 var(--bevel-lo), 0 0 0 1px #000;
  clip-path: polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%, 0 10px);  /* chamfer */
}
.screen { background: #050a08; box-shadow: inset 0 0 0 1px #000, inset 0 0 12px rgba(60,255,158,.12);
  color: var(--readout); font-family: var(--font-mono); text-shadow: 0 0 4px rgba(60,255,158,.5); }
.scanlines::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(0,0,0,.25) 0 1px, transparent 1px 3px); }
```

**In-game HUD**
- **Top bar (right-aligned, slim):** credits (crystal icon via CSS `clip-path` hexagon in teal + number), lives (core icon, red when ≤ 5), wave `07/20`, game speed and pause buttons. Numbers tick up/down rather than jump.
- **Bottom console** (`height: clamp(150px, 22vh, 200px)`, full width, `.panel`), left→right:
  1. **Wave panel** (`.screen`): next wave countdown, incoming enemy types as small icons with armor tags, "Call wave early (+bonus)" button.
  2. **Portrait box** (96×96 `.screen.scanlines`): selected tower's icon over animated static noise (CSS animated background-position on a noise gradient); idle state shows a flickering comms glyph.
  3. **Info panel** (`.screen`): name, level pips, damage/rate/range/type, kills, upgrade cost, sell value. Readout green, costs amber, unaffordable red.
  4. **Command card:** 3×2 grid of 56px square `<button>`s, each a bevelled `.panel` with an icon and the hotkey letter in the top-left corner (Share Tech Mono, amber). States: hover = teal outline, active/pressed = inverted bevel, disabled = desaturated + 40% opacity, unaffordable = red cost. With nothing selected it shows the 6 buildable towers; with a tower selected: upgrade A/B, targeting mode, sell, cancel.
- **Tooltips:** `.screen` box with 1px teal border, title (Rajdhani 700), cost in amber with crystal icon, 1-2 line description, hotkey. Appear after 250 ms, anchored above the command card.
- Accessibility basics: real `<button>`s, `aria-label` + `title`, visible focus ring (teal), all hotkeys also clickable, `prefers-reduced-motion` disables shake/scanline flicker.

**Home screen**
- Backdrop: a 2D `<canvas>` starfield (~300 stars, 3 parallax layers, slow drift) plus a CSS planet (large `radial-gradient` circle, off-center bottom-left, dark side + thin teal rim light via `box-shadow`). No WebGL needed here.
- Center/left metal `.panel` menu: title in Orbitron with subtle teal glow, buttons Play / Settings / Credits stacked as bevelled bars.
- Map select: grid of map cards (`.panel` with a `.screen` thumbnail). Thumbnails drawn on a 2D canvas from map data at 4 px/tile (ground/path/pads/cliffs in biome colors, spawn red, exit blue), `image-rendering: pixelated`. Same function later doubles as an in-game minimap. Card shows name, biome, wave count, best result.
- Difficulty selector: native radio group styled as a segmented metal switch (Recruit / Veteran / Elite, labels original), selected segment lit amber.

## 8. Performance budget

Target: **60 fps on integrated GPUs** (Intel Iris Xe class), `renderer.info.render.calls < 150` including the shadow pass, < 100k triangles. The low-res target makes fill cost trivial (~250k px/frame); the real costs are draw calls and JS per-frame work.

- **Instancing:** one `InstancedMesh` per enemy type, per tower type per part (base, turret), per tile kind, per decor type, per VFX type. Merge multi-part models per type into one geometry with a vertex `color` attribute + `MeshLambertMaterial({ vertexColors: true, flatShading: true })`. Capacity: enemies 256/type, towers = pad count.
- `instanceMatrix.setUsage(THREE.DynamicDrawUsage)` on moving meshes; set `needsUpdate` only when changed; `mesh.count = live`.
- `frustumCulled = false` on dynamic instanced meshes (the whole map is ~on screen; stale bounding spheres cause popping).
- Reuse scratch `Matrix4/Vector3/Quaternion/Color` objects; no allocation in the frame loop.
- Render interpolates between fixed sim ticks; render reads sim state, never mutates it.
- Shadows: one 1024² basic shadow map; static terrain does not cast.
- Rough call count: terrain/decor ~10, towers ~12, enemies ~8, VFX/lines/bars ~10, blit 1 → ~41, ×~1.7 with shadow casters ≈ 70. Headroom for 2× content.
- Dev overlay (`?debug`): fps, `renderer.info.render.calls`, triangles, live entity counts.

## 9. Audio (v1 note)

No audio assets in v1. WebAudio-synthesized SFX: one `AudioContext` created on first user gesture; short oscillator blips (square/saw) with gain envelopes for shots, noise-buffer bursts for explosions, descending tones for leaks, a 2-note chime for wave start. Throttle identical sounds (max 4 per 50 ms) and keep a master volume + mute in settings.
