# UI Revamp: Home Screen and HUD (Stage 10)

Owner: UI art director. Consumers: the P1 foundation engineer, the P2 home engineer and the P2 HUD engineer (see `docs/PLAN.md`, Stage 10).

- **Reference:** `docs/design/reference/sc2-ui-states.webp`.
- **Canonical CSS:** `docs/design/ui-mockup.html`. Its `<style id="tokens">` and `<style id="components">` blocks are the source for `tokens.css` and `components.css`. Open it at `/docs/design/ui-mockup.html` under `npm run dev`.

## 0. Direction in one paragraph

The UI moves from the StarCraft 1 look (riveted gunmetal, green CRT readouts, scanlines) to a StarCraft II-style navy glass console:

- deep navy surfaces;
- thin cyan-blue borders whose brightness *is* the state;
- outer glow for selection;
- a gold primary call to action with a chevron notch, and a blue secondary;
- wide geometric caps (Saira at 125% width);
- white tabular numbers.

The player palette in GDD §11 is steel blue + amber, so this direction fits it: blue frames read as "ours", gold means "act". Hostile colours (magenta, toxic green, red) stay reserved for enemies and danger.

**What gets removed:** scanlines, CRT green, static noise, the portrait box, rivets, Orbitron, Rajdhani and Share Tech Mono.

**IP:** the IP stays original. We copy no emblems, logos, faction art or names from the reference. The reference's portraits and race icons map to our own map thumbnails and line-art icons in `src/ui/icons.ts`.

What the current build does that this spec fixes (measured in the browser at 1024×768, 1280×720 and 375×812):

