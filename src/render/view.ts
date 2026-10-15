// View grid. Everything renders at native resolution, but the camera still works on a virtual low-res texel grid
// (~384 px tall, an integer fraction of the drawing buffer): its texels per world unit are the zoom steps, and the pan
// snaps to it, so baked terrain and sprite texels land on whole screen pixels and nothing shimmers while panning.

/** Camera layer of objects drawn after the unit sprites (airborne FX, HP bars). */
export const OVERLAY_LAYER = 1;

const GRID_H = 384; // grid height lands in ~320-480

export interface ViewGrid {
  /** Grid size in texels (the camera frustum is sized for it). */
  w: number;
  h: number;
  /** Screen px per grid texel. */
  scale: number;
  /** Fraction of the grid the canvas shows (w·scale overshoots the canvas by < 1 texel). */
  cropX: number;
  cropY: number;
}

export function viewGrid(physW: number, physH: number): ViewGrid {
  const scale = Math.max(1, Math.round(physH / GRID_H));
  const w = Math.ceil(physW / scale);
  const h = Math.ceil(physH / scale);
  return { w, h, scale, cropX: physW / (w * scale), cropY: physH / (h * scale) };
}
