import { createRng, deriveSeed, type Rng } from '../core/rng';
import { exitWallSide } from './exit';
import { hasFullFace } from './solids';
import { Cell, createGrid, type Dir, DIRS, type Grid, getCell, type Point, setCell } from './grid';
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
  /** Chance two neighbouring rooms are merged into one hall (their shared wall mostly removed). */
  mergeChance: number;
  /** Chance a doorway is widened by a cell on each side. */
  widenChance: number;
  /** Chance a large room (not a pillar hall) gets structures: partitions, blocks or a colonnade. */
  structureChance: number;
  /** Openings per 5 cells of long wall between rooms ("randomly segmented rooms", Level 0 canon). */
  segmentChance: number;
}

/** Cells between columns in a pillar hall (8 m, like an open-plan office grid). */
const PILLAR_SPACING = 4;

export const DEFAULT_GEN: GenOptions = {
  width: 200,
  height: 200,
  minLeaf: 5,
  maxLeaf: 14,
  corridorChance: 0.12,
  keepBigLeafChance: 0.15,
  extraConnectionRatio: 0.2,
  pillarHallChance: 0.6,
  darkFraction: 0.15,
  exitDistanceRatio: 0.7,
  mergeChance: 0.25,
  widenChance: 0.3,
  structureChance: 0.8,
  segmentChance: 0.4,
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
      for (let y = room.y + 2; y <= room.y + room.h - 3; y += PILLAR_SPACING) {
        for (let x = room.x + 2; x <= room.x + room.w - 3; x += PILLAR_SPACING) setCell(grid, x, y, Cell.Pillar);
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
  /** Which wall of the exit cell is the noclip wall. */
  exitSide: Dir;
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
  openUp(grid, rng, o);
  furnish(grid, rooms, rng, o);
  const startRoom = pickStartRoom(rooms, rng, o);
  const start = pickFloorCell(grid, startRoom, rng);
  assignDarkZones(grid, rooms, startRoom.id, rng, o.darkFraction);
  const exit = pickExit(grid, start, rng, o);
  return exit ? { grid, rooms, start, startYaw: pickStartYaw(grid, start), exit, exitSide: exitWallSide(grid, exit) } : null;
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

/** The noclip wall needs a flat face spanning the whole cell (not a wall seen end-on). */
function hasAdjacentWall(grid: Grid, x: number, y: number): boolean {
  return DIRS.some((d) => hasFullFace(grid, x, y, d));
}

/** Exit: reachable, lit floor cell against a wall (the future noclip wall), far from start. */
function pickExit(grid: Grid, start: Point, rng: Rng, o: GenOptions): Point | null {
  const dist = bfsDistances(grid, start.x, start.y);
  const minDistance = o.width * o.exitDistanceRatio;
  const candidates: Point[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      // room < 0 = doorway: a noclip wall there would sit in a door gap.
      if (grid.cells[i] !== Cell.Floor || grid.room[i] < 0 || dist[i] < 0 || grid.dark[i]) continue;
      if (Math.hypot(x - start.x, y - start.y) < minDistance) continue;
      if (!hasAdjacentWall(grid, x, y)) continue;
      candidates.push({ x, y });
    }
  }
  return candidates.length > 0 ? rng.pick(candidates) : null;
}

/** Wall cells that sit between two different rooms (left/right or above/below), keyed by room pair. */
function separatorsByPair(grid: Grid): Map<string, Point[]> {
  const roomAt = (x: number, y: number): number =>
    getCell(grid, x, y) === Cell.Floor ? grid.room[y * grid.width + x] : -1;
  const pairs = new Map<string, Point[]>();
  const add = (a: number, b: number, p: Point) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const list = pairs.get(key);
    if (list) list.push(p);
    else pairs.set(key, [p]);
  };
  for (let y = 1; y < grid.height - 1; y++) {
    for (let x = 1; x < grid.width - 1; x++) {
      if (getCell(grid, x, y) !== Cell.Wall) continue;
      const l = roomAt(x - 1, y);
      const r = roomAt(x + 1, y);
      if (l >= 0 && r >= 0 && l !== r) {
        add(l, r, { x, y });
        continue;
      }
      const u = roomAt(x, y - 1);
      const d = roomAt(x, y + 1);
      if (u >= 0 && d >= 0 && u !== d) add(u, d, { x, y });
    }
  }
  return pairs;
}

/**
 * Level 0 is open office space, not closed rooms: merge some neighbouring rooms into halls (most
 * of their shared wall goes, leaving stubs) and widen the remaining doorways. Only walls between
 * two rooms are ever removed, so connectivity can only grow.
 */
