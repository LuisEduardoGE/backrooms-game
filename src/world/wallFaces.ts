import { Cell, type Grid, getCell } from './grid';
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

/** Faces of wall cells enclosed on all four sides can never be seen. */
function hidden(grid: Grid, x: number, y: number): boolean {
  return (
    getCell(grid, x, y) === Cell.Wall &&
    getCell(grid, x + 1, y) === Cell.Wall &&
    getCell(grid, x - 1, y) === Cell.Wall &&
    getCell(grid, x, y + 1) === Cell.Wall &&
    getCell(grid, x, y - 1) === Cell.Wall
  );
}

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
      if (hidden(grid, x, y)) continue;
      for (const r of solidRects(grid, x, y)) {
        const candidates: Face[] = [
          { axis: 'x', c: r.maxX, sign: 1, lo: r.minZ, hi: r.maxZ },
          { axis: 'x', c: r.minX, sign: -1, lo: r.minZ, hi: r.maxZ },
          { axis: 'z', c: r.maxZ, sign: 1, lo: r.minX, hi: r.maxX },
          { axis: 'z', c: r.minZ, sign: -1, lo: r.minX, hi: r.maxX },
        ];
        for (const f of candidates) {
          const probe = f.c + f.sign * EPS * 10; // just in front of the face
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
