import type { Level, Room } from './generator';
import { Cell, CELL_SIZE, cellToWorld, type Dir, DIR_STEP, DIRS, type Grid, getCell } from './grid';
import { hasFullFace, type Rect, WALL_FACE_DISTANCE } from './solids';

/** The props (CC0 Poly Haven models, see propModels.ts). */
export type PropKind =
  | 'desk'
  | 'schoolDesk'
  | 'schoolChair'
  | 'monobloc'
  | 'armchair'
  | 'wetFloor'
  | 'ladder'
  | 'box'
  | 'crate'
  | 'shelves'
  | 'sofa'
  | 'tv';

export type Theme = 'office' | 'chairPile' | 'storage' | 'maintenance' | 'household';

export interface PropPlacement {
  kind: PropKind;
  theme: Theme;
  room: number;
  /**
   * The floor cell the prop belongs to. A prop against a wall stands in front of the wall slab,
   * which is in the open half of the wall's own cell, so its (x, z) can lie outside this cell.
   */
  cell: { x: number; y: number };
  x: number;
  /** Height of the prop's base (stacked boxes, a TV on a desk). */
  y: number;
  z: number;
  /** Facing (radians about +Y); 0 faces +Z. */
  yaw: number;
  /** Knocked over: rotation about the prop's own X axis. */
  tilt: number;
  /** What the player bumps into (null for small or leaning things you can brush past). */
  collide: Rect | null;
}

/** Footprints (metres, measured from the loaded models): width along the wall × depth out from it. */
const SIZE: Record<PropKind, [number, number]> = {
  desk: [2.0, 0.95],
  schoolDesk: [0.71, 0.55],
  schoolChair: [0.57, 0.68],
  monobloc: [0.64, 0.63],
  armchair: [0.82, 0.99],
  wetFloor: [0.3, 0.36],
  ladder: [0.96, 0.5],
  box: [0.39, 0.52],
  crate: [0.3, 0.41],
  shelves: [0.92, 0.42],
  sofa: [1.57, 0.66],
  tv: [0.4, 0.35],
};
/** Heights (measured), for stacking. */
const HEIGHT: Partial<Record<PropKind, number>> = { box: 0.34, crate: 0.26, schoolDesk: 0.72, desk: 0.79 };

const THEMES: readonly [Theme | null, number][] = [
  [null, 0.4],
  ['office', 0.17],
  ['storage', 0.15],
  ['chairPile', 0.1],
  ['maintenance', 0.1],
  ['household', 0.08],
];

function hash(a: number, b: number, salt: number): number {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A tiny deterministic stream for one room. */
function stream(seed: number, room: number) {
  let n = 0;
  const next = () => hash(seed, room, 1000 + n++);
  return { next, pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)], range: (a: number, b: number) => a + (b - a) * next() };
}

const FACING: Record<Dir, number> = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 };

function rectAround(x: number, z: number, w: number, d: number, alongX: boolean): Rect {
  const hw = (alongX ? w : d) / 2;
  const hd = (alongX ? d : w) / 2;
  return { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd };
}

/**
 * Gives some rooms a purpose — an abandoned office, a heap of chairs, a storeroom, a maintenance
 * spot, a lounge set down in the wrong place — and leaves the rest bare ("out-of-place furniture",
 * Level 0 canon). Props stand in their own room, keep off `reserved` cells (start, exit, items,
 * the clue path) and off any cell touching a doorway or another room, sit against walls or in a
 * cluster with free floor all round, so they never cut a path. Deterministic from the level.
 */
export function furnishRooms(level: Level, reserved: ReadonlySet<number>): PropPlacement[] {
  const { grid } = level;
  const out: PropPlacement[] = [];
  for (const room of level.rooms) {
    if (room.w < 3 || room.h < 3) continue;
    const rnd = stream(level.seed, room.id);
    let r = rnd.next();
    let theme: Theme | null = null;
    for (const [t, p] of THEMES) {
      if (r < p) {
        theme = t;
        break;
      }
      r -= p;
    }
    if (!theme) continue;
    const place = new Placer(grid, room, reserved, rnd, theme, out);
    FURNISH[theme](place);
  }
  return out;
}