function openUp(grid: Grid, rng: Rng, o: GenOptions): void {
  const MERGE_KEEP = 0.15; // share of a merged wall left standing as partition stubs
  // Merged rooms become one hall: union-find over room ids, applied to grid.zone below.
  let rooms = 0;
  for (let i = 0; i < grid.room.length; i++) rooms = Math.max(rooms, grid.room[i] + 1);
  const parent = Array.from({ length: rooms }, (_, i) => i);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const carved: { cell: Point; room: number }[] = [];
  for (const [key, cells] of separatorsByPair(grid)) {
    if (rng.chance(o.mergeChance)) {
      const [a, b] = key.split(':').map(Number);
      parent[find(a)] = find(b);
      for (const c of cells) {
        if (rng.chance(MERGE_KEEP)) continue;
        setCell(grid, c.x, c.y, Cell.Floor);
        carved.push({ cell: c, room: a });
      }
    }
  }
  for (let i = 0; i < grid.room.length; i++) if (grid.room[i] >= 0) grid.zone[i] = find(grid.room[i]);
  for (const { cell, room } of carved) grid.zone[cell.y * grid.width + cell.x] = find(room);
  segmentWalls(grid, rng, o);
  // Widen doorways: a doorway is floor with no room id; grow it along its wall line.
  const doors: Point[] = [];
  for (let y = 1; y < grid.height - 1; y++) {
    for (let x = 1; x < grid.width - 1; x++) {
      const i = y * grid.width + x;
      if (grid.cells[i] === Cell.Floor && grid.room[i] < 0) doors.push({ x, y });
    }
  }
  const isRoomFloor = (x: number, y: number) => getCell(grid, x, y) === Cell.Floor && grid.room[y * grid.width + x] >= 0;
  for (const d of doors) {
    if (!rng.chance(o.widenChance)) continue;
    // Horizontal passage (rooms left/right) → the wall runs vertically, so widen up/down; and vice versa.
    const vertical = isRoomFloor(d.x - 1, d.y) && isRoomFloor(d.x + 1, d.y);
    const along: Point[] = vertical ? [{ x: d.x, y: d.y - 1 }, { x: d.x, y: d.y + 1 }] : [{ x: d.x - 1, y: d.y }, { x: d.x + 1, y: d.y }];
    for (const c of along) {
      const between = vertical
        ? isRoomFloor(c.x - 1, c.y) && isRoomFloor(c.x + 1, c.y)
        : isRoomFloor(c.x, c.y - 1) && isRoomFloor(c.x, c.y + 1);
      if (getCell(grid, c.x, c.y) === Cell.Wall && between) setCell(grid, c.x, c.y, Cell.Floor);
    }
  }
}


type Structure = 'partitions' | 'blocks' | 'colonnade';

/**
 * Gives large rooms their own structure so no two feel alike: free-standing partition panels (as in
 * the original photo), thick wall blocks (Kane Pixels) or a colonnade. Every structure keeps a ring
 * of the room's own floor around it (8-way), so it can never cut a path or block a doorway.
 */
function furnish(grid: Grid, rooms: Room[], rng: Rng, o: GenOptions): void {
  const kinds: Structure[] = ['partitions', 'partitions', 'blocks', 'colonnade'];
  for (const room of rooms) {
    if (room.pillared || room.w < 6 || room.h < 6 || !rng.chance(o.structureChance)) continue;
    const kind = rng.pick(kinds);
    const inRoom = (x: number, y: number) => getCell(grid, x, y) === Cell.Floor && grid.room[y * grid.width + x] === room.id;
    /** Places `cells` as `as` if each has a clear ring of this room's floor; returns success. */
    const place = (cells: Point[], as: Cell): boolean => {
      for (const c of cells) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!inRoom(c.x + dx, c.y + dy)) return false;
      }
      for (const c of cells) {
        setCell(grid, c.x, c.y, as);
        grid.room[c.y * grid.width + c.x] = -1;
        grid.zone[c.y * grid.width + c.x] = -1;
      }
      return true;
    };
    const randomIn = (margin: number): Point => ({
      x: rng.int(room.x + margin, room.x + room.w - margin),
      y: rng.int(room.y + margin, room.y + room.h - margin),
    });
    if (kind === 'colonnade') {
      // A line of columns down the middle of the room's long axis, every other cell.
      const alongX = room.w >= room.h;
      const mid = alongX ? room.y + Math.floor(room.h / 2) : room.x + Math.floor(room.w / 2);
      const from = (alongX ? room.x : room.y) + 2;
      const to = (alongX ? room.x + room.w : room.y + room.h) - 3;
      for (let t = from; t <= to; t += 2) place([alongX ? { x: t, y: mid } : { x: mid, y: t }], Cell.Pillar);
      continue;
    }
    const count = rng.int(1, 4);
    let placed = 0;
    for (let attempt = 0; attempt < 16 && placed < count; attempt++) {
      const at = randomIn(2);
      const cells: Point[] = [];
      if (kind === 'partitions') {
        const len = rng.int(2, 6);
        const horizontal = rng.chance(0.5);
        for (let k = 0; k < len; k++) cells.push(horizontal ? { x: at.x + k, y: at.y } : { x: at.x, y: at.y + k });
      } else {
        const w = rng.int(2, 4);
        const h = rng.int(2, 3);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push({ x: at.x + x, y: at.y + y });
      }
      if (place(cells, Cell.Wall)) placed++;
    }
  }
}

/**
 * Level 0 is "randomly segmented rooms, hallways": long walls between two rooms get extra openings
 * along their length, so a wall reads as a row of segments rather than one partition with a door.
 * Openings are 1–2 cells, never at a wall's ends or right beside another opening, and only ever
 * remove wall between two rooms — connectivity can only grow.
 */
export function segmentWalls(grid: Grid, rng: Rng, o: GenOptions): void {
  if (o.segmentChance <= 0) return;
  for (const cells of separatorsByPair(grid).values()) {
    // Straight runs of the separator (it may bend where rooms meet at a corner).
    const horizontal = cells.every((c) => c.y === cells[0].y);
    const vertical = cells.every((c) => c.x === cells[0].x);
    if (!horizontal && !vertical) continue;
    const run = [...cells].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
    if (run.length < 5) continue;
    const isOpen = (i: number) => i >= 0 && i < run.length && getCell(grid, run[i].x, run[i].y) === Cell.Floor;
    for (let i = 1; i < run.length - 1; i++) {
      if (!rng.chance(o.segmentChance / 5)) continue;
      const width = rng.chance(0.4) ? 2 : 1;
      if (i + width > run.length - 1) continue;
      let clear = true;
      for (let k = i - 1; k <= i + width; k++) if (isOpen(k)) clear = false;
      if (!clear) continue;
      for (let k = i; k < i + width; k++) setCell(grid, run[k].x, run[k].y, Cell.Floor);
      i += width + 2;
    }
  }
}
