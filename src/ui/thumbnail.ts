// Home-screen map preview: a small top-down 2D raster that mimics the HD terrain bake (docs/terrain-hd.md): palette
// ground with groundAlt macro blotches, recessed path with a grime curb, metal pads with accent brackets, raised noisy
// rock on decor tiles, all lit by the game's sun (Lambert + short cast shadows), then spawn and core markers on top.
// ponytail: CPU raster, not the real WebGL bake: makeMaterials + createMapTerrain cost ~1.6 s for 3 maps (measured), far
// over the home screen's budget, and ui must not import render. Revisit if the bake gets cheap or is cached on disk.
import type { Biome, MapDef, MapPalette, Tile } from '../data/types';

export const SPAWN_COLOR = '#ff3a3a';
export const CORE_COLOR = '#38e0d0';

// mirrors src/render/hd/terrain/build.ts and the bake light in src/render/index.ts
const PATH_Y = -0.08;
const PAD_Y = 0.06;
const SUN = [-6, 14, -5].map((v) => v / Math.hypot(6, 14, 5)) as [number, number, number];
const SUN_RISE = SUN[1] / Math.hypot(SUN[0], SUN[2]); // shadow-ray climb per unit of ground distance
/** Small props scattered on raised rock, per biome (crystal spires, ember shards). */
const SPECK: Readonly<Record<Biome, keyof MapPalette | null>> = { badlands: null, volcanic: 'accent', crystal: 'decor' };

