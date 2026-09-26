import { Cell, CELL_SIZE, type Grid, getCell } from './grid';
import { type Rect, solidRects } from './solids';

/**
 * One exposed vertical face of a wall slab or column, full wall height.
 * (x0, z0) → (x1, z1) is its bottom edge, running left to right as seen from in front, so the
 * quad x0-bottom, x1-bottom, x1-top, x0-top is counter-clockwise (front-facing).
 * u is world-space metres along the wall — continuous across cells, so wallpaper never seams.
 */
export interface WallQuad {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  nx: number;
  nz: number;
  u0: number;
  u1: number;
}

const EPS = 1e-6;

/** Removes [a, b) from each interval. */
function subtract(spans: [number, number][], a: number, b: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [s, e] of spans) {
    if (b <= s + EPS || a >= e - EPS) {
      out.push([s, e]);
      continue;
    }
    if (a > s + EPS) out.push([s, a]);
    if (b < e - EPS) out.push([b, e]);
  }
  return out;
}

interface Face {
  /** Axis the face is perpendicular to: 'x' → the face lies in a plane x = c. */
  axis: 'x' | 'z';
  c: number;
  sign: 1 | -1;
  lo: number;
  hi: number;
}

/**
 * Exposed vertical faces of every wall slab and column in chunk (cx, cy) (`size` cells square).
 * Portions of a face pressed flush against (or inside) another solid — the joints along a straight
 * wall, junctions of L/T walls — are cut away; touching collinear pieces are merged into one quad.
 */
export function wallQuads(grid: Grid, cx: number, cy: number, size: number): WallQuad[] {
  const x0 = cx * size;
  const y0 = cy * size;
  const x1 = Math.min(x0 + size, grid.width);
  const y1 = Math.min(y0 + size, grid.height);

  // Neighbours one cell beyond the chunk can bury faces of the chunk's own solids.
  const near: Rect[] = [];
  for (let y = y0 - 1; y <= y1; y++) for (let x = x0 - 1; x <= x1; x++) near.push(...solidRects(grid, x, y));

  const faces: Face[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      for (const r of solidRects(grid, x, y)) {
        const candidates: Face[] = [
          { axis: 'x', c: r.maxX, sign: 1, lo: r.minZ, hi: r.maxZ },
          { axis: 'x', c: r.minX, sign: -1, lo: r.minZ, hi: r.maxZ },
          { axis: 'z', c: r.maxZ, sign: 1, lo: r.minX, hi: r.maxX },
          { axis: 'z', c: r.minZ, sign: -1, lo: r.minX, hi: r.maxX },
        ];
        for (const f of candidates) {
          const probe = f.c + f.sign * EPS * 10; // just in front of the face
          // Faces looking out of the map can never be seen.
          const out = f.axis === 'x' ? probe < 0 || probe > grid.width * CELL_SIZE : probe < 0 || probe > grid.height * CELL_SIZE;
          if (out) continue;
          let spans: [number, number][] = [[f.lo, f.hi]];
          for (const o of near) {
            if (o === r) continue;
            const [pMin, pMax, sMin, sMax] = f.axis === 'x' ? [o.minX, o.maxX, o.minZ, o.maxZ] : [o.minZ, o.maxZ, o.minX, o.maxX];
            if (probe > pMin && probe < pMax) spans = subtract(spans, sMin, sMax);
            if (spans.length === 0) break;
          }
          for (const [lo, hi] of spans) if (hi - lo > EPS) faces.push({ ...f, lo, hi });
        }
      }
    }
  }
  return merge(faces).map(toQuad);
}

/** Joins touching collinear faces (same plane, same side) into single long faces. */
function merge(faces: Face[]): Face[] {
  const key = (f: Face) => `${f.axis}${f.sign}${f.c.toFixed(4)}`;
  const groups = new Map<string, Face[]>();
  for (const f of faces) {
    const k = key(f);
    const list = groups.get(k);
    if (list) list.push(f);
    else groups.set(k, [f]);
  }
  const out: Face[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.lo - b.lo);
    let cur = { ...list[0] };
    for (const f of list.slice(1)) {
      if (f.lo <= cur.hi + EPS) cur.hi = Math.max(cur.hi, f.hi);
      else {
        out.push(cur);
        cur = { ...f };
      }
    }
    out.push(cur);
  }
  return out;
}