class Placer {
  private used = new Set<number>();
  constructor(
    private grid: Grid,
    private room: Room,
    private reserved: ReadonlySet<number>,
    private rnd: ReturnType<typeof stream>,
    private theme: Theme,
    private out: PropPlacement[],
  ) {}

  get random() {
    return this.rnd;
  }

  /** A cell of this room with this room's floor all around it (8-way) and nothing placed yet. */
  private clear(x: number, y: number): boolean {
    const g = this.grid;
    const i = y * g.width + x;
    if (getCell(g, x, y) !== Cell.Floor || g.room[i] !== this.room.id || this.reserved.has(i) || this.used.has(i)) return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        const c = getCell(g, nx, ny);
        if (c === Cell.Floor && g.room[ny * g.width + nx] !== this.room.id) return false; // doorway / next room
      }
    }
    return true;
  }

  /** Cells against a full wall face, with the direction of that wall. */
  private wallSpots(): { x: number; y: number; dir: Dir }[] {
    const spots: { x: number; y: number; dir: Dir }[] = [];
    const { x: rx, y: ry, w, h } = this.room;
    for (let y = ry; y < ry + h; y++) {
      for (let x = rx; x < rx + w; x++) {
        if (!this.clear(x, y)) continue;
        for (const dir of DIRS) if (hasFullFace(this.grid, x, y, dir)) spots.push({ x, y, dir });
      }
    }
    return spots;
  }

  private anchor = { x: 0, y: 0 };

  private add(kind: PropKind, x: number, z: number, yaw: number, collide: Rect | null, y = 0, tilt = 0): void {
    this.out.push({ kind, theme: this.theme, room: this.room.id, cell: { ...this.anchor }, x, y, z, yaw, tilt, collide });
  }

  private mark(x: number, y: number): void {
    this.used.add(y * this.grid.width + x);
  }

  /**
   * Stands `kind` against a free wall; returns where (wall direction and the prop's centre), or null.
   * `extra` props may be set in front of it (e.g. a chair at a desk) by the caller.
   */
  againstWall(kind: PropKind, collides = true): { x: number; z: number; dir: Dir } | null {
    const spots = this.wallSpots();
    if (spots.length === 0) return null;
    const s = this.rnd.pick(spots);
    const [w, d] = SIZE[kind];
    const step = DIR_STEP[s.dir];
    const off = WALL_FACE_DISTANCE - d / 2 - 0.03;
    const x = cellToWorld(s.x) + step.x * off;
    const z = cellToWorld(s.y) + step.y * off;
    const alongX = s.dir === 'N' || s.dir === 'S';
    this.anchor = { x: s.x, y: s.y };
    this.add(kind, x, z, FACING[s.dir], collides ? rectAround(x, z, w, d, alongX) : null);
    this.mark(s.x, s.y);
    return { x, z, dir: s.dir };
  }

  /** Stacks `kind` on top of a prop already standing at (x, z). */
  stack(kind: PropKind, x: number, z: number, onTopOf: PropKind, yaw: number): void {
    this.add(kind, x, z, yaw, null, HEIGHT[onTopOf] ?? 0.4);
  }

  /** A prop out in the room, `dist` metres from a wall prop, facing it (skipped if that spot isn't clear). */
  inFront(kind: PropKind, at: { x: number; z: number; dir: Dir }, dist: number, facingWall: boolean, collides = true): void {
    const step = DIR_STEP[at.dir];
    const x = at.x - step.x * dist;
    const z = at.z - step.y * dist;
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    const sameCell = cx === Math.floor(at.x / CELL_SIZE) && cz === Math.floor(at.z / CELL_SIZE);
    if (!sameCell && !this.clear(cx, cz)) return;
    if (!sameCell) {
      this.mark(cx, cz);
      this.anchor = { x: cx, y: cz };
    }
    const [w, d] = SIZE[kind];
    const yaw = FACING[at.dir] + (facingWall ? Math.PI : 0);
    this.add(kind, x, z, yaw, collides ? rectAround(x, z, w, d, at.dir === 'N' || at.dir === 'S') : null);
  }

  /** A cell with clear floor two cells around it (room to walk round a cluster), or null. */
  openCentre(): { x: number; y: number } | null {
    const { x: rx, y: ry, w, h } = this.room;
    const cells: { x: number; y: number }[] = [];
    for (let y = ry + 1; y < ry + h - 1; y++) {
      for (let x = rx + 1; x < rx + w - 1; x++) {
        let ok = true;
        for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) if (!this.clear(x + dx, y + dy)) ok = false;
        if (ok) cells.push({ x, y });
      }
    }
    return cells.length ? this.rnd.pick(cells) : null;
  }

  /** Scatters `n` props of `kinds` around a cell centre, some knocked over; one collider covers the heap. */
  cluster(at: { x: number; y: number }, kinds: readonly PropKind[], n: number, radius: number, tipChance: number, collides = true): void {
    const cx = cellToWorld(at.x);
    const cz = cellToWorld(at.y);
    this.anchor = { x: at.x, y: at.y };
    for (let i = 0; i < n; i++) {
      const a = this.rnd.range(0, Math.PI * 2);
      const r = Math.sqrt(this.rnd.next()) * radius;
      const kind = this.rnd.pick(kinds);
      const tipped = this.rnd.next() < tipChance;
      this.add(kind, cx + Math.cos(a) * r, cz + Math.sin(a) * r, this.rnd.range(0, Math.PI * 2), null, tipped ? 0.22 : 0, tipped ? Math.PI / 2 : 0);
    }
    if (collides) {
      // The heap's collider rides on its last prop; it fits inside the centre cell.
      const half = Math.min(radius + 0.25, CELL_SIZE / 2 - 0.05);
      this.out[this.out.length - 1].collide = { minX: cx - half, maxX: cx + half, minZ: cz - half, maxZ: cz + half };
    }
    this.mark(at.x, at.y);
  }
}

