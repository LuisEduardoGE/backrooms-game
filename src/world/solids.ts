import { Cell, CELL_SIZE, type Dir, DIR_STEP, type Grid, getCell, PILLAR_SIZE } from './grid';

/** Walls are 35 cm drywall partitions running through the middle of their grid cell. */
export const WALL_THICKNESS = 0.35;

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const isWall = (g: Grid, x: number, y: number) => getCell(g, x, y) === Cell.Wall;

/**
 * The solid boxes (world metres, XZ) inside one cell — the single source of truth for collision,
 * line of sight and rendering. A wall cell is a thin slab along each axis where it joins
 * neighbouring walls (a straight run, an L, a T or a cross); a lone wall cell is a thin post.
 * The rest of a wall cell is open floor.
 */
export function solidRects(grid: Grid, cx: number, cy: number): Rect[] {
  const c = getCell(grid, cx, cy);
  const x0 = cx * CELL_SIZE;
  const z0 = cy * CELL_SIZE;
  if (c === Cell.Pillar) {
    const inset = (CELL_SIZE - PILLAR_SIZE) / 2;
    return [{ minX: x0 + inset, maxX: x0 + inset + PILLAR_SIZE, minZ: z0 + inset, maxZ: z0 + inset + PILLAR_SIZE }];
  }
  if (c !== Cell.Wall) return [];

  const mx = x0 + CELL_SIZE / 2;
  const mz = z0 + CELL_SIZE / 2;
  const h = WALL_THICKNESS / 2;
  const n = isWall(grid, cx, cy - 1);
  const s = isWall(grid, cx, cy + 1);
  const e = isWall(grid, cx + 1, cy);
  const w = isWall(grid, cx - 1, cy);
  const rects: Rect[] = [];
  if (n || s) rects.push({ minX: mx - h, maxX: mx + h, minZ: n ? z0 : mz - h, maxZ: s ? z0 + CELL_SIZE : mz + h });
  if (e || w) rects.push({ minX: w ? x0 : mx - h, maxX: e ? x0 + CELL_SIZE : mx + h, minZ: mz - h, maxZ: mz + h });
  if (rects.length === 0) rects.push({ minX: mx - h, maxX: mx + h, minZ: mz - h, maxZ: mz + h });
  return rects;
}

/**
 * True when the wall on `dir` side of floor cell (x, y) presents a flat face across the whole
 * width of the cell — somewhere an arrow can be painted or the noclip wall can stand.
 */
export function hasFullFace(grid: Grid, x: number, y: number, dir: Dir): boolean {
  const nx = x + DIR_STEP[dir].x;
  const ny = y + DIR_STEP[dir].y;
  if (!isWall(grid, nx, ny)) return false;
  return dir === 'N' || dir === 'S'
    ? isWall(grid, nx - 1, ny) && isWall(grid, nx + 1, ny)
    : isWall(grid, nx, ny - 1) && isWall(grid, nx, ny + 1);
}

/** Distance (metres) from a floor cell's centre to the face of the thin wall on one side. */
export const WALL_FACE_DISTANCE = CELL_SIZE - WALL_THICKNESS / 2;
