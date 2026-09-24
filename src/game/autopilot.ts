import { type MoveInput, NO_INPUT } from '../player/controller';
import { cellToWorld, type Point } from '../world/grid';

const LOOK_AHEAD = 2;
/** How many cells ahead to search for the closest path cell (lets progress survive corner-cutting). */
const PROGRESS_WINDOW = 6;
const TURN_RATE = 2.5;

export interface Autopilot {
  /** Index of the path cell currently being approached. */
  index: number;
}

export function createAutopilot(): Autopilot {
  return { index: 0 };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Walks a cell path: aims at a look-ahead waypoint, turns smoothly, slows for sharp turns.
 * On the last cell it walks at `finalAim` (the noclip wall's face), pressing into it.
 */
export function autopilotInput(
  a: Autopilot,
  pos: { x: number; z: number },
  yaw: number,
  path: readonly Point[],
  dt: number,
  finalAim?: { x: number; z: number },
): MoveInput {
  if (path.length === 0) return NO_INPUT;
  // Progress = the closest path cell within a short window ahead. (Requiring each cell to be touched
  // stalls: aiming at a look-ahead waypoint cuts corners past cells, then orbits the waypoint forever.)
  let best = a.index;
  let bestD = Infinity;
  for (let j = a.index; j <= Math.min(path.length - 1, a.index + PROGRESS_WINDOW); j++) {
    const d = Math.hypot(cellToWorld(path[j].x) - pos.x, cellToWorld(path[j].y) - pos.z);
    if (d < bestD) {
      best = j;
      bestD = d;
    }
  }
  a.index = best;
  const target = path[Math.min(path.length - 1, a.index + LOOK_AHEAD)];
  const final = a.index >= path.length - 1;
  const aim = final && finalAim ? finalAim : { x: cellToWorld(target.x), z: cellToWorld(target.y) };
  const want = Math.atan2(-(aim.x - pos.x), -(aim.z - pos.z));
  const diff = wrap(want - yaw);
  const turn = Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, diff));
  return {
    ...NO_INPUT,
    forward: Math.abs(diff) < 0.6 || final ? 1 : 0.3,
    lookDX: -turn,
  };
}
