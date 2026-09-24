import { Cell, CELL_SIZE, type Grid, getCell, PILLAR_SIZE, worldToCell } from '../world/grid';

const SAMPLE_STEP = 0.2;
const PILLAR_INSET = (CELL_SIZE - PILLAR_SIZE) / 2;

function blocksAt(grid: Grid, x: number, z: number): boolean {
  const cx = worldToCell(x);
  const cy = worldToCell(z);
  const c = getCell(grid, cx, cy);
  if (c === Cell.Wall) return true;
  if (c !== Cell.Pillar) return false;
  const lx = x - cx * CELL_SIZE;
  const lz = z - cy * CELL_SIZE;
  return lx > PILLAR_INSET && lx < CELL_SIZE - PILLAR_INSET && lz > PILLAR_INSET && lz < CELL_SIZE - PILLAR_INSET;
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
