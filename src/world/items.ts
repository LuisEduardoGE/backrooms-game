import type { Rng } from '../core/rng';
import { NOTES } from '../game/notes';
import type { Level } from './generator';
import { Cell, type Grid, type Point } from './grid';

export type ItemKind = 'battery' | 'almondWater' | 'note';

export interface Item {
  id: number;
  kind: ItemKind;
  cell: Point;
  /** Index into NOTES for notes, otherwise null. */
  note: number | null;
}

export const ITEM_COUNTS: Record<ItemKind, number> = { battery: 12, almondWater: 10, note: 6 };
/** Minimum Chebyshev distance (cells) between any two items. */
export const MIN_ITEM_SPACING = 4;
const NEAR_DARK_RADIUS = 3;
/** Share of supplies drawn from dark-zone edges (the rest anywhere). */
const NEAR_DARK_BIAS = 0.7;
const NOTE_PATH_RADIUS = 6;
/** The 'start' essential note lands within this many cells of the spawn. */
const NOTE_START_RADIUS = 10;
const MAX_TRIES = 400;

/** Marks every cell within `r` (Chebyshev) of a source cell. */
function dilate(grid: Grid, isSource: (i: number) => boolean, r: number): Uint8Array {
  const out = new Uint8Array(grid.cells.length);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!isSource(y * grid.width + x)) continue;
      for (let ny = Math.max(0, y - r); ny <= Math.min(grid.height - 1, y + r); ny++) {
        for (let nx = Math.max(0, x - r); nx <= Math.min(grid.width - 1, x + r); nx++) out[ny * grid.width + nx] = 1;
      }
    }
  }
  return out;
}

/** Batteries and Almond Water favour dark-zone edges; notes sit within reach of the true path. */
export function placeItems(level: Level, path: Point[], rng: Rng): Item[] {
  const { grid, start, exit } = level;
  const w = grid.width;
  const reserved = new Set([start.y * w + start.x, exit.y * w + exit.x]);
  const floor: number[] = [];
  for (let i = 0; i < grid.cells.length; i++) if (grid.cells[i] === Cell.Floor && !reserved.has(i)) floor.push(i);

  const darkEdge = dilate(grid, (i) => grid.dark[i] === 1, NEAR_DARK_RADIUS);
  const nearDark = floor.filter((i) => darkEdge[i] && !grid.dark[i]);
  const pathSet = new Set(path.map((p) => p.y * w + p.x));
  const pathBand = dilate(grid, (i) => pathSet.has(i), NOTE_PATH_RADIUS);
  const nearPath = floor.filter((i) => pathBand[i]);
  // Near the spawn *and* on the way, so the first thing a player finds tells them what to do.
  const nearStart = nearPath.filter((i) => {
    const x = i % w;
    const y = (i - x) / w;
    return Math.max(Math.abs(x - start.x), Math.abs(y - start.y)) <= NOTE_START_RADIUS;
  });

  const items: Item[] = [];
  const farEnough = (x: number, y: number) =>
    items.every((it) => Math.max(Math.abs(it.cell.x - x), Math.abs(it.cell.y - y)) >= MIN_ITEM_SPACING);
  const place = (kind: ItemKind, pool: number[], note: number | null) => {
    if (pool.length === 0) return;
    for (let t = 0; t < MAX_TRIES; t++) {
      const i = rng.pick(pool);
      const x = i % w;
      const y = (i - x) / w;
      if (!farEnough(x, y)) continue;
      items.push({ id: items.length, kind, cell: { x, y }, note });
      return;
    }
  };
  const supplyPool = () => (nearDark.length > 0 && rng.chance(NEAR_DARK_BIAS) ? nearDark : floor);

  // Notes that explain the goal go first (so spacing never crowds them out); the rest are random.
  const notePool = nearPath.length > 0 ? nearPath : floor;
  const essentials = NOTES.flatMap((n, k) => (n.essential ? [k] : []));
  for (const note of essentials) place('note', NOTES[note].essential === 'start' ? nearStart : notePool, note);
  const others = rng.shuffle(NOTES.flatMap((n, k) => (n.essential ? [] : [k])));
  for (const note of others.slice(0, ITEM_COUNTS.note - essentials.length)) place('note', notePool, note);

  for (let k = 0; k < ITEM_COUNTS.battery; k++) place('battery', supplyPool(), null);
  for (let k = 0; k < ITEM_COUNTS.almondWater; k++) place('almondWater', supplyPool(), null);
  return items;
}
