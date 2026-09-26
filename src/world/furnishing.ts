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

/** `stray`: one or two lone objects left in an otherwise empty room (out-of-place, Level 0 canon). */
export type Theme = 'office' | 'chairPile' | 'storage' | 'maintenance' | 'household' | 'stray';

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
export const footprintSize = (kind: PropKind): [number, number] => SIZE[kind];
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
  [null, 0.32],
  ['office', 0.15],
  ['stray', 0.15],
  ['storage', 0.13],
  ['maintenance', 0.1],
  ['chairPile', 0.08],
  ['household', 0.07],
];
/** Closest two upright pieces of a heap may stand (metres). */
const MIN_APART = 0.5;
/** How far (radians) a prop against a wall may sit askew — nothing in an abandoned office is square. */
const ASKEW = 0.14;

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

/** A prop's footprint on the floor as 4 corners (rotated by its yaw, as the model is drawn). */
function footprint(x: number, z: number, w: number, d: number, yaw: number): number[][] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => [x + u * c + v * s, z - u * s + v * c]);
}

/** Separating-axis test for two convex quads (touching within 1 cm counts as apart). */
function quadsOverlap(a: number[][], b: number[][]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = poly[i];
      const [x2, z2] = poly[(i + 1) % 4];
      const nx = z2 - z1;
      const nz = x1 - x2;
      const pa = a.map(([x, z]) => x * nx + z * nz);
      const pb = b.map(([x, z]) => x * nx + z * nz);
      if (Math.max(...pa) < Math.min(...pb) + 0.01 || Math.max(...pb) < Math.min(...pa) + 0.01) return false;
    }
  }
  return true;
}

/** The axis-aligned box around a footprint: the prop's collider. */
function boundsOf(poly: number[][]): Rect {
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
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
  /** Footprints of everything standing on this room's floor, so nothing is placed into another piece. */
  private placed: number[][][] = [];

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
  againstWall(kind: PropKind, collides = true): { x: number; z: number; dir: Dir; kind: PropKind } | null {
    const spots = this.wallSpots();
    const [w, d] = SIZE[kind];
    // A few tries: a big piece (a 2 m desk) may not fit beside what is already on that wall.
    for (let attempt = 0; attempt < 12 && spots.length > 0; attempt++) {
      const s = this.rnd.pick(spots);
      const step = DIR_STEP[s.dir];
      // Askew, and pulled out from the wall just enough that its turned corners clear it.
      const yaw = FACING[s.dir] + this.rnd.range(-ASKEW, ASKEW);
      const turn = Math.abs(Math.sin(yaw - FACING[s.dir]));
      const off = WALL_FACE_DISTANCE - d / 2 - 0.03 - (w / 2) * turn;
      const x = cellToWorld(s.x) + step.x * off;
      const z = cellToWorld(s.y) + step.y * off;
      const poly = footprint(x, z, w, d, yaw);
      if (this.placed.some((q) => quadsOverlap(poly, q))) continue;
      this.placed.push(poly);
      this.anchor = { x: s.x, y: s.y };
      this.add(kind, x, z, yaw, collides ? boundsOf(poly) : null);
      this.mark(s.x, s.y);
      return { x, z, dir: s.dir, kind };
    }
    return null;
  }

  /** Stacks `kind` on top of a prop already standing at (x, z). */
  stack(kind: PropKind, x: number, z: number, onTopOf: PropKind, yaw: number): void {
    this.add(kind, x, z, yaw, null, HEIGHT[onTopOf] ?? 0.4);
  }

  /**
   * A prop out in the room in front of a wall prop, `gap` metres clear of it, facing it — skipped
   * if that spot isn't clear or it would overlap something.
   */
  inFront(kind: PropKind, at: { x: number; z: number; dir: Dir; kind: PropKind }, gap: number, facingWall: boolean, collides = true): void {
    const [w, d] = SIZE[kind];
    // Clear of the wall prop's front whichever way this one ends up turned.
    const dist = SIZE[at.kind][1] / 2 + Math.hypot(w, d) / 2 + gap;
    const step = DIR_STEP[at.dir];
    const x = at.x - step.x * dist;
    const z = at.z - step.y * dist;
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    const sameCell = cx === Math.floor(at.x / CELL_SIZE) && cz === Math.floor(at.z / CELL_SIZE);
    if (!sameCell && !this.clear(cx, cz)) return;
    // Pushed out and turned as whoever used it left it.
    const yaw = FACING[at.dir] + (facingWall ? Math.PI : 0) + this.rnd.range(-0.7, 0.7);
    const poly = footprint(x, z, w, d, yaw);
    if (this.placed.some((q) => quadsOverlap(poly, q))) return;
    if (!sameCell) {
      this.mark(cx, cz);
      this.anchor = { x: cx, y: cz };
    }
    this.placed.push(poly);
    this.add(kind, x, z, yaw, collides ? boundsOf(poly) : null);
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
    // Upright pieces keep MIN_APART from each other (a pile, not chairs passing through each other);
    // knocked-over ones may tangle. A piece that finds no room after a few tries is left out.
    const upright: { x: number; z: number }[] = [];
    const before = this.out.length;
    for (let i = 0; i < n; i++) {
      const kind = this.rnd.pick(kinds);
      const tipped = this.rnd.next() < tipChance;
      for (let attempt = 0; attempt < 10; attempt++) {
        const a = this.rnd.range(0, Math.PI * 2);
        const r = Math.sqrt(this.rnd.next()) * radius;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        if (!tipped && upright.some((u) => Math.hypot(u.x - x, u.z - z) < MIN_APART)) continue;
        if (!tipped) upright.push({ x, z });
        this.add(kind, x, z, this.rnd.range(0, Math.PI * 2), null, 0, tipped ? Math.PI / 2 : 0);
        break;
      }
    }
    if (this.out.length > before) {
      const half = Math.min(radius + 0.25, CELL_SIZE / 2 - 0.05);
      this.placed.push(footprint(cx, cz, half * 2, half * 2, 0));
    }
    if (collides && this.out.length > before) {
      // The heap's collider rides on its last prop; it fits inside the centre cell.
      const half = Math.min(radius + 0.25, CELL_SIZE / 2 - 0.05);
      this.out[this.out.length - 1].collide = { minX: cx - half, maxX: cx + half, minZ: cz - half, maxZ: cz + half };
    }
    this.mark(at.x, at.y);
  }
}

