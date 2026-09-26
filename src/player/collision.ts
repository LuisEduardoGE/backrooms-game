import { type Grid, worldToCell } from '../world/grid';
import { type Rect, solidRects } from '../world/solids';

export interface Vec2 {
  x: number;
  z: number;
}

export const PLAYER_RADIUS = 0.3;
const EPS = 1e-4;

/** Extra solids by cell (e.g. furniture), consulted alongside the walls. */
export type ExtraSolids = (cx: number, cy: number) => readonly Rect[];

const NO_EXTRA: ExtraSolids = () => [];

/** Solid rects overlapping the player's square footprint (circle approximated by its AABB). */
function overlapping(grid: Grid, x: number, z: number, r: number, extra: ExtraSolids): Rect[] {
  const hits: Rect[] = [];
  for (let cy = worldToCell(z - r); cy <= worldToCell(z + r); cy++) {
    for (let cx = worldToCell(x - r); cx <= worldToCell(x + r); cx++) {
      for (const rect of [...solidRects(grid, cx, cy), ...extra(cx, cy)]) {
        if (x + r > rect.minX && x - r < rect.maxX && z + r > rect.minZ && z - r < rect.maxZ) hits.push(rect);
      }
    }
  }
  return hits;
}

/** Axis-separated move: resolve X, then Z, so the player slides along walls. */
export function moveWithCollision(grid: Grid, pos: Vec2, dx: number, dz: number, radius = PLAYER_RADIUS, extra: ExtraSolids = NO_EXTRA): Vec2 {
  let x = pos.x + dx;
  let z = pos.z;
  let hits = overlapping(grid, x, z, radius, extra);
  if (hits.length > 0) {
    if (dx > 0) x = Math.min(...hits.map((h) => h.minX)) - radius - EPS;
    else if (dx < 0) x = Math.max(...hits.map((h) => h.maxX)) + radius + EPS;
  }

  z += dz;
  hits = overlapping(grid, x, z, radius, extra);
  if (hits.length > 0) {
    if (dz > 0) z = Math.min(...hits.map((h) => h.minZ)) - radius - EPS;
    else if (dz < 0) z = Math.max(...hits.map((h) => h.maxZ)) + radius + EPS;
  }
  return { x, z };
}
