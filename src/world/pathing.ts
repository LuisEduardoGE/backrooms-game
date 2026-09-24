import { Cell, type Grid, inBounds } from './grid';

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Breadth-first step distances from (sx, sy) over floor cells; -1 = unreachable. */
export function bfsDistances(grid: Grid, sx: number, sy: number): Int32Array {
  const { width, height } = grid;
  const dist = new Int32Array(width * height).fill(-1);
  if (!inBounds(grid, sx, sy) || grid.cells[sy * width + sx] !== Cell.Floor) return dist;

  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const start = sy * width + sx;
  dist[start] = 0;
  queue[tail++] = start;

  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(grid, nx, ny)) continue;
      const n = ny * width + nx;
      if (dist[n] !== -1 || grid.cells[n] !== Cell.Floor) continue;
      dist[n] = dist[i] + 1;
      queue[tail++] = n;
    }
  }
  return dist;
}
