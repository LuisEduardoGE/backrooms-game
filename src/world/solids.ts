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

/** Clear width (metres) of an arched doorway: a real, narrower opening with the wall either side. */
export const ARCH_WIDTH = 1.3;
/** Share of one-cell doorways built as arches. */
const ARCH_CHANCE = 0.4;

function archHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ 0x2c1b3c6d;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const roomFloor = (g: Grid, x: number, y: number) => getCell(g, x, y) === Cell.Floor && g.room[y * g.width + x] >= 0;

/**
 * If floor cell (x, y) is an arched doorway, the axis its wall line runs along ('x' or 'z'); else
 * null. An arch is a one-cell doorway carved into a wall line (wall on both ends, a room on both
 * sides, no room or merged-hall id of its own), chosen deterministically by position.
 */
export function archAxis(g: Grid, x: number, y: number): 'x' | 'z' | null {
  if (getCell(g, x, y) !== Cell.Floor) return null;
  const i = y * g.width + x;
  if (g.room[i] >= 0 || g.zone[i] >= 0) return null;
  let axis: 'x' | 'z' | null = null;
  if (isWall(g, x - 1, y) && isWall(g, x + 1, y) && roomFloor(g, x, y - 1) && roomFloor(g, x, y + 1)) axis = 'x';
  else if (isWall(g, x, y - 1) && isWall(g, x, y + 1) && roomFloor(g, x - 1, y) && roomFloor(g, x + 1, y)) axis = 'z';
  return axis && archHash(x, y) < ARCH_CHANCE ? axis : null;
}

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
  const mx = x0 + CELL_SIZE / 2;
  const mz = z0 + CELL_SIZE / 2;
  const h = WALL_THICKNESS / 2;
  if (c !== Cell.Wall) {
    // An arched doorway: the wall continues either side of a centred ARCH_WIDTH opening.
    const axis = archAxis(grid, cx, cy);
    if (!axis) return [];
    const o = ARCH_WIDTH / 2;
    return axis === 'x'
      ? [
          { minX: x0, maxX: mx - o, minZ: mz - h, maxZ: mz + h },
          { minX: mx + o, maxX: x0 + CELL_SIZE, minZ: mz - h, maxZ: mz + h },
        ]
      : [
          { minX: mx - h, maxX: mx + h, minZ: z0, maxZ: mz - o },
          { minX: mx - h, maxX: mx + h, minZ: mz + o, maxZ: z0 + CELL_SIZE },
        ];
  }

  // Wall arms reach neighbouring walls — and arched doorways, whose jambs continue the wall line.
  const n = isWall(grid, cx, cy - 1) || archAxis(grid, cx, cy - 1) === 'z';
  const s = isWall(grid, cx, cy + 1) || archAxis(grid, cx, cy + 1) === 'z';
  const e = isWall(grid, cx + 1, cy) || archAxis(grid, cx + 1, cy) === 'x';
  const w = isWall(grid, cx - 1, cy) || archAxis(grid, cx - 1, cy) === 'x';
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

/**
 * Distance along a ray (unit or not: `t` is in multiples of (dx, dz)) to where it enters a box, or
 * Infinity when it misses. A ray starting inside the box returns 0. (Slab method.)
 */
export function rayBox(ox: number, oz: number, dx: number, dz: number, r: Rect): number {
  let t0 = 0;
  let t1 = Infinity;
  for (const [o, d, lo, hi] of [
    [ox, dx, r.minX, r.maxX],
    [oz, dz, r.minZ, r.maxZ],
  ] as const) {
    if (Math.abs(d) < 1e-12) {
      if (o <= lo || o >= hi) return Infinity;
      continue;
    }
    let a = (lo - o) / d;
    let b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 >= t1) return Infinity;
  }
  return t0;
}

/**
 * True when a wall slab lies strictly between two points (XZ metres). Exact, so it never steps
 * over a slab thinner than a sampling interval. Pillars don't count (light wraps around them).
 */
export function wallBetween(grid: Grid, ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return false;
  // Every cell the segment passes through: sample at under a quarter cell, which can only miss a
  // cell's corner — and a wall slab never reaches into its cell's corners alone.
  const steps = Math.ceil(len / (CELL_SIZE / 4));
  const seen = new Set<number>();
  for (let i = 0; i <= steps; i++) {
    const x = Math.floor((ax + (dx * i) / steps) / CELL_SIZE);
    const z = Math.floor((az + (dz * i) / steps) / CELL_SIZE);
    const key = z * 65536 + x;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!isWall(grid, x, z)) continue;
    for (const r of solidRects(grid, x, z)) {
      // Enters the slab before reaching b (t = 0: starts inside it).
      if (rayBox(ax, az, dx, dz, r) < 1 - 1e-9) return true;
    }
  }
  return false;
}
