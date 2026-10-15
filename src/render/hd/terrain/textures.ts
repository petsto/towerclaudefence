// Procedural terrain texture sets per biome (canvas, tileable, 512² = 2 world units): ground, path, rock (cliff faces,
// sampled with v = world height). Coloured from the map palette so the map keeps its identity. ORM red = height (for
// height blending in the terrain shader), ORM blue = glow mask (lava cracks, creep pustules, crystal veins).
import type { Biome, MapPalette } from '../../../data/types';
import { fbm, hash, S, sstep, surf, toTextures, wrap, type Surf, type TexSet } from '../textures';

export interface TerrainSets { ground: TexSet; path: TexSet; rock: TexSet }

type RGB = [number, number, number];
const rgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

/** Tileable Worley: c cells per texture. d1/d2 in cell units, id = per-cell hash 0..1. */
function worley(u: number, v: number, c: number, seed: number): { d1: number; d2: number; id: number } {
  const ci = Math.floor(u * c), cj = Math.floor(v * c);
  let d1 = 9, d2 = 9, id = 0;
  for (let oj = -1; oj <= 1; oj++) for (let oi = -1; oi <= 1; oi++) {
    const i = ci + oi, j = cj + oj;
    const wi = wrap(i, c), wj = wrap(j, c);
    const px = i + 0.1 + hash(wi, wj, seed) * 0.8, py = j + 0.1 + hash(wi, wj, seed + 1) * 0.8;
    const d = Math.hypot(u * c - px, v * c - py);
    if (d < d1) [d2, d1, id] = [d1, d, hash(wi, wj, seed + 2)];
    else if (d < d2) d2 = d;
  }
  return { d1, d2, id };
}

/** Fill a surface per texel; f returns [height, colour, roughness, glow]. */
function paint(f: (u: number, v: number) => [number, RGB, number, number]): { s: Surf; glow: Float32Array } {
  const s = surf();
  const glow = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const [h, c, r, g] = f(x / S, y / S);
    s.h[i] = h; s.r[i] = Math.min(1, c[0]); s.g[i] = Math.min(1, c[1]); s.b[i] = Math.min(1, c[2]);
    s.rough[i] = r; s.metal[i] = 0; glow[i] = g;
  }
  return { s, glow };
}

/** Pebble field: height dome + per-stone tone, 0 outside stones. */
function pebbles(u: number, v: number, c: number, seed: number, size: number): { h: number; tone: number } {
  const w = worley(u, v, c, seed);
  const r = size * (0.5 + w.id * 0.5);
  if (w.d1 >= r) return { h: 0, tone: 0 };
  return { h: Math.sqrt(1 - (w.d1 / r) ** 2), tone: w.id };
}