const FURNISH: Record<Theme, (p: Placer) => void> = {
  office(p) {
    const desks = p.random.next() < 0.5 ? 1 : 2;
    for (let i = 0; i < desks; i++) {
      const desk = p.againstWall(p.random.next() < 0.7 ? 'desk' : 'schoolDesk');
      if (!desk) break;
      if (p.random.next() < 0.8) p.inFront(p.random.pick(['schoolChair', 'monobloc'] as const), desk, 0.7, true);
    }
    if (p.random.next() < 0.5) p.againstWall('armchair');
  },
  chairPile(p) {
    const at = p.openCentre();
    if (at) p.cluster(at, ['monobloc', 'schoolChair', 'monobloc', 'armchair'], 5 + Math.floor(p.random.next() * 5), 0.75, 0.35);
  },
  storage(p) {
    const shelves = 1 + Math.floor(p.random.next() * 2);
    for (let i = 0; i < shelves; i++) p.againstWall('shelves');
    const stacks = 2 + Math.floor(p.random.next() * 3);
    for (let i = 0; i < stacks; i++) {
      const kind = p.random.next() < 0.7 ? 'box' : 'crate';
      const base = p.againstWall(kind);
      if (!base) break;
      const yaw = Math.round(p.random.range(-1, 1) * 10) / 40;
      if (p.random.next() < 0.6) p.stack(kind, base.x, base.z, kind, yaw);
    }
  },
  maintenance(p) {
    p.againstWall('ladder');
    const signs = 1 + Math.floor(p.random.next() * 2);
    for (let i = 0; i < signs; i++) {
      const at = p.openCentre();
      if (!at) break;
      p.cluster(at, ['wetFloor'], 1, 0.05, 0);
    }
    if (p.random.next() < 0.6) p.againstWall('box');
  },
  household(p) {
    const sofa = p.againstWall('sofa');
    if (sofa) p.inFront('tv', sofa, 2.2, true);
    else p.againstWall('armchair');
  },
};
