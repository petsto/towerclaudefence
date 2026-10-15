import type { Path } from '../data/types';

export interface PathGeom {
  readonly points: readonly { readonly x: number; readonly y: number; readonly at: number }[];
  readonly length: number;
}

/** Waypoints are tile centers; `at` is cumulative distance from the spawn waypoint. */
export function buildPath(path: Path): PathGeom {
  const points: { x: number; y: number; at: number }[] = [];
  for (const [col, row] of path) {
    const x = col + 0.5;
    const y = row + 0.5;
    const prev = points[points.length - 1];
    points.push({ x, y, at: prev ? prev.at + Math.hypot(x - prev.x, y - prev.y) : 0 });
  }
  return { points, length: points[points.length - 1]?.at ?? 0 };
}

export function pointAt(path: PathGeom, progress: number): { x: number; y: number; heading: number } {
  const d = Math.min(Math.max(progress, 0), path.length);
  const pts = path.points;
  let i = 1;
  while (i < pts.length - 1 && pts[i]!.at < d) i++;
  const a = pts[i - 1]!;
  const b = pts[i] ?? a;
  const seg = b.at - a.at;
  const t = seg > 0 ? (d - a.at) / seg : 0;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading: Math.atan2(b.y - a.y, b.x - a.x) };
}