const isPath = (t: Tile | undefined): boolean => t === 'path' || t === 'spawn' || t === 'core';
const isDecor = (t: Tile | undefined): boolean => t === 'decor';
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (v: number, a: number, b: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Draws the map's preview at `px` canvas pixels per tile (CSS scales it; draw at ~1 device px per canvas px). */
export function drawMapThumbnail(canvas: HTMLCanvasElement, map: MapDef, px = 8): void {
  const { cols, rows, palette: p } = map;
  const W = cols * px, H = rows * px;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const seed = [...map.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);
  const tileAt = (c: number, r: number): Tile | undefined => map.tiles[r]?.[c];

  /** Signed distance (tiles) to the edge of the region `pred` holds on, > 0 inside; the map border is no edge. */
  function regionDist(x: number, z: number, pred: (t: Tile | undefined) => boolean): number {
    const c = Math.floor(x), r = Math.floor(z);
    const fx = x - c, fz = z - r;
    const inside = pred(tileAt(c, r));
    let best = 1.5;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nc = c + dx, nr = r + dz;
      if ((dx === 0 && dz === 0) || nc < 0 || nr < 0 || nc >= cols || nr >= rows || pred(tileAt(nc, nr)) === inside) continue;
      best = Math.min(best, Math.hypot(dx < 0 ? fx : dx > 0 ? 1 - fx : 0, dz < 0 ? fz : dz > 0 ? 1 - fz : 0));
    }
    return inside ? best : -best;
  }

  // --- 1. height + albedo per pixel ---------------------------------------------------------------------------
  const C = { ground: rgb(p.ground), alt: rgb(p.groundAlt), path: rgb(p.path), pad: rgb(p.buildPad), rock: rgb(p.cliff) };
  const speckKey = SPECK[map.biome];
  const speck = speckKey ? rgb(p[speckKey]) : null;
  const hgt = new Float32Array(W * H);
  const alb = new Float32Array(W * H * 3);
  const col: [number, number, number] = [0, 0, 0];
  const mix = (to: readonly number[], f: number): void => {
    for (let i = 0; i < 3; i++) col[i] = col[i]! + (to[i]! - col[i]!) * f;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wx = (x + 0.5) / px, wz = (y + 0.5) / px;
    const c = Math.floor(wx), r = Math.floor(wz);
    const grain = hash(x, y, seed) - 0.5;
    let h = (noise(wx * 1.1, wz * 1.1, seed) - 0.5) * 0.035;
    let k = 1 + grain * 0.1;
    col[0] = C.ground[0]; col[1] = C.ground[1]; col[2] = C.ground[2];
    mix(C.alt, sstep(noise(wx * 0.3, wz * 0.3, seed) * 0.7 + noise(wx * 0.9, wz * 0.9, seed + 1) * 0.3, 0.45, 0.72) * 0.85);

    const dp = regionDist(wx, wz, isPath) + (noise(wx * 7, wz * 7, seed + 6) - 0.5) * 0.06;
    if (dp > -0.06) {
      const f = sstep(dp, -0.04, 0.08);
      h += (PATH_Y - h) * f;
      mix(C.path, f);
      k = 1 + grain * 0.05 - 0.2 * f * (1 - sstep(dp, 0.04, 0.2)); // grime line inside the curb
    }
    if (tileAt(c, r) === 'build' && Math.abs(wx - c - 0.5) < 0.42 && Math.abs(wz - r - 0.5) < 0.42) {
      h = PAD_Y;
      col[0] = C.pad[0]; col[1] = C.pad[1]; col[2] = C.pad[2];
      k = 1 + grain * 0.04 + ((Math.floor(wx * 4) + Math.floor(wz * 4)) & 1 ? 0.03 : -0.03); // deck plating
    }
    const dd = regionDist(wx, wz, isDecor) - 0.07 + (noise(wx * 4.5, wz * 4.5, seed + 3) - 0.5) * 0.18;
    if (dd > -0.1) {
      const f = sstep(dd, 0, 0.12);
      const lumps = (noise(wx * 3, wz * 3, seed + 5) - 0.5) * 0.4 + (noise(wx * 7, wz * 7, seed + 7) - 0.5) * 0.12; // boulders
      h += (0.45 + noise(wx * 0.8, wz * 0.8, seed + 4) * 0.15 + lumps - h) * f;
      mix(C.rock, f);
      k *= 1 + lumps * 0.8 * f;
      if (speck && f > 0.6) {
        const sx = Math.floor(wx * 3), sz = Math.floor(wz * 3); // one candidate prop per third of a tile
        if (hash(sx, sz, seed + 8) < 0.25 && Math.hypot(wx * 3 - sx - 0.5, wz * 3 - sz - 0.5) < 0.2) {
          col[0] = speck[0]; col[1] = speck[1]; col[2] = speck[2];
          k = 0.9;
          h += 0.08;
        }
      }
    }
    hgt[y * W + x] = h;
    for (let i = 0; i < 3; i++) alb[(y * W + x) * 3 + i] = col[i]! * k;
  }

  // --- 2. sun: Lambert from the height raster, short soft cast shadows, faint vignette ---------------------------
  const img = ctx.createImageData(W, H);
  const at = (x: number, y: number): number => hgt[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))]!;
  const steps = Math.ceil(px * 0.45); // tallest rock (~0.6) throws a ~0.3 tile shadow
  const dx = SUN[0] / Math.hypot(SUN[0], SUN[2]), dz = SUN[2] / Math.hypot(SUN[0], SUN[2]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const h0 = at(x, y);
    const gx = (at(x + 1, y) - at(x - 1, y)) * px * 0.5, gz = (at(x, y + 1) - at(x, y - 1)) * px * 0.5;
    const lam = Math.max(0, -gx * SUN[0] + SUN[1] - gz * SUN[2]) / Math.hypot(gx, 1, gz);
    let occ = 0;
    for (let s = 1; s <= steps; s++) occ = Math.max(occ, clamp01((at(Math.round(x + dx * s), Math.round(y + dz * s)) - h0 - (s / px) * SUN_RISE) * 12));
    const u = x / W - 0.5, v = y / H - 0.5;
    const light = (0.32 + 0.68 * (lam / SUN[1]) * (1 - occ * 0.55)) * (1 - (u * u + v * v) * 0.45);
    const i = y * W + x;
    for (let ch = 0; ch < 3; ch++) img.data[i * 4 + ch] = alb[i * 3 + ch]! * light;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // --- 3. pad frames, spawns, core ----------------------------------------------------------------------------
  const lw = Math.max(1, Math.round(px / 12));
  const inset = Math.max(1, Math.round(px * 0.1)) + lw / 2;
  const arm = Math.max(2, px * 0.24);
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = lw;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (tileAt(c, r) !== 'build') continue;
    const x0 = c * px + inset, y0 = r * px + inset, x1 = (c + 1) * px - inset, y1 = (r + 1) * px - inset;
    ctx.globalAlpha = 0.35;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]] as const) {
      ctx.moveTo(cx + sx * arm, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * arm);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const t = tileAt(c, r);
    const cx = (c + 0.5) * px, cy = (r + 0.5) * px;
    if (t === 'spawn') {
      const R = Math.max(5, px * 0.46);
      ctx.shadowColor = SPAWN_COLOR;
      ctx.shadowBlur = R;
      ctx.fillStyle = '#1c0505';
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = SPAWN_COLOR;
      ctx.lineWidth = Math.max(1.5, px * 0.14);
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (t === 'core') {
      const R = Math.max(4.5, px * 0.42);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.6);
      glow.addColorStop(0, `${CORE_COLOR}aa`);
      glow.addColorStop(1, `${CORE_COLOR}00`);
      ctx.fillStyle = glow;
      ctx.fillRect(cx - R * 2.6, cy - R * 2.6, R * 5.2, R * 5.2);
      ctx.fillStyle = CORE_COLOR;
      ctx.strokeStyle = '#06201d';
      ctx.lineWidth = Math.max(1, px * 0.08);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) ctx.lineTo(cx + Math.cos((i * Math.PI) / 3) * R, cy + Math.sin((i * Math.PI) / 3) * R);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}
