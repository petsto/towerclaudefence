// Procedural PBR texture sets drawn on <canvas>: albedo, ORM (G = roughness, B = metalness) and a Sobel normal map
// derived from a height field. All tileable (Repeat wrap), 512². No image assets.
import * as THREE from 'three';

const S = 512;

function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const wrap = (a: number, p: number): number => ((a % p) + p) % p;
function vnoise(x: number, y: number, p: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(wrap(xi, p), wrap(yi, p), s), b = hash(wrap(xi + 1, p), wrap(yi, p), s);
  const c = hash(wrap(xi, p), wrap(yi + 1, p), s), d = hash(wrap(xi + 1, p), wrap(yi + 1, p), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Tileable fbm; u, v in [0,1), p = base cells per tile. */
function fbm(u: number, v: number, p: number, s: number, oct = 4): number {
  let t = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    t += vnoise(u * p * f, v * p * f, p * f, s + i * 7) * amp;
    n += amp;
    amp *= 0.5;
    f *= 2;
  }
  return t / n;
}
const sstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Surf { h: Float32Array; r: Float32Array; g: Float32Array; b: Float32Array; rough: Float32Array; metal: Float32Array }
const surf = (): Surf => ({
  h: new Float32Array(S * S), r: new Float32Array(S * S), g: new Float32Array(S * S), b: new Float32Array(S * S),
  rough: new Float32Array(S * S), metal: new Float32Array(S * S),
});
const idx = (x: number, y: number): number => wrap(y, S) * S + wrap(x, S);

export interface TexSet { map: THREE.Texture; orm: THREE.Texture; normal: THREE.Texture }

function toTextures(s: Surf, normalStrength: number): TexSet {
  const mk = (fill: (d: Uint8ClampedArray, i: number) => void, srgb: boolean): THREE.Texture => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) fill(img.data, i);
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  };
  const map = mk((d, i) => {
    d[i * 4] = s.r[i]! * 255;
    d[i * 4 + 1] = s.g[i]! * 255;
    d[i * 4 + 2] = s.b[i]! * 255;
    d[i * 4 + 3] = 255;
  }, true);
  const orm = mk((d, i) => {
    d[i * 4] = 255;
    d[i * 4 + 1] = s.rough[i]! * 255;
    d[i * 4 + 2] = s.metal[i]! * 255;
    d[i * 4 + 3] = 255;
  }, false);
  // Sobel on the wrapped height field. Canvas y runs down, texture v up (flipY), so ny takes +dh/dy.
  const normal = mk((d, i) => {
    const x = i % S, y = (i / S) | 0;
    const H = (dx: number, dy: number): number => s.h[idx(x + dx, y + dy)]!;
    const gx = H(1, -1) + 2 * H(1, 0) + H(1, 1) - H(-1, -1) - 2 * H(-1, 0) - H(-1, 1);
    const gy = H(-1, 1) + 2 * H(0, 1) + H(1, 1) - H(-1, -1) - 2 * H(0, -1) - H(1, -1);
    const nx = -gx * normalStrength, ny = gy * normalStrength;
    const l = Math.hypot(nx, ny, 1);
    d[i * 4] = (nx / l * 0.5 + 0.5) * 255;
    d[i * 4 + 1] = (ny / l * 0.5 + 0.5) * 255;
    d[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255;
    d[i * 4 + 3] = 255;
  }, false);
  return { map, orm, normal };
}

// --- hard-surface: panels, seams, rivets, vents, scratches, grime, rust / paint chips / hazard stripes --------------
interface Rect { x: number; y: number; w: number; h: number }
function panels(seed: number): Rect[] {
  const out: Rect[] = [];
  let n = 0;
  const split = (r: Rect, depth: number): void => {
    const k = hash(n++, depth, seed);
    if ((r.w <= 128 && r.h <= 128) || (depth > 1 && k < 0.3)) return void out.push(r);
    const vertical = r.w > r.h ? k < 0.8 : k < 0.2;
    const f = 0.3 + hash(n++, 3, seed) * 0.4;
    if (vertical) {
      const w = Math.round((r.w * f) / 16) * 16 || 16;
      split({ ...r, w }, depth + 1);
      split({ ...r, x: r.x + w, w: r.w - w }, depth + 1);
    } else {
      const h = Math.round((r.h * f) / 16) * 16 || 16;
      split({ ...r, h }, depth + 1);
      split({ ...r, y: r.y + h, h: r.h - h }, depth + 1);
    }
  };
  split({ x: 0, y: 0, w: S, h: S }, 0);
  return out;
}