function ground(biome: Biome, p: MapPalette, seed: number): TexSet {
  const base = rgb(p.ground);
  const dark = rgb(p.decor);
  const { s, glow } = paint((u, v) => {
    const grain = fbm(u, v, 48, seed, 2), mid = fbm(u, v, 8, seed + 1);
    if (biome === 'badlands') {
      // dry hardpan: broad tonal patches, a mud-crack network, sparse half-buried stones (low contrast: units stay the focus)
      const st = pebbles(u, v, 22, seed + 2, 0.26);
      const fine = pebbles(u, v, 90, seed + 8, 0.2);
      const wu = (fbm(u, v, 6, seed + 10) - 0.5) * 0.04, wv = (fbm(u, v, 6, seed + 11) - 0.5) * 0.04; // warp: irregular cracks
      const cr = worley(wrap(u + wu, 1), wrap(v + wv, 1), 6, seed + 3);
      const crack = (1 - sstep(0.0, 0.03, cr.d2 - cr.d1)) * sstep(0.5, 0.65, fbm(u, v, 4, seed + 4));
      const patch = fbm(u, v, 3, seed + 9);
      let c = mul(base, 1.0 + (mid - 0.5) * 0.3 + (patch - 0.5) * 0.25 + (grain - 0.5) * 0.08);
      c = mul(c, 1 - fine.h * (fine.tone - 0.5) * 0.25);
      if (st.h > 0) c = mix(c, mul(mix(base, [0.5, 0.44, 0.38], 0.5), 0.75 + st.tone * 0.35), sstep(0, 0.35, st.h));
      c = mix(c, mul(dark, 0.9), crack * 0.4);
      return [mid * 0.3 + patch * 0.2 + grain * 0.1 + fine.h * 0.15 + st.h * 0.75 - crack * 0.6, c, 0.9 - st.h * 0.15, 0];
    }
    if (biome === 'volcanic') {
      const wu = (fbm(u, v, 5, seed + 10) - 0.5) * 0.05, wv = (fbm(u, v, 5, seed + 11) - 0.5) * 0.05;
      const pl = worley(wrap(u + wu, 1), wrap(v + wv, 1), 5, seed + 3);
      const edge = pl.d2 - pl.d1;
      const crack = 1 - sstep(0.0, 0.05, edge);
      const core = 1 - sstep(0.0, 0.018, edge);
      const ash = pebbles(u, v, 60, seed + 5, 0.26);
      let c = mul(base, 0.85 + (mid - 0.5) * 0.4 + (grain - 0.5) * 0.18 + pl.id * 0.12);
      if (ash.h > 0) c = mix(c, ash.tone > 0.85 ? mul(base, 1.35) : mul(base, 0.6), sstep(0, 0.3, ash.h) * 0.8);
      c = mix(c, [0.05, 0.03, 0.03], crack * 0.6);
      return [mid * 0.3 + grain * 0.2 + ash.h * 0.4 - crack * 0.9 + (1 - crack) * pl.d1 * 0.15, c, 0.92 - crack * 0.1, core * sstep(0.35, 0.55, fbm(u, v, 3, seed + 6))];
    }
    // crystal: creep — low organic swells crossed by a ridged vein network, wet in the veins, rare glowing pustules.
    // Stays near the dark palette ground: the shader's macro tint adds groundAlt, the path must stay the brighter lane.
    const alt = rgb(p.groundAlt);
    const swell = fbm(u, v, 4, seed + 3);
    const vein = (1 - sstep(0.0, 0.035, Math.abs(fbm(u, v, 5, seed + 4) - 0.5))) * 0.8 + (1 - sstep(0.0, 0.025, Math.abs(fbm(u, v, 11, seed + 7) - 0.5))) * 0.5;
    const pus = pebbles(u, v, 24, seed + 5, 0.14);
    const pusOn = pus.tone > 0.9 ? pus.h : 0;
    let c = mix(mul(base, 0.9 + (grain - 0.5) * 0.25 + (swell - 0.5) * 0.4), alt, 0.12 + Math.min(1, vein) * 0.2);
    c = mul(c, 1 - Math.min(1, vein) * 0.35);
    return [swell * 0.8 + grain * 0.15 - Math.min(1, vein) * 0.35 + pusOn * 0.3, c, 0.6 - Math.min(1, vein) * 0.35 + grain * 0.1, pusOn];
  });
  return toTextures(s, biome === 'volcanic' ? 2.2 : 1.8, { glow, heightInR: true });
}

function path(biome: Biome, p: MapPalette, seed: number): TexSet {
  const base = rgb(p.path);
  const { s, glow } = paint((u, v) => {
    const grain = fbm(u, v, 56, seed, 2), mid = fbm(u, v, 6, seed + 1);
    if (biome === 'badlands') {
      // packed road dirt + dense gravel, dark worn patches
      const gr = pebbles(u, v, 64, seed + 2, 0.36);
      const big = pebbles(u, v, 14, seed + 7, 0.22);
      let c = mul(base, 0.97 + (mid - 0.5) * 0.25 + (grain - 0.5) * 0.1);
      if (gr.h > 0) c = mix(c, mul(base, 0.72 + gr.tone * 0.35), sstep(0, 0.4, gr.h) * 0.7);
      if (big.h > 0) c = mix(c, mul([0.55, 0.47, 0.38], 0.8 + big.tone * 0.4), sstep(0, 0.3, big.h));
      return [mid * 0.2 + grain * 0.1 + gr.h * 0.35 + big.h * 0.8, c, 0.8 - gr.h * 0.1, 0];
    }
    if (biome === 'volcanic') {
      // basalt flagstones bedded in ash
      const fl = worley(u, v, 5, seed + 3);
      const seam = 1 - sstep(0.02, 0.07, fl.d2 - fl.d1);
      const chip = sstep(0.62, 0.7, fbm(u, v, 20, seed + 4));
      let c = mul(base, 0.72 + fl.id * 0.3 + (grain - 0.5) * 0.2 + (mid - 0.5) * 0.15);
      c = mix(c, mul(base, 0.35), seam * 0.9);
      c = mix(c, mul(base, 1.15), chip * 0.4);
      return [(1 - seam) * (0.7 + grain * 0.2) - chip * 0.15, c, 0.75 + seam * 0.2 - fl.id * 0.1, 0];
    }
    // crystal: cracked station plates stained with creep
    const gx = (u * 4) % 1, gy = (v * 4) % 1;
    const d = Math.min(gx, 1 - gx, gy, 1 - gy) * 128; // px to plate edge (128 px plates)
    const seam = 1 - sstep(1.5, 4, d);
    const cr = worley(u, v, 9, seed + 3);
    const crack = (1 - sstep(0.0, 0.035, cr.d2 - cr.d1)) * sstep(0.5, 0.62, fbm(u, v, 5, seed + 4));
    const stain = sstep(0.45, 0.75, fbm(u, v, 5, seed + 5) + seam * 0.4);
    const pid = hash(Math.floor(u * 4), Math.floor(v * 4), seed + 6);
    let c = mul(base, 0.9 + pid * 0.2 + (grain - 0.5) * 0.12);
    c = mix(c, mul(base, 0.6), stain * 0.4);
    c = mix(c, mul(base, 0.35), Math.max(seam, crack) * 0.75);
    return [(1 - seam) * 0.8 - crack * 0.5 + grain * 0.08 - stain * 0.1, c, 0.6 + stain * -0.25 + seam * 0.2, 0];
  });
  return toTextures(s, 1.8, { glow, heightInR: true });
}

