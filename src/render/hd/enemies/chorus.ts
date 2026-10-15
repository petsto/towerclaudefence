// Shared Chorus (organic faction) helpers: jointed chitin limbs, an armoured rib band, and a stance/swing stride
// tuned for the 4-frame baked walk cycle (contract: ../index.ts).
import { PI, sph, torus, type Kit, type V3 } from '../kit';

/** Fleshy sinew / membrane tones shared by the Chorus models (the rest come from C.ch*). */
export const SINEW = 0x8c2a52;
export const MEMBRANE = 0x6e2c6a;

/**
 * Jointed limb through pts (hip -> ... -> tip): tapered rods r[i] -> r[i+1] coloured col[i], fleshy sinew knuckles
 * at the inner joints. The last radius is usually ~0 for a claw tip.
 */
export function limb(k: Kit, pts: V3[], r: number[], col: number[]): void {
  for (let i = 0; i < pts.length - 1; i++) {
    k.rod(pts[i]!, pts[i + 1]!, r[i]!, 'chitin', col[i] ?? col[col.length - 1]!, r[i + 1]!, 10);
    if (i > 0) k.add(sph(r[i]! * 1.12, 10, 6), 'chitin', SINEW, { p: pts[i]! });
  }
}

/**
 * Leg stride at cycle time t (wraps): stance sweeps the foot back linearly (dx +0.5 -> -0.5, lift 0), swing brings it
 * forward lifted (lift peaks at 1). Shifted so the WALK samples land on stance and mid-swing poses for both duty 0.5
 * (tripod / trot, offsets 0 and 0.5) and 0.75 (ripple, offsets in quarters).
 */
export function stride(t: number, duty = 0.5): { dx: number; lift: number } {
  const u = (((t + (1 - duty) / 2) % 1) + 1) % 1;
  if (u < duty) return { dx: 0.5 - u / duty, lift: 0 };
  const s = (u - duty) / (1 - duty);
  return { dx: -0.5 + s * s * (3 - 2 * s), lift: Math.sin(PI * s) };
}

/** Armoured transverse rib arching over a body ellipsoid: centre c, cross-section half-width w, half-height h; wide > 1 flattens it into a band. */
export function rib(k: Kit, c: V3, w: number, h: number, thick: number, col: number, arc = 1.3, wide = 1): void {
  k.add(torus(w, thick, 32, PI * arc).rotateZ(-PI * (arc - 1) / 2), 'chitin', col, { p: c, r: [0, PI / 2, 0], s: [1, h / w, wide] });
}

/**
 * Glowing bio-sac / egg seated on a surface at p with outward unit normal n: a glossy lit shell (so it keeps a
 * specular highlight instead of reading as a flat dot), a hot glowing heart breaching the shell on the outer side,
 * and a fleshy sinew socket rim.
 */
export function bioSac(k: Kit, p: V3, n: V3, r: number, shell = 0xc04a9a, heart = 0xff20a8): void {
  const at = (d: number): V3 => [p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d];
  k.add(sph(r, 16, 10), 'chitin', shell, { p });
  k.glow(sph(r * 0.62, 12, 8), heart, { p: at(r * 0.48) }, 6);
  k.add(sph(r * 1.22, 12, 6), 'chitin', SINEW, { p: at(-r * 0.62) });
}
