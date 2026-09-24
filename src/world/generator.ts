import { createRng, deriveSeed, type Rng } from '../core/rng';
import { Cell, createGrid, type Grid, getCell, type Point, setCell } from './grid';
import { bfsDistances } from './pathing';

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

export interface Level {
  seed: number;
  grid: Grid;
  rooms: Room[];
  start: Point;
  /** Camera yaw at spawn, facing the longest open run of floor (yaw 0 looks toward −y). */
  startYaw: number;
  exit: Point;
}

export const MAX_GEN_ATTEMPTS = 20;

export function generateLevel(seed: number, overrides: Partial<GenOptions> = {}): Level {
  const o: GenOptions = { ...DEFAULT_GEN, ...overrides };
  for (let attempt = 0; attempt < MAX_GEN_ATTEMPTS; attempt++) {
    const layoutSeed = deriveSeed(seed, attempt === 0 ? 'layout' : `layout:${attempt}`);
    const level = tryGenerate(layoutSeed, o);
    if (level) return { seed, ...level };
  }
  throw new Error(`generateLevel: no valid layout for seed ${seed} after ${MAX_GEN_ATTEMPTS} attempts`);
}

function tryGenerate(layoutSeed: number, o: GenOptions): Omit<Level, 'seed'> | null {
  const rng = createRng(layoutSeed);
  const grid = createGrid(o.width, o.height);
  const rooms = buildRooms(grid, rng, o);
  connectRooms(grid, rooms, rng, o);
  const startRoom = pickStartRoom(rooms, rng, o);
  const start = pickFloorCell(grid, startRoom, rng);
  assignDarkZones(grid, rooms, startRoom.id, rng, o.darkFraction);
  const exit = pickExit(grid, start, rng, o);
  return exit ? { grid, rooms, start, startYaw: pickStartYaw(grid, start), exit } : null;
}

/** Start near a random corner so the far side of the map is available for the exit. */
function pickStartRoom(rooms: Room[], rng: Rng, o: GenOptions): Room {
  const corner = rng.pick([
    { x: 0, y: 0 },
    { x: o.width, y: 0 },
    { x: 0, y: o.height },
    { x: o.width, y: o.height },
  ]);
  const dist = (r: Room) => Math.hypot(r.x + r.w / 2 - corner.x, r.y + r.h / 2 - corner.y);
  const near = rooms.filter((r) => dist(r) < o.width * 0.25);
  return near.length > 0 ? rng.pick(near) : rooms.reduce((best, r) => (dist(r) < dist(best) ? r : best));
}

/** Grid step for each spawn yaw: yaw 0 → −y, π/2 → −x, π → +y, −π/2 → +x. */
const FACINGS = [
  { yaw: 0, dx: 0, dy: -1 },
  { yaw: Math.PI / 2, dx: -1, dy: 0 },
  { yaw: Math.PI, dx: 0, dy: 1 },
  { yaw: -Math.PI / 2, dx: 1, dy: 0 },
];

/** Faces the player down the longest straight run of floor so the first frame isn't a wall. */
function pickStartYaw(grid: Grid, start: Point): number {
  let best = FACINGS[0];
  let bestRun = -1;
  for (const f of FACINGS) {
    let run = 0;
    while (getCell(grid, start.x + f.dx * (run + 1), start.y + f.dy * (run + 1)) === Cell.Floor) run++;
    if (run > bestRun) {
      best = f;
      bestRun = run;
    }
  }
  return best.yaw;
}

function pickFloorCell(grid: Grid, room: Room, rng: Rng): Point {
  const cells: Point[] = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (getCell(grid, x, y) === Cell.Floor) cells.push({ x, y });
    }
  }
  return rng.pick(cells);
}

/** Number of rooms dark zones grow from; regions may merge, so a level has at most this many (barring dead ends). */
export const DARK_REGION_SEEDS = 5;

interface DoorLink {
  /** Cell index of the doorway. */
  i: number;
  a: number;
  b: number;
}