type Hard = 'metal' | 'paint' | 'hazard';
export function hardSurface(kind: Hard, seed = 1): TexSet {
  const s = surf();
  const rects = panels(seed);
  rects.forEach((p, pi) => {
    const tone = (hash(pi, 1, seed) - 0.5) * 0.12;
    const raised = hash(pi, 2, seed) < 0.35 ? 0.35 : hash(pi, 2, seed) < 0.5 ? -0.25 : 0;
    const vent = kind !== 'hazard' && p.w >= 64 && p.h >= 48 && hash(pi, 3, seed) < 0.18;
    const rivets = hash(pi, 4, seed) < 0.6;
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x; x < p.x + p.w; x++) {
        const i = idx(x, y);
        const u = x / S, v = y / S;
        const d = Math.min(x - p.x, p.x + p.w - 1 - x, y - p.y, p.y + p.h - 1 - y); // px to panel edge
        let h = raised * sstep(1, 5, d);
        if (d < 2) h -= 0.9 - d * 0.3; // seam groove
        // base albedo
        let r: number, g: number, b: number, rough: number, metal: number;
        if (kind === 'metal') {
          const n = fbm(u, v, 24, seed + 11, 3);
          r = g = b = 0.6 + tone + (n - 0.5) * 0.12;
          b += 0.02;
          rough = 0.32 + fbm(u, v, 6, seed + 3) * 0.25;
          metal = 1;
        } else if (kind === 'paint') {
          const n = fbm(u, v, 16, seed + 11, 3);
          r = g = b = 0.86 + tone * 0.5 + (n - 0.5) * 0.06;
          rough = 0.5 + fbm(u, v, 8, seed + 3) * 0.15;
          metal = 0;
        } else {
          const stripe = wrap(x + y, 96) < 48;
          [r, g, b] = stripe ? [0.92, 0.68, 0.08] : [0.07, 0.07, 0.075];
          rough = 0.55;
          metal = 0;
        }
        // vents: horizontal slots with a frame
        if (vent && d > 10) {
          const slot = wrap(y - p.y, 8) < 4;
          if (slot) {
            h -= 0.7;
            r *= 0.25; g *= 0.25; b *= 0.25;
            rough = 0.8;
          } else h += 0.15;
        }
        // grime gathers along seams; broad dirt; rust/chips
        const dirt = fbm(u, v, 5, seed + 21);
        const edge = Math.exp(-d / 9);
        const grime = Math.min(1, edge * (0.5 + dirt) * 0.9 + sstep(0.55, 0.85, dirt) * 0.35);
        if (kind === 'metal') {
          const rust = sstep(0.62, 0.8, fbm(u, v, 20, seed + 31) + edge * 0.25);
          r = r * (1 - rust) + 0.42 * rust; g = g * (1 - rust) + 0.22 * rust; b = b * (1 - rust) + 0.1 * rust;
          rough = rough * (1 - rust) + 0.9 * rust;
          metal = 1 - rust * 0.7;
          h -= rust * 0.12;
        } else {
          const chip = sstep(0.7, 0.74, fbm(u, v, 40, seed + 41, 4) + edge * 0.3);
          r = r * (1 - chip) + 0.62 * chip; g = g * (1 - chip) + 0.62 * chip; b = b * (1 - chip) + 0.64 * chip;
          rough = rough * (1 - chip) + 0.35 * chip;
          metal = chip * 0.6;
          h -= chip * 0.25;
        }
        const gk = 1 - grime * 0.55;
        r *= gk; g *= gk * 0.97; b *= gk * 0.92; // brownish grime
        rough = Math.min(1, rough + grime * 0.3);
        if (d < 2) { r *= 0.35; g *= 0.35; b *= 0.35; } // seam cavity
        s.h[i] = h; s.r[i] = r; s.g[i] = g; s.b[i] = b; s.rough[i] = rough; s.metal[i] = metal;
      }
    }
    // rivet rows along the panel edges
    if (rivets) {
      const dots: [number, number][] = [];
      for (let x = p.x + 7; x < p.x + p.w - 4; x += 20) dots.push([x, p.y + 6], [x, p.y + p.h - 7]);
      for (let y = p.y + 20; y < p.y + p.h - 14; y += 20) dots.push([p.x + 6, y], [p.x + p.w - 7, y]);
      for (const [cx, cy] of dots) {
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          const rr = Math.hypot(dx, dy);
          const i = idx(cx + dx, cy + dy);
          if (rr < 2.6) {
            s.h[i] = s.h[i]! + Math.sqrt(1 - (rr / 2.6) ** 2) * 1.1;
            const k = 1.15 - rr * 0.08;
            s.r[i] = Math.min(1, s.r[i]! * k); s.g[i] = Math.min(1, s.g[i]! * k); s.b[i] = Math.min(1, s.b[i]! * k);
            s.rough[i] = 0.3;
          } else if (rr < 3.6) {
            s.r[i] = s.r[i]! * 0.6; s.g[i] = s.g[i]! * 0.6; s.b[i] = s.b[i]! * 0.6;
          }
        }
      }
    }
  });
  // scratches: thin bright bare-metal lines
  for (let k = 0; k < 60; k++) {
    let x = hash(k, 1, seed + 5) * S, y = hash(k, 2, seed + 5) * S;
    const a = hash(k, 3, seed + 5) * Math.PI * 2, len = 8 + hash(k, 4, seed + 5) * 50;
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let t = 0; t < len; t++, x += dx, y += dy) {
      const i = idx(Math.round(x), Math.round(y));
      s.r[i] = Math.min(1, s.r[i]! + 0.22); s.g[i] = Math.min(1, s.g[i]! + 0.22); s.b[i] = Math.min(1, s.b[i]! + 0.24);
      s.rough[i] = 0.22;
      s.metal[i] = 1;
      s.h[i] = s.h[i]! - 0.12;
    }
  }
  return toTextures(s, 1.6);
}

