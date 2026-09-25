import { CELL_SIZE, type Grid, worldToCell } from '../world/grid';
import { type Rect, solidRects } from '../world/solids';

/** Per-cell baked light, 0..1 (see bake.ts createLightField). */
export type LightField = (x: number, y: number) => number;

/**
 * Baked light at a world point: bilinear between the four nearest cell centres, so shading
 * never steps at a cell border.
 */
export function lightAt(light: LightField, wx: number, wz: number): number {
  const gx = wx / CELL_SIZE - 0.5;
  const gz = wz / CELL_SIZE - 0.5;
  const x = Math.floor(gx);
  const z = Math.floor(gz);
  const fx = gx - x;
  const fz = gz - z;
  const top = light(x, z) * (1 - fx) + light(x + 1, z) * fx;
  const bottom = light(x, z + 1) * (1 - fx) + light(x + 1, z + 1) * fx;
  return top * (1 - fz) + bottom * fz;
}

/** Contact shadow reaches this far (metres) from a wall or column. */
export const AO_RADIUS = 0.8;
/** Darkest a surface gets in a tight corner. */
export const AO_MIN = 0.5;
const RAYS = 16;
const DIRS = Array.from({ length: RAYS }, (_, i) => {
  const a = ((i + 0.5) / RAYS) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)] as const;
});

/** Distance along a ray to a box (slab method), or Infinity when it misses. */
function rayBox(ox: number, oz: number, dx: number, dz: number, r: Rect): number {
  let t0 = 0;
  let t1 = Infinity;
  for (const [o, d, lo, hi] of [
    [ox, dx, r.minX, r.maxX],
    [oz, dz, r.minZ, r.maxZ],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    let a = (lo - o) / d;
    let b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return Infinity;
  }
  return t0;
}

/**
 * Baked ambient occlusion on the floor plane, 0..1: rays fan out from the point and each one
 * that hits a wall or column within AO_RADIUS darkens it (the closer, the darker). Next to a
 * wall about half the rays hit; in a corner three quarters — so corners come out darker.
 */
export function contactShadow(grid: Grid, wx: number, wz: number): number {
  const cx = worldToCell(wx);
  const cz = worldToCell(wz);
  const rects: Rect[] = [];
  for (let y = cz - 1; y <= cz + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (const r of solidRects(grid, x, y)) {
        // Only solids within reach can occlude (most floor points are in the open: no rays at all).
        const dx = Math.max(r.minX - wx, 0, wx - r.maxX);
        const dz = Math.max(r.minZ - wz, 0, wz - r.maxZ);
        if (dx * dx + dz * dz < AO_RADIUS * AO_RADIUS) rects.push(r);
      }
    }
  }
  if (rects.length === 0) return 1;
  let occ = 0;
  for (const [dx, dz] of DIRS) {
    let t = Infinity;
    for (const r of rects) t = Math.min(t, rayBox(wx, wz, dx, dz, r));
    if (t < AO_RADIUS) occ += (1 - t / AO_RADIUS) ** 2;
  }
  // ×1.6 so a flat wall (≈ half the rays, weighted) already reads as a clear contact line.
  return Math.max(AO_MIN, 1 - (1 - AO_MIN) * (occ / RAYS) * 1.6);
}