/** Every carved doorway with the two rooms it joins. */
function doorLinks(grid: Grid): DoorLink[] {
  const links: DoorLink[] = [];
  const roomAt = (x: number, y: number) => (getCell(grid, x, y) === Cell.Floor ? grid.room[y * grid.width + x] : -1);
  for (let y = 1; y < grid.height - 1; y++) {
    for (let x = 1; x < grid.width - 1; x++) {
      const i = y * grid.width + x;
      if (grid.cells[i] !== Cell.Floor || grid.room[i] !== -1) continue;
      const l = roomAt(x - 1, y);
      const r = roomAt(x + 1, y);
      if (l >= 0 && r >= 0) links.push({ i, a: l, b: r });
      else {
        const u = roomAt(x, y - 1);
        const d = roomAt(x, y + 1);
        if (u >= 0 && d >= 0) links.push({ i, a: u, b: d });
      }
    }
  }
  return links;
}

/**
 * Switches off whole rooms (never the start room) until the dark fraction is reached, growing
 * contiguous regions outward through doorways from a few seed rooms. Doorways between two dark
 * rooms go dark too, so each region is one walkable unpowered area.
 */
function assignDarkZones(grid: Grid, rooms: Room[], startRoomId: number, rng: Rng, fraction: number): void {
  let floor = 0;
  for (let i = 0; i < grid.cells.length; i++) if (grid.cells[i] === Cell.Floor) floor++;
  const target = floor * fraction;

  const links = doorLinks(grid);
  const neighbours: number[][] = rooms.map(() => []);
  for (const { a, b } of links) {
    neighbours[a].push(b);
    neighbours[b].push(a);
  }

  const isDarkRoom = new Uint8Array(rooms.length);
  const darkRooms: number[] = [];
  let dark = 0;
  const darken = (id: number) => {
    isDarkRoom[id] = 1;
    darkRooms.push(id);
    const r = rooms[id];
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = y * grid.width + x;
        grid.dark[i] = 1;
        if (grid.cells[i] === Cell.Floor) dark++;
      }
    }
  };

  const seeds = rng.shuffle(rooms.filter((r) => r.id !== startRoomId).map((r) => r.id));
  let nextSeed = 0;
  const addSeed = (): boolean => {
    while (nextSeed < seeds.length) {
      const id = seeds[nextSeed++];
      if (!isDarkRoom[id]) {
        darken(id);
        return true;
      }
    }
    return false;
  };

  for (let k = 0; k < DARK_REGION_SEEDS && dark < target; k++) addSeed();
  while (dark < target) {
    const options: number[] = [];
    for (const id of darkRooms) {
      for (const n of neighbours[id]) if (!isDarkRoom[n] && n !== startRoomId) options.push(n);
    }
    if (options.length > 0) darken(rng.pick(options));
    else if (!addSeed()) break;
  }

  for (const { i, a, b } of links) if (isDarkRoom[a] && isDarkRoom[b]) grid.dark[i] = 1;
}

function hasAdjacentWall(grid: Grid, x: number, y: number): boolean {
  return (
    getCell(grid, x + 1, y) === Cell.Wall ||
    getCell(grid, x - 1, y) === Cell.Wall ||
    getCell(grid, x, y + 1) === Cell.Wall ||
    getCell(grid, x, y - 1) === Cell.Wall
  );
}

/** Exit: reachable, lit floor cell against a wall (the future noclip wall), far from start. */
function pickExit(grid: Grid, start: Point, rng: Rng, o: GenOptions): Point | null {
  const dist = bfsDistances(grid, start.x, start.y);
  const minDistance = o.width * o.exitDistanceRatio;
  const candidates: Point[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      if (grid.cells[i] !== Cell.Floor || dist[i] < 0 || grid.dark[i]) continue;
      if (Math.hypot(x - start.x, y - start.y) < minDistance) continue;
      if (!hasAdjacentWall(grid, x, y)) continue;
      candidates.push({ x, y });
    }
  }
  return candidates.length > 0 ? rng.pick(candidates) : null;
}