// --- organic chitin: Worley scales, pores, mottling, dark veins, wet roughness variation --------------------------
export function chitin(seed = 7): TexSet {
  const s = surf();
  const C = 22; // cells per tile
  const pts: [number, number][] = [];
  for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) pts.push([(i + 0.15 + hash(i, j, seed) * 0.7) / C, (j + 0.15 + hash(i, j, seed + 1) * 0.7) / C]);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const ci = Math.floor(u * C), cj = Math.floor(v * C);
      let d1 = 9, d2 = 9;
      for (let oj = -1; oj <= 1; oj++) for (let oi = -1; oi <= 1; oi++) {
        const ii = wrap(ci + oi, C), jj = wrap(cj + oj, C);
        const p = pts[jj * C + ii]!;
        const px = p[0] + (ci + oi - ii) / C, py = p[1] + (cj + oj - jj) / C; // unwrapped neighbour position
        const dd = Math.hypot(u - px, v - py) * C;
        if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
      }
      const ridge = sstep(0.0, 0.18, d2 - d1); // 0 at cell borders
      const scale = Math.sqrt(Math.max(0, 1 - d1 * 0.9)) * ridge;
      const mott = fbm(u, v, 6, seed + 3);
      const fine = fbm(u, v, 48, seed + 5, 2);
      const vein = 1 - sstep(0.0, 0.05, Math.abs(fbm(u, v, 4, seed + 9) - 0.5));
      const pore = fine > 0.72 ? 1 : 0;
      const i = y * S + x;
      s.h[i] = scale * 1.1 + fine * 0.25 - pore * 0.5 - vein * 0.3;
      const k = (0.5 + mott * 0.4) * (0.78 + scale * 0.3) * (1 - vein * 0.35) * (1 - (1 - ridge) * 0.25);
      s.r[i] = Math.min(1, k * 1.02); s.g[i] = Math.min(1, k * 0.96); s.b[i] = Math.min(1, k);
      s.rough[i] = 0.18 + (1 - scale) * 0.35 + sstep(0.5, 0.8, fbm(u, v, 3, seed + 13)) * 0.3;
      s.metal[i] = 0;
    }
  }
  return toTextures(s, 2.2);
}
