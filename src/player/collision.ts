import { Cell, CELL_SIZE, type Grid, getCell, PILLAR_SIZE, worldToCell } from '../world/grid';

export interface Vec2 {
  x: number;
  z: number;
}

export const PLAYER_RADIUS = 0.3;
const EPS = 1e-4;

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function solidRect(grid: Grid, cx: number, cy: number): Rect | null {
  const c = getCell(grid, cx, cy);
  const x0 = cx * CELL_SIZE;
  const z0 = cy * CELL_SIZE;
  if (c === Cell.Wall) return { minX: x0, maxX: x0 + CELL_SIZE, minZ: z0, maxZ: z0 + CELL_SIZE };
  if (c === Cell.Pillar) {
    const inset = (CELL_SIZE - PILLAR_SIZE) / 2;
    return { minX: x0 + inset, maxX: x0 + inset + PILLAR_SIZE, minZ: z0 + inset, maxZ: z0 + inset + PILLAR_SIZE };
  }
  return null;
}

/** Solid rects overlapping the player's square footprint (circle approximated by its AABB). */
function overlapping(grid: Grid, x: number, z: number, r: number): Rect[] {
  const hits: Rect[] = [];
  for (let cy = worldToCell(z - r); cy <= worldToCell(z + r); cy++) {
    for (let cx = worldToCell(x - r); cx <= worldToCell(x + r); cx++) {
      const rect = solidRect(grid, cx, cy);
      if (rect && x + r > rect.minX && x - r < rect.maxX && z + r > rect.minZ && z - r < rect.maxZ) hits.push(rect);
    }
  }
  return hits;
}

/** Axis-separated move: resolve X, then Z, so the player slides along walls. */
export function moveWithCollision(grid: Grid, pos: Vec2, dx: number, dz: number, radius = PLAYER_RADIUS): Vec2 {
  let x = pos.x + dx;
  let z = pos.z;
  let hits = overlapping(grid, x, z, radius);
  if (hits.length > 0) {
    if (dx > 0) x = Math.min(...hits.map((h) => h.minX)) - radius - EPS;
    else if (dx < 0) x = Math.max(...hits.map((h) => h.maxX)) + radius + EPS;
  }

  z += dz;
  hits = overlapping(grid, x, z, radius);
  if (hits.length > 0) {
    if (dz > 0) z = Math.min(...hits.map((h) => h.minZ)) - radius - EPS;
    else if (dz < 0) z = Math.max(...hits.map((h) => h.maxZ)) + radius + EPS;
  }
  return { x, z };
}
