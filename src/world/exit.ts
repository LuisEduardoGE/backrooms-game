import { CELL_SIZE, cellToWorld, type Dir, DIR_STEP, DIRS, type Grid, type Point } from './grid';
import { hasFullFace, WALL_FACE_DISTANCE } from './solids';

/** How close (metres) the player's centre must get to the noclip wall's face to fall through. */
export const EXIT_TRIGGER = 0.45;

/** The noclip wall: the exit cell's first full-width wall face in N, E, S, W order. */
export function exitWallSide(grid: Grid, exit: Point): Dir {
  for (const d of DIRS) if (hasFullFace(grid, exit.x, exit.y, d)) return d;
  throw new Error(`exit ${exit.x},${exit.y} has no adjacent wall`);
}

/** True when the player is pressed against the noclip wall's face, in line with the exit cell. */
export function reachedExit(exit: Point, side: Dir, pos: { x: number; z: number }): boolean {
  const cx = cellToWorld(exit.x);
  const cz = cellToWorld(exit.y);
  const s = DIR_STEP[side];
  // Distance from the player to the face, measured toward the wall (positive = in front of it).
  const toFace = s.x !== 0 ? (cx + s.x * WALL_FACE_DISTANCE - pos.x) * s.x : (cz + s.y * WALL_FACE_DISTANCE - pos.z) * s.y;
  const lateral = s.x !== 0 ? Math.abs(pos.z - cz) : Math.abs(pos.x - cx);
  return toFace >= 0 && toFace <= EXIT_TRIGGER && lateral <= CELL_SIZE / 2;
}
