import { Cell, CELL_SIZE, type Dir, DIR_STEP, DIRS, type Grid, getCell, type Point } from './grid';

/** How close (metres) the player's centre must get to the noclip wall's face to fall through. */
export const EXIT_TRIGGER = 0.45;

/** The noclip wall: the exit cell's first wall neighbour in N, E, S, W order. */
export function exitWallSide(grid: Grid, exit: Point): Dir {
  for (const d of DIRS) {
    const s = DIR_STEP[d];
    if (getCell(grid, exit.x + s.x, exit.y + s.y) === Cell.Wall) return d;
  }
  throw new Error(`exit ${exit.x},${exit.y} has no adjacent wall`);
}

/** True when the player stands in the exit cell pressed against its noclip wall. */
export function reachedExit(exit: Point, side: Dir, pos: { x: number; z: number }): boolean {
  const x0 = exit.x * CELL_SIZE;
  const z0 = exit.y * CELL_SIZE;
  const insideX = pos.x >= x0 && pos.x <= x0 + CELL_SIZE;
  const insideZ = pos.z >= z0 && pos.z <= z0 + CELL_SIZE;
  switch (side) {
    case 'N':
      return insideX && insideZ && pos.z - z0 <= EXIT_TRIGGER;
    case 'S':
      return insideX && insideZ && z0 + CELL_SIZE - pos.z <= EXIT_TRIGGER;
    case 'W':
      return insideX && insideZ && pos.x - x0 <= EXIT_TRIGGER;
    case 'E':
      return insideX && insideZ && x0 + CELL_SIZE - pos.x <= EXIT_TRIGGER;
  }
}