function rock(biome: Biome, p: MapPalette, seed: number): TexSet {
  const cliff = rgb(p.cliff);
  const { s, glow } = paint((u, v) => {
    const grain = fbm(u, v, 40, seed, 3), mid = fbm(u, v, 5, seed + 1);
    if (biome === 'badlands') {
      // sandstone strata: 24 bands per 2 units, warped; ledges + vertical erosion streaks
      const t = v * 24 + (fbm(u, v, 3, seed + 2) - 0.5) * 3;
      const band = Math.floor(t), f = t - band;
      const tone = hash(wrap(band, 24), 0, seed + 3);
      const streak = fbm(u * 1, v, 24, seed + 4, 2) * fbm(u, v, 3, seed + 5);
      let c = mix(mul(cliff, 0.75), mix(cliff, rgb(p.groundAlt), 0.35), tone);
      c = mul(c, 0.85 + (grain - 0.5) * 0.3 - (1 - f) ** 6 * 0.35 - streak * 0.25);
      return [(1 - f * f) * (0.4 + tone * 0.5) + grain * 0.35 - streak * 0.3, c, 0.9, 0];
    }
    if (biome === 'volcanic') {
      // basalt columns: 10 per 2 units, convex faces, dark seams, horizontal fractures
      const t = u * 10 + (fbm(u, v, 2, seed + 2) - 0.5) * 1.2;
      const col = Math.floor(t), f = t - col;
      const seam = 1 - sstep(0.0, 0.12, Math.min(f, 1 - f));
      const frac = sstep(0.46, 0.5, Math.abs(((v * 6 + hash(wrap(col, 10), 1, seed) * 5) % 1) - 0.5));
      const tone = hash(wrap(col, 10), 2, seed);
      let c = mul(cliff, 0.8 + tone * 0.5 + (grain - 0.5) * 0.35);
      c = mix(c, [0.02, 0.015, 0.015], Math.max(seam, frac) * 0.9);
      const lava = (1 - sstep(0.0, 0.05, Math.min(f, 1 - f))) * sstep(0.55, 0.7, mid);
      return [Math.sin(Math.PI * f) * 0.7 + grain * 0.3 - frac * 0.5, c, 0.7 + grain * 0.2, lava];
    }
    // crystal: angular faceted rock with teal crystal veins
    const w = worley(u, v, 7, seed + 2);
    const facet = (hash(Math.floor(w.id * 1e4), 3, seed) - 0.5) * w.d1;
    const edge = 1 - sstep(0.0, 0.06, w.d2 - w.d1);
    const vein = (1 - sstep(0.0, 0.04, Math.abs(fbm(u, v, 3, seed + 5) - 0.5))) * sstep(0.4, 0.6, mid);
    let c = mul(cliff, 0.8 + w.id * 0.45 + (grain - 0.5) * 0.25);
    c = mix(c, mul(cliff, 0.35), edge * 0.8);
    c = mix(c, rgb(p.decor), vein * 0.7);
    return [facet * 1.4 - edge * 0.4 + grain * 0.2, c, 0.55 - vein * 0.35, vein];
  });
  return toTextures(s, 2.4, { glow, heightInR: true });
}

export function terrainSets(biome: Biome, p: MapPalette, seed: number): TerrainSets {
  return { ground: ground(biome, p, seed), path: path(biome, p, seed + 100), rock: rock(biome, p, seed + 200) };
}
