import type { Rng } from '../core/rng';
import { Cell, type Dir, DIR_STEP, DIRS, type Grid, getCell, inBounds, type Point } from './grid';
import { bfsDistances } from './pathing';

export interface Arrow {
  /** Floor cell the arrow is painted in. */
  cell: Point;
  /** Which of the cell's walls carries the paint. */
  wall: Dir;
  /** Direction the arrow points (along the wall). */
  points: Dir;
  /** Decoys point somewhere random, off the true path. */
  decoy: boolean;
}

export const ARROW_SPACING_MIN = 15;
export const ARROW_SPACING_MAX = 25;
export const DECOY_COUNT = 4;

const PERPENDICULAR: Record<Dir, readonly [Dir, Dir]> = { N: ['E', 'W'], S: ['E', 'W'], E: ['N', 'S'], W: ['N', 'S'] };

const isWallSide = (grid: Grid, p: Point, d: Dir) => getCell(grid, p.x + DIR_STEP[d].x, p.y + DIR_STEP[d].y) === Cell.Wall;

/** Shortest walkable path from → to (inclusive), following BFS distances from `to`. */
export function shortestPath(grid: Grid, from: Point, to: Point): Point[] {
  const dist = bfsDistances(grid, to.x, to.y);
  const at = (p: Point) => dist[p.y * grid.width + p.x];
  if (at(from) < 0) return [];
  const path: Point[] = [{ ...from }];
  let cur = from;
  while (at(cur) > 0) {
    const d = at(cur);
    const next = DIRS.map((dir) => ({ x: cur.x + DIR_STEP[dir].x, y: cur.y + DIR_STEP[dir].y })).find(
      (p) => inBounds(grid, p.x, p.y) && at(p) === d - 1,
    );
    if (!next) break;
    path.push(next);
    cur = next;
  }
  return path;
}

function dirBetween(a: Point, b: Point): Dir {
  const d = DIRS.find((dir) => a.x + DIR_STEP[dir].x === b.x && a.y + DIR_STEP[dir].y === b.y);
  if (!d) throw new Error('dirBetween: cells are not adjacent');
  return d;
}

/** Real arrows every ~15–25 path cells on a side wall, pointing onward; plus DECOY_COUNT random ones off-path. */
export function placeArrows(grid: Grid, path: Point[], rng: Rng): Arrow[] {
  const arrows: Arrow[] = [];
  let nextAt = rng.int(3, 8);
  for (let i = 0; i < path.length - 1; i++) {
    if (i < nextAt) continue;
    const cell = path[i];
    const points = dirBetween(cell, path[i + 1]);
    const wall = rng.shuffle([...PERPENDICULAR[points]]).find((d) => isWallSide(grid, cell, d));
    if (!wall) continue;
    arrows.push({ cell: { ...cell }, wall, points, decoy: false });
    nextAt = i + rng.int(ARROW_SPACING_MIN, ARROW_SPACING_MAX + 1);
  }

  const onPath = new Set(path.map((p) => p.y * grid.width + p.x));
  let decoys = 0;
  for (let attempt = 0; decoys < DECOY_COUNT && attempt < 5000; attempt++) {
    const cell = { x: rng.int(1, grid.width - 1), y: rng.int(1, grid.height - 1) };
    if (getCell(grid, cell.x, cell.y) !== Cell.Floor || onPath.has(cell.y * grid.width + cell.x)) continue;
    const wall = rng.shuffle([...DIRS]).find((d) => isWallSide(grid, cell, d));
    if (!wall) continue;
    arrows.push({ cell, wall, points: rng.pick(PERPENDICULAR[wall]), decoy: true });
    decoys++;
  }
  return arrows;
}