/** A random count in [lo, hi]. */
const between = (p: Placer, lo: number, hi: number) => lo + Math.floor(p.random.next() * (hi - lo + 1));
const chance = (p: Placer, c: number) => p.random.next() < c;

/**
 * Each theme is a loose recipe, not a fixed arrangement: counts, which pieces appear and where
 * they end up are all random, so two offices (or two storerooms) never hold the same set.
 */
const FURNISH: Record<Theme, (p: Placer) => void> = {
  office(p) {
    for (let i = between(p, 1, 3); i > 0; i--) {
      const kind = chance(p, 0.65) ? 'desk' : 'schoolDesk';
      const desk = p.againstWall(kind);
      if (!desk) break;
      // Whatever was left on the desk.
      if (chance(p, 0.25)) p.stack('tv', desk.x, desk.z, kind, p.random.range(-0.5, 0.5));
      else if (chance(p, 0.3)) p.stack('box', desk.x, desk.z, kind, p.random.range(-0.6, 0.6));
      if (chance(p, 0.6)) p.inFront(p.random.pick(['schoolChair', 'monobloc', 'schoolChair'] as const), desk, p.random.range(0.02, 0.45), true);
    }
    // Chairs left wherever.
    for (let i = between(p, 0, 2); i > 0; i--) {
      const at = p.openCentre();
      if (!at) break;
      p.cluster(at, [p.random.pick(['schoolChair', 'monobloc'] as const)], 1, 0.3, chance(p, 0.25) ? 1 : 0);
    }
    if (chance(p, 0.3)) p.againstWall('armchair');
    if (chance(p, 0.3)) p.againstWall(chance(p, 0.5) ? 'box' : 'crate');
    if (chance(p, 0.25)) p.againstWall('shelves');
  },
  chairPile(p) {
    const at = p.openCentre();
    if (at) p.cluster(at, ['monobloc', 'schoolChair', 'monobloc', 'armchair'], between(p, 4, 10), p.random.range(0.5, 0.8), p.random.range(0.2, 0.5));
    if (chance(p, 0.4)) p.againstWall(p.random.pick(['monobloc', 'schoolChair'] as const));
  },
  storage(p) {
    for (let i = between(p, 0, 2); i > 0; i--) p.againstWall('shelves');
    for (let i = between(p, 1, 5); i > 0; i--) {
      const kind = chance(p, 0.65) ? 'box' : 'crate';
      const base = p.againstWall(kind);
      if (!base) break;
      if (chance(p, 0.55)) p.stack(kind, base.x, base.z, kind, p.random.range(-0.4, 0.4));
    }
    if (chance(p, 0.25)) p.againstWall('ladder');
  },
  maintenance(p) {
    for (let i = between(p, 0, 2); i > 0; i--) p.againstWall('ladder');
    for (let i = between(p, 1, 4); i > 0; i--) {
      const at = p.openCentre();
      if (!at) break;
      p.cluster(at, ['wetFloor'], 1, 0.05, 0);
    }
    for (let i = between(p, 0, 3); i > 0; i--) {
      const kind = chance(p, 0.5) ? 'box' : 'crate';
      const base = p.againstWall(kind);
      if (base && chance(p, 0.4)) p.stack(kind, base.x, base.z, kind, p.random.range(-0.4, 0.4));
    }
    if (chance(p, 0.3)) p.againstWall('shelves');
    if (chance(p, 0.3)) p.againstWall(p.random.pick(['monobloc', 'schoolChair'] as const));
  },
  household(p) {
    const seat = p.againstWall(chance(p, 0.6) ? 'sofa' : 'armchair');
    if (seat && chance(p, 0.5)) p.inFront('tv', seat, p.random.range(0.9, 1.9), true);
    else if (chance(p, 0.5)) {
      // The TV propped on whatever was to hand.
      const stand = chance(p, 0.5) ? 'crate' : 'box';
      const base = p.againstWall(stand);
      if (base) p.stack('tv', base.x, base.z, stand, p.random.range(-0.5, 0.5));
    }
    for (let i = between(p, 0, 2); i > 0; i--) p.againstWall(p.random.pick(['armchair', 'monobloc', 'schoolChair', 'sofa'] as const));
    if (chance(p, 0.3)) p.againstWall('shelves');
    if (chance(p, 0.3)) {
      const at = p.openCentre();
      if (at) p.cluster(at, [p.random.pick(['monobloc', 'schoolChair', 'box'] as const)], 1, 0.3, chance(p, 0.3) ? 1 : 0);
    }
  },
  stray(p) {
    for (let i = between(p, 1, 2); i > 0; i--) {
      const at = p.openCentre();
      if (!at) break;
      const kind = p.random.pick(['schoolChair', 'monobloc', 'box', 'crate', 'wetFloor', 'armchair', 'tv', 'monobloc'] as const);
      p.cluster(at, [kind], 1, 0.15, chance(p, 0.2) ? 1 : 0);
    }
  },
};
