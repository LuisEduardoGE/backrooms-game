import { Cell, cellToWorld, type Grid, getCell, WALL_HEIGHT } from './grid';
import { WALL_THICKNESS } from './solids';

/** Underside of a doorway header (metres): a door-height opening cut into the wall. */
export const HEADER_BOTTOM = 2.2;
/** Openings wider than this (cells) are gaps between halls and stay open to the ceiling. */
const MAX_OPENING = 3;

/** A header box: the wall above a doorway, from HEADER_BOTTOM to the ceiling. */
export interface Header {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y0: number;
  y1: number;
  /** True when the header runs along x (the wall line is horizontal on the grid). */
  alongX: boolean;
}

const floor = (g: Grid, x: number, y: number) => getCell(g, x, y) === Cell.Floor;
/** A doorway cell: floor carved out of a wall, so it belongs to no room — and to no merged hall (gaps between a hall's leftover stubs stay open to the ceiling). */
const carved = (g: Grid, x: number, y: number) => floor(g, x, y) && g.room[y * g.width + x] < 0 && g.zone[y * g.width + x] < 0;
/** Floor that belongs to a room (either side of a doorway). */
const roomFloor = (g: Grid, x: number, y: number) => floor(g, x, y) && g.room[y * g.width + x] >= 0;
const wall = (g: Grid, x: number, y: number) => getCell(g, x, y) === Cell.Wall;

/**
 * Headers over the doorways of chunk (cx, cy): wherever a run of 1–3 doorway cells (carved out of a
 * wall, so belonging to no room) cuts through a wall line, with a wall at both ends and rooms on both
 * sides, the wall continues above the opening — so a
 * doorway reads as an opening cut into a wall ("archway holes"), not a slot to the ceiling. Purely
 * visual: it sits above head height. A header belongs to the chunk holding its first opening cell.
 */
export function doorHeaders(grid: Grid, cx: number, cy: number, size: number): Header[] {
  const out: Header[] = [];
  const h = WALL_THICKNESS / 2;
  for (let y = cy * size; y < Math.min((cy + 1) * size, grid.height); y++) {
    for (let x = cx * size; x < Math.min((cx + 1) * size, grid.width); x++) {
      if (!floor(grid, x, y)) continue;
      // Along x: the wall line runs horizontally, rooms above and below.
      if (wall(grid, x - 1, y)) {
        let n = 0;
        while (carved(grid, x + n, y) && roomFloor(grid, x + n, y - 1) && roomFloor(grid, x + n, y + 1)) n++;
        if (n > 0 && n <= MAX_OPENING && wall(grid, x + n, y) && n === countRun(grid, x, y, 1, 0)) {
          out.push({ minX: cellToWorld(x - 1), maxX: cellToWorld(x + n), minZ: cellToWorld(y) - h, maxZ: cellToWorld(y) + h, y0: HEADER_BOTTOM, y1: WALL_HEIGHT, alongX: true });
        }
      }
      // Along z: the wall line runs vertically, rooms left and right.
      if (wall(grid, x, y - 1)) {
        let n = 0;
        while (carved(grid, x, y + n) && roomFloor(grid, x - 1, y + n) && roomFloor(grid, x + 1, y + n)) n++;
        if (n > 0 && n <= MAX_OPENING && wall(grid, x, y + n) && n === countRun(grid, x, y, 0, 1)) {
          out.push({ minX: cellToWorld(x) - h, maxX: cellToWorld(x) + h, minZ: cellToWorld(y - 1), maxZ: cellToWorld(y + n), y0: HEADER_BOTTOM, y1: WALL_HEIGHT, alongX: false });
        }
      }
    }
  }
  return out;
}

/** Length of the floor run starting at (x, y) in direction (dx, dy). */
function countRun(grid: Grid, x: number, y: number, dx: number, dy: number): number {
  let n = 0;
  while (floor(grid, x + dx * n, y + dy * n)) n++;
  return n;
}
