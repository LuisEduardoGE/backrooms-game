import { Cell, CELL_SIZE, cellToWorld, type Grid, getCell, worldToCell } from '../world/grid';
import { type Rect, rayBox, solidRects, wallBetween } from '../world/solids';

/** Per-cell baked light, 0..1 (see bake.ts createLightField). */
export type LightField = (x: number, y: number) => number;

/**
 * Baked light at a world point: bilinear between the four nearest cell centres, so shading never
 * steps at a cell border — but only over cells on the same side of any wall. Wall cells (whose
 * centre sits inside the slab and sees both rooms) and cells behind a slab are dropped and the
 * remaining weights renormalised, so light never bleeds through a wall into a dark room.
 */
export function lightAt(grid: Grid, light: LightField, wx: number, wz: number): number {
  const gx = wx / CELL_SIZE - 0.5;
  const gz = wz / CELL_SIZE - 0.5;
  const x = Math.floor(gx);
  const z = Math.floor(gz);
  const fx = gx - x;
  const fz = gz - z;
  let sum = 0;
  let weight = 0;
  for (let j = 0; j <= 1; j++) {
    for (let i = 0; i <= 1; i++) {
      const w = (i ? fx : 1 - fx) * (j ? fz : 1 - fz);
      if (w <= 0 || !visibleCell(grid, wx, wz, x + i, z + j)) continue;
      sum += w * light(x + i, z + j);
      weight += w;
    }
  }
  if (weight > 1e-6) return sum / weight;
  // Every corner is behind a wall (e.g. a nook): use the nearest visible open cell around.
  let best = Infinity;
  let value = light(worldToCell(wx), worldToCell(wz));
  for (let y = z - 1; y <= z + 2; y++) {
    for (let cx = x - 1; cx <= x + 2; cx++) {
      const d = (cellToWorld(cx) - wx) ** 2 + (cellToWorld(y) - wz) ** 2;
      if (d < best && visibleCell(grid, wx, wz, cx, y)) {
        best = d;
        value = light(cx, y);
      }
    }
  }
  return value;
}

function visibleCell(grid: Grid, wx: number, wz: number, cx: number, cz: number): boolean {
  return getCell(grid, cx, cz) !== Cell.Wall && !wallBetween(grid, wx, wz, cellToWorld(cx), cellToWorld(cz));
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
