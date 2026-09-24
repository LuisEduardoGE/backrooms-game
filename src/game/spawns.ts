import type { Rng } from '../core/rng';
import { Cell, type Grid, type Point } from '../world/grid';
import { bfsDistances } from '../world/pathing';

export const MAX_SMILERS = 5;
const SMILER_MIN_PLAYER_CELLS = 12;
const SMILER_MIN_SPACING = 20;
const HOWLER_MIN_PATH = 30;
const HOWLER_MAX_PATH = 60;

const cheb = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Up to `max` dark floor cells, well away from the player and from each other. */
export function spawnSmilerCells(grid: Grid, player: Point, rng: Rng, max = MAX_SMILERS): Point[] {
  const candidates: Point[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      if (grid.cells[i] !== Cell.Floor || !grid.dark[i]) continue;
      if (cheb({ x, y }, player) < SMILER_MIN_PLAYER_CELLS) continue;
      candidates.push({ x, y });
    }
  }
  const picked: Point[] = [];
  for (const c of rng.shuffle(candidates)) {
    if (picked.length >= max) break;
    if (picked.every((p) => cheb(p, c) >= SMILER_MIN_SPACING)) picked.push(c);
  }
  return picked;
}

/** A floor cell 30–60 walking cells from the player: close enough to matter, far enough to be fair. */
export function spawnHowlerCell(grid: Grid, player: Point, rng: Rng): Point | null {
  const dist = bfsDistances(grid, player.x, player.y);
  const candidates: Point[] = [];
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] < HOWLER_MIN_PATH || dist[i] > HOWLER_MAX_PATH) continue;
    const x = i % grid.width;
    candidates.push({ x, y: (i - x) / grid.width });
  }
  return candidates.length > 0 ? rng.pick(candidates) : null;
}