- **Home at 1024×768:** the LAUNCH button overflows the right edge by 12 px (`brief-bottom` is a `1fr auto` grid and the difficulty switch can't shrink).
- **Home at 375 px:** LAUNCH sits below about 1.5 screens of scroll, because the briefing duplicates the selected map's thumbnail at 20 px/tile.
- **HUD at 1280×720:** the console is 158 px (22% of height). **Target: 132 px.**
- **HUD at 375×812:** the console is 287 px (35%), and the tower info column is about 50 px wide, so "ARC COIL" wraps one letter per line. **Target: about 200 px (25%) and a fixed height.**

---

## 1. Design tokens

All tokens live in `src/ui/tokens.css` on `:root`; the values are in the mockup's `tokens` block. Names and hex values below are normative.

### 1.1 The state ladder

This is the core of the look. Every selectable thing (map card, build button, power button, segment) uses the same five states. The values were sampled from the reference tiles.

| State | Border | Inner bevel | Outer | Fill (top → bottom) | Text / icon |
|---|---|---|---|---|---|
| **Locked** (visible, not available; click explains why) | `#223241` | `#152331` | none | `#04121f` flat | `#62839a`, art at 40% opacity |
| **Normal** | `#3b6990` | `#21496c` | 1 px halo `#093153` | `#00203e` → `#00162f` | `#8dbfea` |
| **Hover / focus-within** | `#60a0c8` | `#367097` | 1 px `#104665` + 8 px `rgba(47,140,255,.25)` | `#003054` → `#00203f` | `#cce7ff` |
| **Selected** (`:checked`, `aria-pressed=true`) | `#95dcff` (top highlight `#b9f3ff`) | `#5c9dd0` | glow `--glow-select`: 6 px `rgba(8,80,170,.95)` + 18 px `rgba(8,80,170,.55)` | `#013984` → `#002a5c` → `#001a3d` | `#ffffff` |
| **Disabled** (inert) | as locked, plus `cursor: not-allowed` | | | | as locked |

Rules:

- **Locked vs disabled.** Locked uses `aria-disabled="true"`: the element stays focusable and clickable so it can explain itself (for example the existing "Not enough credits" flash). Disabled uses the `disabled` attribute and is truly inert.
- **What uses which:** unaffordable towers and STANDBY powers are *locked*. Call Wave on the last wave and Upgrade at MAX are *disabled*.
- **Gold corner check.** A selected **radio** tile also gets the gold corner check (top-right, 24 px, `#f7c06e` stroke over a 28% gold fill, `#ffe3ad` tick). It means "this is what will launch", and it is the reference's "equipped" marker.

### 1.2 Colour tokens

| Group | Token: hex (use) |
|---|---|
| Surfaces | `--bg-0 #020c16` (floor) · `--bg-1 #061a2e` · `--bg-2 #0a2444` (backdrop glow) · `--surface #00162f` · `--surface-hi #00203e` · `--surface-hover #003054` · `--surface-sel #013984` · `--surface-locked #04121f` · `--well #010b13` (recessed readouts) · `--panel-hi rgba(10,36,66,.96)` / `--panel-lo rgba(3,16,32,.97)` (panel fill) · `--panel-edge-hi #2c5a85` / `--panel-edge-lo #12304f` (panel frame) |
| Lines | the ladder above, plus `--line-faint #14304d` (list rows, dividers) |
| Text | `--text-locked #62839a` (4.7:1 on locked) · `--text-dim #6b8aa3` (5.0:1) · `--text #8dbfea` (9.3:1) · `--text-body #b8d4ec` (11.8:1) · `--text-hover #cce7ff` · `--text-sel #fff` · `--cyan #57d1ff` (headers, specials, credits icon) · `--cyan-dim #2a9fd0` (6.0:1) |
| Positive | `--pos #1fad29` · `--pos-hover #3dd447` (READY, refunds, upgrade deltas) · `--pos-sel #4df458` · `--pos-pale #ccffd0` (early-call bonus on gold) |
| Gold (primary, costs) | `--gold-100 #ffe3ad` (text, pressed) · `--gold-200 #eed5a0` (text, normal: 11.6:1) · `--gold-300 #f7c06e` (border, pressed) · `--gold-400 #cca05d` (border, hover) · `--gold-500 #8c6937` (border, normal) · `--gold-600 #6d4515` (inner bevel) · `--gold-700 #3a2413` (casing) · `--gold-800 #321705` / `--gold-900 #1a0901` (fill) · `--gold-glow #ff9d2a` · `--cost #cf9d3d` (price text, 7.4:1) · `--cost-hi #ffce71` · disabled: `--gold-dis-line #3e3630`, `--gold-dis-fill #1a1612`, `--gold-dis-text #8a8178` |
| Blue (secondary) | `--blue-100 #d8ecff` (text, hover) · `--blue-200 #9dbddb` (text, normal: 8.4:1) · `--blue-300 #98d1ff` (border, pressed) · `--blue-400 #5b8fc6` (border, hover) · `--blue-500 #3f6080` (border, normal) · `--blue-700 #1e436b` (inner bevel) · `--blue-800 #041f3f` / `--blue-900 #00081a` (fill) · `--blue-glow #2f8cff` · disabled: `--blue-dis-line #2b3a4c`, `--blue-dis-fill #08121e`, `--blue-dis-text #5d7186` |
| Danger | `--danger #ff6b5c` (text, 6.5:1) · `--danger-line #c0281e` · `--danger-hi #ff6a4a` → `--danger-lo #b3180c` (boss HP fill) · `--danger-glow #ff2a1a` |
| Bars | `--bar-track #002234` · `--bar-line #0d2c48` · `--bar-hi #2a7fd6` → `--bar-lo #0a56a8` (fill) · `--shield-hi #9ad8ff` → `--shield-lo #2f7cff` · `--tick #d9d21c` / `--tick-hi #f4ee7a` (yellow markers) |
| Badges (ring / disc) | blue `#74b6fd` / `#002c6c` · white `#dbf1ff` / `#0a2a5f` · gold `#fec793` / `#4e270d` · violet `#a9b0dc` / `#252958` |
| Game semantics (unchanged) | `--dt-normal #c8d0d8` · `--dt-concussive #38e0d0` · `--dt-explosive #ff8a3a` · `--dt-plasma #c48cff` · `--chorus #ff3ab0` · `--remnant #8cff4a` |
| Focus | `--focus #ffe3ad`: a 2 px outline at 3 px offset, 14.6:1 on navy. It differs from both the selected blue and the gold border because of the offset gap. |

The reference's subtitle blue `#187da3` measures 3.9:1 on `--surface`, so it is used for lines only, never small text. The reference's locked text `#405f71` (2.8:1) is raised to `#62839a`.

### 1.3 Recipes

**Bevel** (on every control):

```css
--bevel: inset 0 1px 0 rgba(160,210,255,.14), inset 0 -1px 0 rgba(0,0,0,.55);
```

**Glows:**

```css
--glow-hover:  0 0 0 1px var(--line-hover-halo), 0 0 8px rgba(47,140,255,.25);
--glow-select: 0 0 0 1px #0d4f9a, 0 0 6px 1px rgba(8,80,170,.95), 0 0 18px 4px rgba(8,80,170,.55);
--glow-gold:   0 0 0 2px #774307, 0 0 14px 2px rgba(255,157,42,.5);
```

**Buttons: two-ring casing.** The `border` is the coloured ring. Two outer box-shadows make the casing: a 2 px gunmetal ring (`--gold-700` or `#0f1f33`) and a 1 px black ring. One inset ring is the inner bevel. This matches the reference's "frame inside a frame" without images.

**Panel chamfer:**

```css
--chamfer: polygon(var(--cut) 0, calc(100% - var(--cut)) 0, 100% var(--cut), 100% 100%, 0 100%, 0 var(--cut));
--cut: 10px;   /* console 14px, modal 14px, small 6px */
```

`--chamfer` is declared on `.panel` itself, not on `:root`: a `var()` inside a custom property resolves where it is declared, so a `:root` declaration would freeze `--cut` at 10px and ignore per-element overrides (the mockup has this bug; `components.css` fixes it).

How the 1 px chamfered frame is built:

- the element's background is the frame gradient (`--panel-edge-hi` → `--panel-edge-lo`), clipped;
- a `::before` at `inset: 1px` carries the fill, using the same clip-path;
- an `::after` draws 14 px bright corner brackets (`--line-hover`) at the bottom corners.

**Chevron notch** (large CTA only): two pseudo-elements, each a `clip-path: polygon(0 0, 100% 0, 50% 100%)` triangle sitting `3px` below the button (past the casing ring):

- `::before` is the 46×13 casing in `--gold-700`;
- `::after` is the 22×8 gem, a gradient from `--gold-100` through `--gold-glow` to `#bc5f06`. It brightens on hover and press.

The button needs `margin-bottom: 12px` or more. The blue variant uses the same shapes with the blue gem.

### 1.4 Typography

**Font: Saira, variable, one family and one request.** It has a width axis (100–125%) and a weight axis (400–800), so it covers both the Eurostile-style wide caps and a readable body face. It has tabular numerals (verified: "1111" and "0000" are the same width with `tabular-nums`). The latin woff2 is about 97 KB. Michroma was the runner-up: it is closer to Eurostile but has a single weight and no body cut.

**Loading.** P1 adds these lines to `<head>` in `index.html` and `dev/ui.html`, and deletes the `@import` at the top of `styles.css`:

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira:wdth,wght@100..125,400..800&display=swap" />
```

Why a `<link>` rather than `@import`:

- `@import url()` must be the first rule of the final bundled CSS. After the split there are four CSS files, so it would end up mid-bundle and be dropped.
- A `<link>` also loads in parallel instead of chaining.

**The axis range must stay in the URL** (`wdth,wght@100..125,400..800`). Requesting a static weight loses the width axis.

```css
--font-display: 'Saira', 'Eurostile', 'Microgramma', Verdana, sans-serif;  /* + font-stretch: var(--wide) */
--font-body:    'Saira', 'Segoe UI', system-ui, sans-serif;               /* font-stretch 100% (default) */
--wide: 125%;
```

Verdana is the fallback because it is the widest common system face. If Google Fonts is blocked, the UI still reads as "wide caps".

| Role | Font | Size | Weight | Stretch | Tracking | Case |
|---|---|---|---|---|---|---|
| Hero title | display | `clamp(30px, 6vw, 72px)` (home uses `clamp(28px, 4.5vw, 60px)`) | 800 | 125% | .08em | caps |
| Modal title | display | 30px | 800 | 125% | .14em | caps |
| Panel header `.panel-h` | display | 12px | 700 | 125% | .16em | caps, `--cyan` |
| Label (`.res-label`, `dt`, `.stat-k`) | display | 11px (10px allowed only inside 48 px command tiles) | 700 | 125% | .14em | caps, `--text-dim` |
| Button | display | 13px (`.btn-lg` 16px) | 700 | 125% | .12em / .16em | caps |
| Body | body | 14px / 1.35 | 500 | 100% | 0 | sentence |
| Readout number | display | 18px (top bar), 16px (console stats) | 600 | 100% | 0 | `tabular-nums` |
| Badge digit | display | 46% of badge size | 800 | 125% | 0 | tabular |

**Gotcha: the `font:` shorthand resets `font-stretch` to normal.** Always write `font-stretch: var(--wide)` *after* any `font:` shorthand. Every changing number (credits tick every frame, countdowns, HP) gets `font-variant-numeric: tabular-nums`, or it jitters.

### 1.5 Space, radii, motion, layers

| Token | Value |
|---|---|
| Spacing | `--sp-1 4px` · `--sp-2 8px` · `--sp-3 12px` · `--sp-4 16px` · `--sp-5 24px` · `--sp-6 32px` |
| Radii | `--r-1 2px` (controls, tiles) · `--r-2 4px` · badges 50% · panels use the chamfer, not a radius |
| Motion | `--t-fast 90ms` (press) · `--t 140ms` (hover colour/border) · `--t-slow 220ms` (selection glow) · `--ease cubic-bezier(.2,.7,.2,1)` |
| Z (inside `#ui`) | `--z-hud 10` (top bar, console) · `--z-floats 20` · `--z-toast 30` · `--z-modal 50` · `--z-home 100` |

---

## 2. Component inventory

All recipes are in `components.css` (mockup `components` block).

**State API.** State is expressed through attributes, not classes:

- `:checked` and `[aria-pressed="true"]` mean selected;
- `[aria-disabled="true"]` means locked;
- `:disabled` means disabled;
- `[data-ready]` marks a charged power.

Both screens and both P2 engineers share this. Class names below are final.

| Component | Class / markup | States | Used by |
|---|---|---|---|
| **Panel** | `.panel` (+ `.panel-h` header) on a non-focusable container; `--cut` overridable | static | home maps and brief panels, HUD top-bar groups, console, modal |
| **Well** | `.well`: recessed `#010b13`, `inset 0 0 0 1px #0a2238` + inner shadow | static | console sections, briefing text, stepper value |
| **Primary button** | `button.btn.btn-primary` (+ `.btn-lg`, `.btn-chevron`, `.is-pulsing`) | normal `#8c6937` · hover `#cca05d` + 12 px halo · pressed (`:active`, `[aria-pressed=true]`) `#f7c06e` + `--glow-gold` · disabled `#3e3630`, text `#8a8178` · focus ring | Home START, HUD BEGIN ASSAULT / CALL WAVE, modal Resume, end-screen primary |
| **Secondary button** | `button.btn.btn-secondary` (+ `.btn-lg`, `.btn-chevron`) | normal `#3f6080` · hover `#5b8fc6` · pressed `#98d1ff` + blue glow · disabled `#2b3a4c` | Upgrade, Target, Restart, Retry, Main menu |
| **Danger flavour** | add `.btn-danger` to a secondary | blue at rest; hover border `#c0281e`, text `#ffd6d0`; press fill `#5a1410` | Sell, Quit to menu |
| **Icon button** | `button.btn.btn-secondary.btn-icon`: 32×32, SVG 16 px, `aria-label` + `title` required. Toggles use `aria-pressed`. | as secondary | pause/menu, speed (text `1×`), mute, stepper ± |
| **Keycap** | `<kbd>`: 10px display, `--gold-200` on `rgba(0,0,0,.45)`, 1 px `--gold-600` | static | hotkey hints |
| **Tile** | radio form `<label><input class="sr-only" type="radio"><span class="tile">…</span></label>` · button form `<button class="tile" aria-pressed>` · dimmable art gets `.tile-art` | full ladder (§1.1). Gold corner check only on `:checked + .tile`. Locked + pressed keeps the selected frame (build armed, then credits dropped). | map cards, build buttons, power buttons |
| **Segmented** | `<div class="seg" role="radiogroup" aria-label>` with `<label><input class="sr-only" type="radio"><span>Text</span></label>` children | normal (`--text` on `--well`) · hover (`--surface-hover`) · checked (blue fill `#0f3871` → `#001d4a`, 1 px `--line-sel` inset, 12 px glow) · focus ring on the span · disabled `--text-locked`. Checked is **blue, not gold** (gold means "act"). | difficulty, wave mode |
| **Range** | `<input class="range" type="range">`, with JS setting `--val` (fill %) and `--zone` (heavy-zone start %) | track `--bar-track` · fill blue · heavy zone hatched `rgba(255,107,92,.6)` drawn over the fill · thumb 14×22 blue tab with `--line-sel` border and glow · hover thumb border white · focus ring at 6 px offset · disabled 40% opacity | custom wave count |
| **Stepper** | `.btn-icon` − · `<output class="well">` · `.btn-icon` + (home-local markup, mockup `.stepper`) | ± become disabled at min/max | custom wave count |
| **Checkbox** | `<label class="check"><input class="sr-only" type="checkbox"><span class="check-box"></span>Text</label>` | off · hover · on (`--line-sel` + glow, `--text-hover` tick) · focus · disabled | Pause modal "Sound" (§4.6) |
| **Resource readout** | `.res` + `.res-credits` / `.res-lives`; children `.res-ico` (18 px SVG), `.res-val` (18 px, 600, tabular, white, cyan text-shadow), optional `.res-label` | `.is-low`: icon and value `--danger` + 1 s blink | top bar |
| **Bar** | `.bar` > `.bar-fill` (style width) + `i.bar-tick` (style left %) · `.bar-danger` · `.bar-shield` (5 px) | ticks are 4 px wide, overhang 4 px above and below, yellow `--tick-hi` → `--tick` with a black 1 px edge; `.is-past` desaturates | wave progress, boss HP/shield |
| **Badge** | `<span class="badge [badge-white|badge-gold|badge-violet]" style="--size:24px">2</span>` | static; tones are semantic (below) | wave number, tower level, map tier |
| **Chip** | `.chip[data-type]` (damage types); for enemy tags set `color` | static | info panel, incoming list |
| **Tip card** | `.tip` + `.tip-title`: border `--line-hover`, fill `rgba(0,48,84,.55)` → `rgba(1,11,19,.92)`, 10 px blue glow | static | HUD info-panel schematic view (build or power hover). No floating tooltips: icon buttons use `title`. |
| **List row** | `<dl class="rows"><div class="row"><dt>…</dt><dd>…</dd></div></dl>`: label left (11px caps dim), value right (white, tabular) | static (rows are never interactive here) | home intel, end-screen stats |
| **Modal** | `.modal-backdrop` > `.panel.modal[role=dialog][aria-modal=true]` > `.modal-title`, `.modal-sub`, `.modal-actions` | — | pause, victory, defeat |

**Badge tones:**

- **Tower level:** L1 blue, L2 white, L3 gold.
- **Map tier:** 1 blue, 2 white, 3 gold, 4 and up violet.
- **Wave badge:** blue; violet on boss waves; gold on the final wave.

**Checkbox and the reduced checkbox scope.** The only consumer is the Pause modal "Sound" row. Implement `.check` with that row and nothing more.

---

## 3. Home screen

### 3.1 Structure (DOM order = tab order)

```
.sm-home (scroll container below 1100 px)
  canvas.home-stars, .home-planet          backdrop (kept, recoloured)
  header.home-title  h1 + p                  title / branding
  main.home-grid
    section.panel.home-maps   .panel-h "Select theatre" · .home-maplist[role=radiogroup] of map tiles
    section.panel.home-brief  .panel-h "Mission briefing" · name + tier badge · dl.rows intel ·
                              .well briefing text · difficulty .seg + flavour + mods · wave control
    div.home-start            button.btn.btn-primary.btn-lg.btn-chevron "Begin operation"
  footer.home-hint            keyboard hint (hidden on touch / narrow)
```

`.home-start` must be a **direct child of `.home-grid`**, not inside the brief panel, so it can be sticky on narrow screens (sticky can't leave its parent's box).

### 3.2 Desktop (≥1100 px)

```
┌───────────────────────────────── STEEL MERIDIAN ─────────────────────────────────┐
│                         ──── FRONTIER DEFENSE COMMAND ────                        │
├───────────────────────────────────────────────────────┬──────────────────────────┤
│ SELECT THEATRE ─────────────────────────── 6 THEATRES │ MISSION BRIEFING ─────── │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │ DUST RIDGE OUTPOST   (1) │
│ │ thumb ①│ │ thumb ②│ │ thumb ③│ │ thumb  │           │ BIOME  Badlands│WAVES 15 │
│ │DUST    │ │CINDER  │ │HOLLOW  │ │  …     │           │ PATHS  1       │GRID 24×16│
│ │Badlands│ │Volcanic│ │Crystal │ │        │           │ CREDITS 600 cr │LIVES 20 │
│ └────────┘ └────────┘ └────────┘ └────────┘           │ ┌ INCOMING TRANSMISSION ┐│
│ ┌────────┐ ┌────────┐                                 │ │ Commander, the m▌     ││
│ │  …     │ │  …     │                                 │ └───────────────────────┘│
│ └────────┘ └────────┘                                 │ DIFFICULTY               │
│                                                       │ [RECRUIT|VETERAN|ELITE|BRUTAL]
│                                                       │ flavour · HP ×1.00 · …   │
│                                                       │ WAVES [CAMPAIGN · 15|CUSTOM]
│                                                       ├──────────────────────────┤
│                                                       │ [   BEGIN OPERATION   ]  │
│                                                       │           ▾              │
└───────────────────────────────────────────────────────┴──────────────────────────┘
```

```css
.home-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas: 'maps brief' 'maps start';
  gap: 20px;
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 24px 16px;
  min-height: 0;
}
.home-maplist { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
```

- **Map cards scale to 6 and more** through `auto-fill`. If the cards outgrow the panel, `.home-maplist` scrolls (`min-height: 0; overflow: auto`), never the `.panel` itself (§7). At 1280 px that's 4 per row, so 6 maps take 2 rows.
- **Card content:**
  - `.tile-art`: a `--well` letterbox with `aspect-ratio: 3/2`, holding the thumbnail canvas (`width: 100%; height: 100%; object-fit: contain`);
  - a tier badge (24 px) at the art's bottom-right;
  - the name (13px display caps, 2 lines max);
  - meta "Biome · N waves" (12px, `--text-dim`; `--cyan` when selected).
- **Thumbnails** use the existing `drawMapThumbnail(canvas, map, px)` with `px = devicePixelRatio >= 2 ? 16 : 12`. Measured for 3 maps: px 12 took 34 ms, px 16 took 55 ms.
- **Delete the briefing's big thumbnail** (px 20). The selected card is the hero now, and the duplicate is what pushed LAUNCH off-screen on mobile.
- **The brief panel is a flex column.** Only the briefing well flexes (`flex: 1; min-height: 64px; overflow: auto`). Everything else is natural height.
- **Intel** is a 2-column `dl.rows` with 7 rows: Biome · Threat (tier badge) · Waves · Approaches · Grid · Credits · Lives.
- **Title:** Saira 800 / 125%, `clamp(28px, 4.5vw, 60px)`. The fill is a chrome-blue gradient (`#fff` → `#cfe8ff` 40% → `#6f9fd0` 55% → `#e0f1ff`) with `drop-shadow(0 0 12px rgba(47,140,255,.45)) drop-shadow(0 2px 0 #000)`. The subtitle is `--cyan`, 600, tracking .4em, with the two fading rules kept.
- **Backdrop:** keep the starfield canvas and the CSS planet, recoloured:
  - page: `radial-gradient(ellipse at 50% 0%, #0a2444, #061a2e 35%, #020c16 75%)`;
  - stars: `rgba(200,225,255,a)`;
  - planet: `radial-gradient(circle at 62% 30%, #3f6f9a, #1d3a5c 22%, #0c1d33 48%, #030a14 72%)`, with rim light `rgba(120,200,255,.55)`.

### 3.3 Wave-count control (new)

```
WAVES   [ CAMPAIGN · 15 | CUSTOM ]                      ← .seg, 2 options
        ( − ) [ 44 ] ( + )                         (!)  ← shown only for Custom
        ▕██████████████████████████████████▌░░░░╱╱╱╱╱▏  ← .range; hatched zone from wave 41
        10       20       30       41▲      50           ← tick labels, 41 in --tick yellow
        Waves 41–44: bosses and heavies only              ← --danger, only when value ≥ 41
```

- **Campaign** is the default: the map's authored wave count, and its label shows that count.
- **Custom** reveals the stepper and range. Its first value is the campaign count, clamped to [min, max].
- **Range is 10–50.** min, max and the heavy threshold are `CUSTOM_WAVES_MIN` (10), `CUSTOM_WAVES_MAX` (50) and `HEAVY_ONLY_FROM` (41) in `src/data/waves.ts` (§6.5). Never hard-code them; the ticks and `--zone` derive from them. Every map's authored count lies inside the range, so the clamp is a no-op today.
  - `--val = (v - min) / (max - min) * 100%`
  - `--zone = (heavyFrom - min) / (max - min) * 100%`
- **Heavy hint at two levels:**
  - The hatched track zone is always visible in Custom mode.
  - At v ≥ 41: the red note appears, a violet `!` badge sits beside the stepper (`title="Waves 41+: bosses and heavies only"`), and the intel Waves row reads `44 · 41+ heavy`.
- **Persistence** follows the existing pattern: `localStorage` keys `steel-meridian.waveMode` (`campaign | custom`) and `steel-meridian.waves`, wrapped in try/catch.
- **a11y:**
  - the range has `aria-label="Custom wave count"` and `aria-valuetext="44 waves, heavy assault"` when in the zone;
  - the `<output>` mirrors the value;
  - ± have `aria-label`s and become `disabled` at the bounds;
  - Custom-mode elements use `hidden` (not `display: none` via a class), so they leave the tab order.

### 3.4 Narrow (<1100 px) and phone (≤640 px)

- **Below 1100 px** the grid becomes one column, `max-width: 720px`, with `grid-template-areas: 'maps' 'brief' 'start'`. `.sm-home` becomes the scroll container (`overflow-y: auto`) and the inner panels stop scrolling.
- **The start button sticks:**
  - `.home-start { position: sticky; bottom: 0; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: linear-gradient(transparent, var(--bg-0) 40%); }`;
  - the button is full width;
  - it is reachable from every scroll position, which fixes "LAUNCH 1.5 screens down".
- **Cards:** 3 per row from 600 px up, 2 per row below (`minmax(150px, 1fr)` covers both).
- **At ≤640 px:**
  - the title is `clamp(26px, 8vw, 34px)` on one line, and the subtitle tracking drops to .25em;
  - panel padding is 12 px;
  - the difficulty `.seg` goes full width with segments `flex: 1`, padding `9px 4px`, font 11px, tracking .06em (RECRUIT/VETERAN/ELITE/BRUTAL fit 343 px at that size; P2 verifies);
  - intel stays 2 columns;
  - `footer.home-hint` is hidden under `@media (hover: none), (max-width: 640px)`.
- **No horizontal page scroll at 375 px.** P2 checks `document.documentElement.scrollWidth === 375`.

### 3.5 Keyboard (home)

- **Tab order:** map radiogroup (one stop; arrows move the selection, which is native radio behaviour; no 2D roving needed) → difficulty radiogroup → wave-mode radiogroup → (Custom: − · range · +) → BEGIN OPERATION.
- **Initial focus** goes to the selected map radio (existing behaviour).
- **Enter starts** from anywhere except a button (existing `onKey`), including when the range is focused.
- **Focus rings:** `:focus-visible + .tile` / `+ span` draw the `--focus` outline. Radios are `sr-only`, so the ring is on the visual sibling.

---

## 4. In-game HUD

### 4.1 Structure

Top level (all children of `.sm-hud`):

```
.sm-hud
  .hud-vignette
  .hud-top                           ← measured by main.ts for renderer.setInsets(top, …)
      .panel.hud-left    mission label (map · difficulty)
      .panel.hud-wave    wave badge-label "WAVE 07 / 15" · NEXT 0:12 · .bar with boss ticks
      .panel.hud-res     .res-credits · .res-lives · speed · pause · mute (.btn-icon each)
      .panel.hud-boss    (hidden unless a boss is alive) name · nums · .bar-danger · .bar-shield
  .hud-floats · .hud-flash
  .panel.hud-console[data-mode=idle|tower|tip]   ← measured by main.ts for setInsets(…, bottom)
      .well.con-wave       incoming list ("NEXT CONTACTS" + enemy chips)
      .con-call            primary button: BEGIN ASSAULT / CALL WAVE [+60 cr] [SPACE]
      .well.con-info       idle view | tower view (head + stats) | tip view (.tip)
      .con-actions         Target · Upgrade · Sell (visible only in data-mode=tower)
      .well.con-pow        Q, E power tiles
      .well.con-cmd        6 build tiles
  .modal-backdrop (hidden)           pause / victory / defeat
```

Changes from today:

- **Portrait removed.** Its job moves into the info header: tower icon plus level badge.
- **`.con-call` and `.con-actions` become direct children of the console**, so CSS grid areas can place them per breakpoint. Today they're nested in the wave and tower views.
- **The HUD sets `data-mode` on the console** from the `mode` it already computes in `renderInfo`.
- **Wave number, countdown and status move to the top bar.** The console's wave column keeps only incoming contacts and the call button.

### 4.2 Top bar

Height: 38 px panels plus 6 px padding, so 50 px measured (today 54).

```css
.hud-top {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  grid-template-areas: 'left wave res' '. boss .';
  gap: 6px 8px;
  padding: 6px 8px;
  pointer-events: none;
}
```

- **Left:** the mission label (`.res-label`, ellipsis, `min-width: 0`).
- **Centre `.hud-wave`** (min-width 220 px):
  - line 1: `WAVE` label, value `07` (16px white tabular), `/ 15` dim; right-aligned `NEXT 0:12`, `HOLD` (`--cost-hi`) or `--`;
  - line 2: `.bar` showing waves cleared / total, with a `.bar-tick` at every boss wave (mid and final) and one at the first heavy wave when the run has 41 or more;
  - passed ticks get `.is-past`;
  - the status text from today's wave panel ("HOSTILES INBOUND", "FINAL WAVE…") becomes this element's `title` and a visually hidden `role=status` span. Its visible form is the toast.
- **Right `.hud-res`:** credits (cyan hex icon, white value ticking as today), lives (`.is-low` at ≤5), speed (`.btn-icon` showing `1×`/`2×`/`3×`), pause (pause glyph, `aria-label="Pause menu (P)"`; it opens the pause modal as today), mute (`aria-pressed`).
- **Boss** spans the centre column on row 2, `width: min(440px, calc(100vw - 16px))`:
  - name in display 800 12px `--danger` with `0 0 8px` danger glow, plus " · vanguard" for mid bosses;
  - numbers right-aligned (tabular);
  - a `.bar-danger` 8 px HP bar;
  - a `.bar-shield` 5 px bar, hidden when the boss has no shield.
- **Everything covering the canvas at the top must be inside `.hud-top`.** It must stay in normal flow, not `position: absolute`, so `offsetHeight` includes it.

### 4.3 Bottom console

**Desktop (≥1100 px).** Height `--con-h: clamp(124px, 18vh, 168px)`, which is 130 px at 720 and 162 px at 900. `--cmd: clamp(44px, calc((var(--con-h) - 36px) / 2), 64px)`.

```
┌───────────────┬──────────────────────────────────────┬───────────────┬────┬──────────────┐
│ NEXT CONTACTS │ (2) ARC COIL  [PLASMA]               │ TARGET  First │ Q  │ 1   2   3    │
│ 12× Skitter   │ DMG 20  RATE 1.25s  RANGE 3.5  KILLS │ UPGRADE 200cr │    │              │
│ 1× Choir ☠    │ Chain +4 · Shield ×1.5               │ SELL  +336 cr │ E  │ 4   5   6    │
│ [CALL WAVE +60]│ NEXT ▸ DMG 20→26                    │               │    │              │
└───────────────┴──────────────────────────────────────┴───────────────┴────┴──────────────┘
```

```css
.hud-console {
  --cut: 14px;
  height: var(--con-h);
  padding: 12px 12px 10px;
  display: grid;
  gap: 8px 10px;
  grid-template-columns: clamp(200px, 18vw, 260px) minmax(0, 1fr) auto auto auto;
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas: 'wave info actions pow cmd' 'call info actions pow cmd';
}
.con-actions { display: none; }
.hud-console[data-mode='tower'] .con-actions { display: grid; }
```

- **Command tiles (`.tile` button form, `--cmd` square):**
  - icon 58%;
  - hotkey top-left (11px display, `--gold-200`);
  - cost bottom-right (11px tabular, `--cost`; `--danger` when locked);
  - the build/power trays are `.well`s with 5 px padding and 5 px gaps;
  - the power tray sits immediately left of the build tray, with a 1 px `--line-in` divider (GDD §14 placement kept).
- **Build tile states:**
  - normal;
  - hover/focus shows the tip in the info panel (existing `hoverable`);
  - build armed: `aria-pressed=true`, the selected ladder;
  - unaffordable: `aria-disabled=true`, locked, red cost, still clickable to flash.
- **Power tiles** (`.tile.pow`):
  - the conic sweep stays (`--fill`); the sweep colour is `rgba(87,209,255,.7)` over `rgba(0,4,12,.72)`;
  - **STANDBY** (before wave 1): `aria-disabled`, locked ladder, bottom label `STANDBY` (8–9px, `--text-locked`);
  - **charging:** normal ladder, bottom-right seconds (Lance) or `n/3` (mines), white;
  - **ready:** `data-ready`, border `--line-sel`, 10 px cyan glow, a top-right `READY` label (9px, `--pos-hover`), and a single 600 ms `sm-ready-burst` ring each time a charge becomes usable (replacing today's 4-blink);
  - **armed:** `aria-pressed=true`, the selected ladder.
- **Info panel:**
  - tower view: a 24 px level badge (L1 blue, L2 white, L3 gold), `.tip-title` name, damage chip. Stats are label-over-value (`.stat-k` 10px dim / `.stat-v` 16px white tabular) for DMG · RATE · RANGE · DEALT · KILLS. Specials line in `--cyan`, 12px; upgrade delta in `--pos-hover`, 11px;
  - idle view: "No structure selected" plus the existing hints, in `--text-body`;
  - tip view: the whole well becomes a `.tip`.
- **Actions** (`.con-actions`, width `clamp(170px, 14vw, 220px)`): three 30 px secondary buttons, label left and value right (13px tabular), `<kbd>` far right:
  - TARGET, with the value in `--cyan`;
  - UPGRADE, with the value in `--cost` (`--danger` if poor); `disabled` + "MAX" at L3;
  - SELL (`.btn-danger`), with the value in `--pos-hover`.
- **Call** (`.con-call`): `.btn-primary`, 30 px, full width of the wave column. Its content is `label · bonus (--pos-pale) · <kbd>SPACE</kbd>`.
  - "BEGIN ASSAULT" before wave 1, with `.is-pulsing`;
  - "CALL WAVE" afterwards;
  - `disabled` on the last wave or when not playing.
- **Incoming list:** a `NEXT CONTACTS` label plus chips coloured by faction (`--chorus` / `--remnant`), with bosses in `--danger` (blinking).

**Large (≥1500×900):** `--cmd` up to 64 px, plus about 2 px on label/value/body sizes. The existing large-screen media block, rewritten in tokens.

**Mid (641–1099 px):** same grid; the wave column narrows to `clamp(170px, 22vw, 220px)` and actions to 150 px. Stats wrap.

**Phone (≤640 px).** The console becomes three fixed rows and keeps one height. That's 12 + 60 + 6 + 52 + 6 + 44 + 10, about **190 px** (23% of 812), and it doesn't grow when a tower is selected:

```
┌───────────────────────────────────────────┐
│ info row (60px): incoming list  ⟷  tower  │   data-mode=idle → .con-wave ; tower/tip → .con-info
│ name+badge+3 stats  ⟷  build/power tip    │
├───────────────────────────────────────────┤
│ [1][2][3][4][5][6]   ⟷  [TARGET][UPG][SELL]│   data-mode=tower swaps .con-cmd for .con-actions
├───────────────────────────────────────────┤
│ [Q][E]  [ CALL WAVE        +60 cr ]       │
└───────────────────────────────────────────┘
```

```css
@media (max-width: 640px) {
  .sm-hud { --cmd: 52px; }
  .hud-console {
    height: auto;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-rows: 60px var(--cmd) 44px;
    grid-template-areas: 'info info' 'cmd cmd' 'pow call';
  }
  .con-wave, .con-info { grid-area: info; }
  .hud-console[data-mode='idle'] .con-info,
  .hud-console:not([data-mode='idle']) .con-wave { display: none; }
  .con-cmd, .con-actions { grid-area: cmd; }
  .hud-console[data-mode='tower'] .con-cmd { display: none; }
  .con-cmd { grid-template-columns: repeat(6, minmax(0, 1fr)); grid-auto-rows: var(--cmd); }  /* 6 in a row, ~55px at 375 */
  .con-actions { grid-template-columns: repeat(3, 1fr); }                                         /* 3 × ~115px */
  .con-pow { grid-template-columns: repeat(2, 44px); grid-auto-rows: 44px; }
}
```

This is the SC-authentic command-card swap: select a structure and the card shows its commands. Deselect with right-click, Esc or tapping empty ground (existing behaviour), and the build row returns.

- **Info row content at ≤640:**
  - the tower view shows name, badge, chip and DMG/RATE/RANGE only (DEALT/KILLS hidden);
  - the tip view shows name, cost and a one-line description with ellipsis;
  - the idle view is the incoming chips on one line (`overflow-x: auto`).
- **The `[1–6]` hint text is hidden.** Touch users see the build row.
- Kbd hints are hidden inside buttons.
- **Touch targets:** build tiles about 55 px, power tiles 44 px, action buttons 44 px tall. None goes below 44 px.

**Top bar at ≤640 px:**

```css
.hud-top { grid-template-columns: 1fr; grid-template-areas: 'res' 'wave' 'boss'; }
```

- Row 1 is `.hud-res`, full width: credits · lives · spacer · speed · pause. `.hud-left` (mission label) is hidden at ≤640. No element changes parent between breakpoints.
- The mute button is hidden at ≤640; Sound moves to the pause modal (§4.6).
- Row 2: the wave panel at full width, 30 px.
- Row 3: the boss bar.
- Measured height: about 76 px without a boss, about 110 px with one.

### 4.4 Toasts (`hud-flash`)

- **Position:** centred at 24% height.
- **Style:** display 700 15px (≥1500 px: 20px) caps, tracking .12em. The background is a navy band `linear-gradient(90deg, transparent, rgba(1,11,19,.85) 18% 82%, transparent)` with 1 px top/bottom rules fading out at the ends.
- **Kinds:**
  - `info`: text `--gold-100` with a gold glow, rules `--line-hover`;
  - `warn`: `--danger` text with danger glow and `--danger-line` rules (boss wave start, final assault);
  - `good`: `--pos-hover` text (wave cleared).
- **API:** `flash(message: string, kind?: 'info' | 'warn' | 'good')`, defaulting to `'info'`. This is an additive and backward-compatible change to `Hud`.
- **Phone:** wraps (`white-space: normal`), width `calc(100vw - 32px)`, 13px.

### 4.5 Floats and vignette

- **Floats:** `+15` uses Saira 800 / 125%, 20px (≥1500 px: 24px), `--cost-hi`, with the existing 2 px black outline shadow. Damage floats are `#ff8a7a` at 14px.
- **Leak vignette:** unchanged (red).

### 4.6 Pause and end-screen modals

- **Backdrop:** `.modal-backdrop`, `radial-gradient(rgba(2,18,36,.62), rgba(1,6,12,.88))`. **No `backdrop-filter`.** It forces a full-screen blur of the WebGL canvas every frame, and the renderer keeps drawing under the end screens.
- **Pause:**
  - title "Paused", subtitle `--cyan`;
  - actions stacked, 14 px gap: **Resume** (primary), Restart mission (secondary), Quit to menu (secondary + danger);
  - then a `.check` row "Sound", bound to the same `onToggleMute`, at all sizes. This is the only place to mute on phones.
  - Focus goes to Resume (as today).
- **Victory:**
  - the title uses a gold gradient fill (`#fff3d6` → `#f7c06e` 55% → `#b9781e`) with a gold drop-shadow;
  - subtitle `--gold-200`;
  - stats as `dl.rows`;
  - actions in a 2-column row: **Main menu** (primary), Retry (secondary).
- **Defeat:**
  - title `--danger` with a red glow;
  - subtitle `--danger`;
  - actions: **Retry** (primary), Main menu (secondary).
- Focus goes to the dialog box itself (as today, so a held Space can't restart).
- **At 375 px** the modal is `width: min(400px, 100%)` inside 16 px padding, stats rows stay 2-column (label / value), and the end-screen actions stack below 360 px.

---

## 5. Motion and accessibility

**Transitions:**

- hover colour/border/background: `--t` 140 ms;
- selection glow: `--t-slow` 220 ms;
- press: instant inset (`:active` background flip);
- the chevron gem brightens on hover.

**Pulses** (all off under reduced motion):

- `.is-pulsing` gold halo, 2.4 s: the home START, and BEGIN ASSAULT until wave 1 launches;
- power ready burst, 600 ms, once per charge;
- low lives and boss chips: 1 s steps blink;
- the briefing cursor blink.

**`prefers-reduced-motion`:**

- **CSS:** the existing kill switch moves to `tokens.css` and now also covers pseudo-elements. It applies to `.sm-home *, .sm-hud *` and their `::before`/`::after`: `animation: none !important; transition: none !important;`.
- **JS: Web Animations are not covered by that rule.** Today `flash()`, `floatText()` and `leak()` call `el.animate()` and ignore the setting. Under `prefersReducedMotion()` (already in `dom.ts`), keyframes must be opacity-only: no `translate`/`scale` for toasts and floats. The vignette is already opacity-only.
- The typewriter already respects the setting; keep it.

**Focus:**

- `:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px }` on `.btn`, `.tile` and `.range` (6 px offset).
- For radio and checkbox wrappers, the ring goes on the visual sibling.
- Never put `outline: none` without a replacement.
- **Never put focusable elements under `clip-path`.** It clips the outline.

**Contrast:** every text token used for text is at or above 4.5:1 on its surface (ratios in §1.2). Disabled controls are exempt (WCAG 1.4.3) but stay at or above 3:1 (`#5d7186` on `#08121e` is 3.7:1; `#8a8178` on `#1a1612` is 4.7:1).

**Semantics:**

- **ARIA in use:**
  - real `<button>`s and native radios/range;
  - `role=radiogroup` with `aria-label` on the groups;
  - `aria-pressed` for toggles and armed states;
  - `aria-disabled` for locked;
  - `role=dialog` with `aria-modal` for modals;
  - `aria-live` stays on the info panel (polite) and the toast (assertive).
- **The HUD keyboard model is unchanged:** 1–6, Q/E, U, X, Tab (targeting when a tower is selected), Space, P, F, Esc.

**Home keyboard:** §3.5.

---

## 6. CSS architecture and phasing

### 6.1 Files and ownership

| File | Owner | Action |
|---|---|---|
| `index.html`, `dev/ui.html` | **P1** | add the two font `<link>` lines (§1.4); nothing else |
| `src/ui/tokens.css` (new) | **P1** | mockup `tokens` block + the legacy alias block (§6.3) |
| `src/ui/components.css` (new) | **P1** | mockup `components` block (checkbox included; consumer: §4.6) |
| `src/ui/home.css` (new) | P1 creates by **moving** today's "home screen" rules verbatim; then **P2 home** owns it | |
| `src/ui/hud.css` (new) | P1 creates by **moving** today's "HUD" rules verbatim (incl. the large/narrow media blocks for HUD selectors); then **P2 HUD** owns it | |
| `src/ui/styles.css` | **P1** | deleted after the split |
| `src/ui/index.ts` | **P1** | CSS imports (§6.2) |
| `src/ui/dom.ts` | **P1** | add `badge(text: string, tone?: 'blue' \| 'white' \| 'gold' \| 'violet', size?: number): HTMLSpanElement` (both screens use it). P2 doesn't edit `dom.ts`: if a helper is needed, write it locally and P3 consolidates. |
| `src/ui/home.ts` | **P2 home** (P1 left it untouched) | |
| `src/ui/hud.ts`, `src/ui/icons.ts` | **P2 HUD** (P1 left them untouched) | |
| `src/main.ts` | **P2 home** (per PLAN: wave-count wiring) | the HUD engineer doesn't touch it; `Hud` changes stay additive (`flash` kind). The home engineer passes `'warn'` for boss `waveStart` and `'good'` for `waveClear` (2 lines). |
| `src/ui/thumbnail.ts` | P2 **maps** engineer (new biomes) | home only calls it; it doesn't edit it |
| `dev/ui.ts` | P2 HUD (only if needed) | e.g. `#devbar` `top` in `dev/ui.html` if the new top bar overlaps it. That's a dev-only cosmetic. |

P1 finishes and merges before P2 starts, so P1's one-line edits to `home.ts`/`hud.ts` never collide with the P2 engineers.

### 6.2 Import order

`src/ui/index.ts` (P1). CSS imports go first so the cascade order is tokens → components → home → hud:

```ts
import './tokens.css';
import './components.css';
import './home.css';
import './hud.css';

export { createHomeScreen } from './home';
export { createHud } from './hud';
export type { Hud } from './hud';
```

All four imports live in `index.ts` (as built in P1), so `home.ts`/`hud.ts` needed no edits. Nothing imports `home.ts` or `hud.ts` except through `index.ts` (`main.ts` and `dev/ui.ts` both import the barrel), and Vite bundles CSS in module-graph order, so the order is deterministic. A P2 engineer may move a screen's import into its `.ts` if they prefer; keep the order.

**Scoping:**

- component classes are global (`.btn`, `.tile`, …); nothing else on these pages uses them;
- screen rules are scoped under `.sm-home` / `.sm-hud`;
- drop the old doubled `.sm-home .x, .sm-hud .x` selectors.

### 6.3 P1 sequence

1. Add the font links; remove the `@import`.
2. Create `tokens.css` and `components.css` from the mockup.
3. Split `styles.css`:
   - the shared block (lines 26–158 today: `.panel`, `.screen`, `.scanlines`, `.btn`, `kbd`, `.panel-h`, `.sr-only`, `[hidden]`) is *replaced* by components;
   - the home section goes to `home.css`;
   - the HUD section and the HUD-selector parts of the media queries go to `hud.css`;
   - the reduced-motion block goes to `tokens.css`;
   - the old `sm-*` keyframes used only by one screen move with that screen.
4. Add a **legacy alias block** at the end of `tokens.css`, so the moved rules still resolve until P2 rewrites them:

   ```css
   /* LEGACY: delete when unused (P3 greps) */
   :root {
     --metal-900: var(--surface-locked); --metal-800: var(--surface); --metal-700: var(--surface-hi); --metal-600: #0f3871; --metal-400: var(--line);
     --bevel-hi: rgba(160,210,255,.14); --bevel-lo: rgba(0,0,0,.55);
     --readout: var(--text-body); --readout-dim: var(--text-dim); --teal: var(--cyan); --amber: var(--cost-hi);
     --text-hi: #fff; --font-mono: var(--font-body); --font-ui: var(--font-body); --font-title: var(--font-display);
   }
   ```

   Old `.screen` / `.scanlines` uses in `home.ts`/`hud.ts` will render unstyled-ish until P2. That's acceptable mid-stage. P1 may alias `.screen` to the `.well` look in `components.css` under the LEGACY comment.
5. Add `badge()` to `dom.ts` (plus `rankTone(n)`: 1 blue, 2 white, 3 gold, 4+ violet, shared by tower level and map tier).

**As built (P1 notes for P2):**

- The moved rules are verbatim except for three fixes forced by the new `.panel` (its fill is a `::before`): the console's old lit-seam `::before` was dropped and `.hud-console` now sets `--cut: 14px` instead of a `clip-path !important`; the map card's selected/focus styles paint on `.map-card-body::before`; `.home-maps` no longer scrolls, `.home-maplist` does.
- `components.css` ends with a **LEGACY** block: `.screen` gets the well look, and a `.btn` with neither `.btn-primary` nor `.btn-secondary` gets the secondary palette at the old sizing (`height: auto`, `font-stretch: normal`, wrapping). Every button in today's `home.ts`/`hud.ts` is such a bare `.btn`; delete the block once P2 has given each a variant.
- `.scanlines` has no rule any more; the class can simply be dropped from markup.
- The shared `.dim` rule moved into `hud.css` (home doesn't use it). `sm-blink` lives in `tokens.css`; `sm-pulse` moved to `home.css`; `sm-flicker`, `sm-static`, `sm-pow-ready` to `hud.css`.
6. Run typecheck, test and build. Browser-check that both screens render and are usable (a mixed look is OK) with no console errors.

### 6.4 Hooks that must survive

| Hook | Who relies on it | Rule |
|---|---|---|
| `#app`, `#canvas-container`, `#ui` | `index.html`, `main.ts` | unchanged; UI never inserts a canvas into `#canvas-container` (main.ts takes its first `canvas`) |
| `#stage`, `#devbar` | `dev/ui.html`, `dev/ui.ts` | unchanged |
| `.hud-top`, `.hud-console` | `main.ts` (`querySelector` once, right after `createHud`, then a `ResizeObserver` → `renderer.setInsets`) | both are created in `createHud` and **never replaced**; they are the outermost elements of the top and bottom HUD; everything they visually cover is inside them and in flow |
| `.sm-home`, `.sm-hud` | CSS roots | keep as the root class of each screen |
| `.sr-only` | home radios, HUD | keep |
| `createHomeScreen(root, onStart): { destroy() }`, `createHud(root, opts: HudOptions): Hud`, `type Hud` | `main.ts`, `dev/ui.ts` | signatures unchanged; additions optional only (`flash` kind); `onStart`'s `SimConfig` gains the wave field from the systems contract |
| pointer-events contract | `render/camera.ts` (edge scroll stops on canvas `pointerleave`) and canvas picking | `.sm-hud` and the full-width `.hud-top` row: `pointer-events: none`; only panels, buttons and the modal backdrop get `auto`. A transparent full-width element with `auto` kills map clicks and edge scroll |
| hotkeys | `hud.ts` `onKey` on `window` | unchanged; `btn()`'s blur-on-pointerup stays (Space must call the wave, not re-click) |

### 6.5 Contract dependencies (systems designer / waves engineer)

Settled names (custom-wave contract, GDD §15):

1. **`SimConfig.waveCount?: number`.** `undefined` means Campaign. The home passes it; `main.ts` and `dev/ui.ts` forward `cfg` unchanged. `GameState.waveCount` is the resolved run length.
2. **Constants in `src/data/waves.ts`:** `CUSTOM_WAVES_MIN = 10`, `CUSTOM_WAVES_MAX = 50`, `HEAVY_ONLY_FROM = 41` (1-based), plus `clampWaveCount(n)`. Home reads them; nothing hard-coded.
3. **The resolved wave list:** `buildWaves(MAPS[mapId], waveCount)` in `src/data/waves.ts`. **This is a must-have.** Today `hud.ts` reads `MAPS[s.mapId].waves[s.waveIndex + 1]` for the incoming list, which is wrong once the count differs from the authored list. The top-bar ticks also need the boss-wave indices. P2 does this wiring.

---

## 7. Gotchas

- **`clip-path` clips `outline`, `box-shadow` glows and `filter: drop-shadow` on the same element.** Use the chamfer only on containers (`.panel`). Controls use `border-radius: 2px` so their glows and focus rings show. A glowing child near a clipped console edge is cut at that edge; that's acceptable.
- **`font:` shorthand resets `font-stretch`.** Set it after (§1.4).
- **Saira's width axis needs the range in the font URL** (§1.4).
- **WAAPI ignores the CSS reduced-motion kill switch** (§5).
- **`aria-disabled`, not `disabled`, for locked tiles.** They must stay clickable to flash the reason, and focusable.
- **Never put `overflow: auto` on a `.panel`.** Its fill is an absolutely positioned `::before`, which scrolls away with the content and exposes the bright frame gradient. Scroll an inner element instead.
- **`[hidden]` needs the `display: none !important` rule** (kept in `tokens.css`), because components set `display`.
- **Canvas thumbnails:** `drawMapThumbnail` sets `canvas.width/height` to cols×px. CSS sizes it with `width: 100%; height: 100%; object-fit: contain`. Don't set `image-rendering: pixelated` (they're smooth rasters).
- **`color-mix()` (badge glow)** needs Chrome 111, Safari 16.2 or Firefox 113 or newer. That's fine for this project.
- **No `backdrop-filter` over the canvas** (§4.6).
- **The phone console height must not depend on the selection.** The `data-mode` swap keeps it constant, so `setInsets` doesn't shove the camera on every tap.

## 8. Open questions

1. ~~Wave-count bounds and the field name.~~ Resolved: `SimConfig.waveCount`, custom range 10–50, heavy from 41 (§6.5).
2. **Map tiers for the 3 new maps:** the badge tones cover tiers 1–4+. If a new map is tier 4, it is violet.
3. **Muting on phones** lives only in the pause menu. If the user wants it on the top bar at 375 px, the speed button has to go into the pause menu instead.
4. **GDD §9/§11 and `art-direction.md` §7** still describe the SC1 console fonts and look. P3 refreshes them; this spec supersedes them for UI.
