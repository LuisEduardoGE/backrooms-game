import { type Grid, worldToCell } from '../world/grid';
import { solidRects } from '../world/solids';

const SAMPLE_STEP = 0.2;

function blocksAt(grid: Grid, x: number, z: number): boolean {
  return solidRects(grid, worldToCell(x), worldToCell(z)).some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ);
}

/** True when nothing solid lies between two world points (sampled every 0.2 m). */
export function hasLineOfSight(grid: Grid, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / SAMPLE_STEP);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (blocksAt(grid, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}
