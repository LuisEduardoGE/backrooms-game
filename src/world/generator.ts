import type { Rng } from '../core/rng';
import { Cell, type Grid, getCell, setCell } from './grid';

export interface Room {
  id: number;
  /** Carved floor rectangle (cells). */
  x: number;
  y: number;
  w: number;
  h: number;
  pillared: boolean;
}

export interface GenOptions {
  width: number;
  height: number;
  /** Smallest partition leaf (cells, including its shared wall). */
  minLeaf: number;
  /** Leaves larger than this are always split. */
  maxLeaf: number;
  /** Chance a split inserts a 3-cell-wide corridor leaf spanning the whole parent. */
  corridorChance: number;
  /** Chance a splittable leaf ≤ maxLeaf is kept whole (bigger rooms). */
  keepBigLeafChance: number;
  /** Extra doorways beyond the spanning tree, as a fraction of room count. */
  extraConnectionRatio: number;
  /** Chance a room ≥ 7×7 gets a pillar lattice. */
  pillarHallChance: number;
  /** Target fraction of floor cells in dark zones. */
  darkFraction: number;
  /** Minimum start→exit straight-line distance as a fraction of width. */
  exitDistanceRatio: number;
}

export const DEFAULT_GEN: GenOptions = {
  width: 200,
  height: 200,
  minLeaf: 5,
  maxLeaf: 16,
  corridorChance: 0.12,
  keepBigLeafChance: 0.2,
  extraConnectionRatio: 0.2,
  pillarHallChance: 0.5,
  darkFraction: 0.15,
  exitDistanceRatio: 0.7,
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Binary space partition into leaves that tile the rect exactly. */
function partition(r: Rect, rng: Rng, o: GenOptions, out: Rect[]): void {
  const canCutX = r.w >= o.minLeaf * 2;
  const canCutY = r.h >= o.minLeaf * 2;
  const tooBig = r.w > o.maxLeaf || r.h > o.maxLeaf;
  if (!canCutX && !canCutY) {
    out.push(r);
    return;
  }
  if (!tooBig && rng.chance(o.keepBigLeafChance)) {
    out.push(r);
    return;
  }

  const cutX = canCutX && (!canCutY || r.w > r.h || (r.w === r.h && rng.chance(0.5)));
  const len = cutX ? r.w : r.h;

  if (len >= o.minLeaf * 2 + 3 && rng.chance(o.corridorChance)) {
    const s = rng.int(o.minLeaf, len - o.minLeaf - 3 + 1);
    const [a, corridor, b]: Rect[] = cutX
      ? [
          { x: r.x, y: r.y, w: s, h: r.h },
          { x: r.x + s, y: r.y, w: 3, h: r.h },
          { x: r.x + s + 3, y: r.y, w: r.w - s - 3, h: r.h },
        ]
      : [
          { x: r.x, y: r.y, w: r.w, h: s },
          { x: r.x, y: r.y + s, w: r.w, h: 3 },
          { x: r.x, y: r.y + s + 3, w: r.w, h: r.h - s - 3 },
        ];
    partition(a, rng, o, out);
    out.push(corridor);
    partition(b, rng, o, out);
    return;
  }

  const s = rng.int(o.minLeaf, len - o.minLeaf + 1);
  const [a, b]: Rect[] = cutX
    ? [
        { x: r.x, y: r.y, w: s, h: r.h },
        { x: r.x + s, y: r.y, w: r.w - s, h: r.h },
      ]
    : [
        { x: r.x, y: r.y, w: r.w, h: s },
        { x: r.x, y: r.y + s, w: r.w, h: r.h - s },
      ];
  partition(a, rng, o, out);
  partition(b, rng, o, out);
}

/**
 * Partitions the interior into leaves and carves each leaf minus its right/bottom
 * edge, so neighbouring rooms are separated by exactly one wall cell.
 */
export function buildRooms(grid: Grid, rng: Rng, o: GenOptions): Room[] {
  const leaves: Rect[] = [];
  partition({ x: 1, y: 1, w: grid.width - 1, h: grid.height - 1 }, rng, o, leaves);

  return leaves.map((leaf, id) => {
    const room: Room = { id, x: leaf.x, y: leaf.y, w: leaf.w - 1, h: leaf.h - 1, pillared: false };
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        setCell(grid, x, y, Cell.Floor);
        grid.room[y * grid.width + x] = id;
      }
    }
    if (room.w >= 7 && room.h >= 7 && rng.chance(o.pillarHallChance)) {
      room.pillared = true;
      for (let y = room.y + 2; y <= room.y + room.h - 3; y += 3) {
        for (let x = room.x + 2; x <= room.x + room.w - 3; x += 3) setCell(grid, x, y, Cell.Pillar);
      }
    }
    return room;
  });
}

interface Separator {
  x: number;
  y: number;
  a: number;
  b: number;
}

/**
 * Carves 1-cell doorways: first a random spanning tree (Kruskal over wall cells that
 * separate two rooms), then extra doorways between not-yet-linked room pairs for loops.
 */
export function connectRooms(grid: Grid, rooms: Room[], rng: Rng, o: GenOptions): number {
  const roomAt = (x: number, y: number): number =>
    getCell(grid, x, y) === Cell.Floor ? grid.room[y * grid.width + x] : -1;

  const seps: Separator[] = [];
  for (let y = 1; y < grid.height - 1; y++) {
    for (let x = 1; x < grid.width - 1; x++) {
      if (getCell(grid, x, y) !== Cell.Wall) continue;
      const l = roomAt(x - 1, y);
      const r = roomAt(x + 1, y);
      if (l >= 0 && r >= 0 && l !== r) {
        seps.push({ x, y, a: l, b: r });
        continue;
      }
      const u = roomAt(x, y - 1);
      const d = roomAt(x, y + 1);
      if (u >= 0 && d >= 0 && u !== d) seps.push({ x, y, a: u, b: d });
    }
  }
  rng.shuffle(seps);

  const parent = rooms.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const linked = new Set<string>();
  const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const carve = (s: Separator) => {
    setCell(grid, s.x, s.y, Cell.Floor);
    linked.add(pairKey(s.a, s.b));
  };

  let doors = 0;
  for (const s of seps) {
    const ra = find(s.a);
    const rb = find(s.b);
    if (ra === rb) continue;
    parent[ra] = rb;
    carve(s);
    doors++;
  }

  const extraTarget = Math.round(rooms.length * o.extraConnectionRatio);
  let extras = 0;
  for (const s of seps) {
    if (extras >= extraTarget) break;
    if (getCell(grid, s.x, s.y) === Cell.Floor || linked.has(pairKey(s.a, s.b))) continue;
    carve(s);
    extras++;
    doors++;
  }
  return doors;
}