function toQuad(f: Face): WallQuad {
  const nx = f.axis === 'x' ? f.sign : 0;
  const nz = f.axis === 'z' ? f.sign : 0;
  // Right-hand direction of a viewer facing the wall (looking along −n) is (nz, −nx).
  const rx = nz;
  const rz = -nx;
  const a = f.axis === 'x' ? { x: f.c, z: f.lo } : { x: f.lo, z: f.c };
  const b = f.axis === 'x' ? { x: f.c, z: f.hi } : { x: f.hi, z: f.c };
  const [p, q] = (b.x - a.x) * rx + (b.z - a.z) * rz > 0 ? [a, b] : [b, a];
  return { x0: p.x, z0: p.z, x1: q.x, z1: q.z, nx: nx + 0, nz: nz + 0, u0: p.x * rx + p.z * rz, u1: q.x * rx + q.z * rz };
}

/** A wall outlet: a point on a wall face (bottom edge, world metres) and the face's outward normal. */
export interface OutletSpot {
  quad: WallQuad;
  x: number;
  z: number;
  nx: number;
  nz: number;
}

/** Metres of wall per outlet on average ("scattered electrical outlets", as in the original photo). */
const OUTLET_EVERY = 4;

function hash01(a: number, b: number): number {
  let h = Math.imul(Math.round(a * 100), 374761393) ^ Math.imul(Math.round(b * 100), 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Evenly scattered spots along wall faces: about one per `every` metres of wall, only on faces at
 * least 1.2 m long, never within 15 % of a face's ends. Deterministic from the faces' positions;
 * `salt` keeps different fixtures from landing on the same spots.
 */
export function spotsAlong(quads: readonly WallQuad[], every: number, salt = 0): OutletSpot[] {
  const spots: OutletSpot[] = [];
  for (const q of quads) {
    const len = Math.hypot(q.x1 - q.x0, q.z1 - q.z0);
    if (len < 1.2) continue;
    const r = hash01(q.x0 + q.x1 + salt, q.z0 + q.z1 - salt);
    const expected = len / every;
    const n = Math.floor(expected) + (r < expected - Math.floor(expected) ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const jitter = (hash01(q.x0 + k * 7.3 + salt, q.z1 - k * 3.1) - 0.5) * (0.5 / n);
      const t = Math.min(0.85, Math.max(0.15, (k + 0.5) / n + jitter));
      spots.push({ quad: q, x: q.x0 + (q.x1 - q.x0) * t, z: q.z0 + (q.z1 - q.z0) * t, nx: q.nx, nz: q.nz });
    }
  }
  return spots;
}

/** Where electrical outlets sit ("scattered electrical outlets", as in the original photo). */
export function outletSpots(quads: readonly WallQuad[]): OutletSpot[] {
  return spotsAlong(quads, OUTLET_EVERY);
}

export type Paper = 'chevron' | 'dots' | 'stained';

/** How a wall face is dressed. */
export interface FaceStyle {
  paper: Paper;
  /** The low brown bumper rail. */
  rail: boolean;
}

/**
 * Wallpaper and rail for a face, decided per hall — the way a real room is decorated: every face
 * looking into one hall (its walls and its columns, across merged rooms) shares one paper, and the rail runs round the
 * whole room or not at all. Columns and short wall ends never carry a rail. Faces looking into a
 * doorway or corridor with no room id fall back to their wall line.
 */
export function faceStyle(grid: Grid, q: WallQuad): FaceStyle {
  const mx = (q.x0 + q.x1) / 2;
  const mz = (q.z0 + q.z1) / 2;
  const len = Math.hypot(q.x1 - q.x0, q.z1 - q.z0);
  let key = -1;
  for (const d of [1.2, 2.2, 3.2]) {
    const cx = Math.floor((mx + q.nx * d) / 2);
    const cz = Math.floor((mz + q.nz * d) / 2);
    if (cx < 0 || cz < 0 || cx >= grid.width || cz >= grid.height) break;
    // The hall (merged rooms share one), falling back to the room for grids without halls.
    const zone = grid.zone[cz * grid.width + cx];
    const room = zone >= 0 ? zone : grid.room[cz * grid.width + cx];
    if (room >= 0) {
      key = room;
      break;
    }
  }
  const [a, b] = key >= 0 ? [key, 17] : [Math.round((q.nz !== 0 ? mz : mx) * 20), 3 + q.nz * 2 + q.nx];
  const r = hash01(a, b + 911);
  const paper: Paper = r < 0.08 ? 'stained' : r < 0.38 ? 'dots' : 'chevron';
  const behind = getCell(grid, Math.floor((mx - q.nx * 0.05) / 2), Math.floor((mz - q.nz * 0.05) / 2));
  const rail = behind !== Cell.Pillar && len >= 0.5 && hash01(a, b + 313) < 0.45;
  return { paper, rail };
}
