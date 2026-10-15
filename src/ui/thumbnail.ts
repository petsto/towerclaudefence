import type { MapDef, Tile } from '../data/types';

export const SPAWN_COLOR = '#ff3a3a';
export const CORE_COLOR = '#38e0d0';

/** Draws the map's tile grid at `px` pixels per tile. */
export function drawMapThumbnail(canvas: HTMLCanvasElement, map: MapDef, px = 4): void {
  canvas.width = map.cols * px;
  canvas.height = map.rows * px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const p = map.palette;
  const fill: Record<Tile, string> = {
    ground: p.ground,
    path: p.path,
    build: p.buildPad,
    decor: p.decor,
    spawn: SPAWN_COLOR,
    core: CORE_COLOR,
  };
  map.tiles.forEach((row, r) =>
    row.forEach((tile, c) => {
      // checker the ground with its alt colour for texture
      ctx.fillStyle = tile === 'ground' && (c * 7 + r * 13) % 3 === 0 ? p.groundAlt : fill[tile];
      ctx.fillRect(c * px, r * px, px, px);
      if (tile === 'build' && px >= 4) {
        ctx.fillStyle = p.accent;
        ctx.globalAlpha = 0.45;
        ctx.fillRect(c * px, r * px, px, 1);
        ctx.globalAlpha = 1;
      }
    }),
  );
}
