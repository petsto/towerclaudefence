// Orthographic steep-3/4 camera (art-direction §1): pitch 55°, no yaw, integer PPU zoom, texel-snapped pan.
import * as THREE from 'three';

export const PITCH = THREE.MathUtils.degToRad(55);
const SIN = Math.sin(PITCH);
const COS = Math.cos(PITCH);
const DIST = 60;
// Low-res texels per world unit. The game opens at 30 (units read at StarCraft-like size), or the closest step
// below it that still fits every spawn and the core.
const ZOOMS = [24, 30, 40] as const;
const DEFAULT_ZOOM = 1;
export const DEFAULT_PPU: number = ZOOMS[DEFAULT_ZOOM];
const EDGE_PX = 12;
const PAN_SPEED = 14; // units/s at PPU 32

export interface CameraRig {
  readonly camera: THREE.OrthographicCamera;
  /** Recompute frustum for a render target of this size. */
  setTargetSize(w: number, h: number): void;
  /** Low-res texels of screen covered by the top / bottom HUD; lets the edge rows scroll clear of it. */
  setInsets(top: number, bottom: number): void;
  /**
   * Centre this world rect (x = col, z = row) in the view between the insets at the closest zoom up to the default
   * that fits it (else the widest); `keep` (the core) stays in view when even that doesn't fit. Re-applied on
   * resize/inset until the player pans or zooms.
   */
  frame(rect: { x0: number; z0: number; x1: number; z1: number }, keep: { x: number; z: number }): void;
  update(dt: number): void;
  dispose(): void;
}

export function createCameraRig(canvas: HTMLCanvasElement, cols: number, rows: number): CameraRig {
  const camera = new THREE.OrthographicCamera();
  let zoom = DEFAULT_ZOOM;
  let rtW = 1;
  let rtH = 1;
  let inset = 0;
  let insetTop = 0;
  // Start looking at the map centre, then clamp.
  let tx = cols / 2;
  let tz = rows / 2;
  const keys = new Set<string>();
  let pointer: { x: number; y: number } | null = null;
  let focus: { rect: { x0: number; z0: number; x1: number; z1: number }; keep: { x: number; z: number } } | null = null;

  const ppu = (): number => ZOOMS[zoom]!;

  function size(): void {
    const w = rtW / ppu();
    const h = rtH / ppu();
    Object.assign(camera, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2, near: 1, far: 200 });
    camera.updateProjectionMatrix();
  }

  function clampRange(v: number, lo: number, hi: number): number {
    return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
  }

  function applyFocus(): void {
    if (!focus) return;
    const { rect: r, keep } = focus;
    const viewW = (p: number): number => rtW / p;
    const viewD = (p: number): number => (rtH - inset - insetTop) / (p * SIN); // world z rows visible between the HUD bars
    zoom = DEFAULT_ZOOM;
    while (zoom > 0 && (r.x1 - r.x0 > viewW(ppu()) || r.z1 - r.z0 > viewD(ppu()))) zoom--;
    size();
    const p = ppu();
    const w = viewW(p) / 2 - 1.5;
    const d = viewD(p) / 2 - 1.5; // margin: the core model (~1.5 wide, 1.2 tall) must clear the edges and the console
    // centre the rect in the visible band, then pull back toward the core if the rect overflows
    const cx = clampRange((r.x0 + r.x1) / 2, keep.x - w, keep.x + w);
    const cz = clampRange((r.z0 + r.z1) / 2, keep.z - d, keep.z + d);
    tx = cx;
    tz = cz + (inset - insetTop) / (2 * p * SIN); // the band's centre sits off the camera target by half the inset difference
  }

  function place(): void {
    applyFocus();
    const p = ppu();
    const viewW = rtW / p;
    const viewH = rtH / p;
    tx = clampRange(tx, viewW / 2 - 1, cols - viewW / 2 + 1);
    tz = clampRange(tz, viewH / (2 * SIN) - 1 - insetTop / p / SIN, rows - viewH / (2 * SIN) + 1 + inset / p / SIN);
    // Snap to the texel grid so static geometry doesn't shimmer while panning.
    const sx = Math.round(tx * p) / p;
    const sz = Math.round(tz * p * SIN) / (p * SIN);
    camera.position.set(sx, DIST * SIN, sz + DIST * COS);
    camera.lookAt(sx, 0, sz);
    camera.updateMatrixWorld();
  }

  const onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.type === 'keydown') keys.add(e.code);
    else keys.delete(e.code);
  };
  const onBlur = (): void => keys.clear();
  const onMove = (e: PointerEvent): void => {
    pointer = { x: e.clientX, y: e.clientY };
  };
  const onLeave = (): void => {
    pointer = null;
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const next = Math.min(ZOOMS.length - 1, Math.max(0, zoom + (e.deltaY < 0 ? 1 : -1)));
    if (next === zoom) return;
    focus = null;
    zoom = next;
    size();
    place();
  };

  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return {
    camera,
    setTargetSize(w, h) {
      rtW = w;
      rtH = h;
      size();
      place();
    },
    setInsets(top, bottom) {
      insetTop = top;
      inset = bottom;
      place();
    },
    frame(rect, keep) {
      focus = { rect, keep };
      place();
    },
    update(dt) {
      let dx = 0;
      let dz = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) dz -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) dz += 1;
      if (pointer) {
        const r = canvas.getBoundingClientRect();
        if (pointer.x < r.left + EDGE_PX) dx -= 1;
        else if (pointer.x > r.right - EDGE_PX) dx += 1;
        if (pointer.y < r.top + EDGE_PX) dz -= 1;
        else if (pointer.y > r.bottom - EDGE_PX) dz += 1;
      }
      if (dx === 0 && dz === 0) return;
      focus = null;
      const step = (PAN_SPEED * (32 / ppu()) * Math.min(dt, 0.1)) / Math.hypot(Math.sign(dx), Math.sign(dz));
      tx += Math.sign(dx) * step;
      tz += (Math.sign(dz) * step) / SIN; // screen-equal speed on the foreshortened axis
      place();
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
    },
  };
}
