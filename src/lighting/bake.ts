import { cellToWorld, type Grid, isDark } from '../world/grid';
import { wallBetween } from '../world/solids';
import { isLightCell } from './lights';

/** Brightness of an unpowered area (a faint glow so it isn't pure black). */
export const AMBIENT_DARK = 0.12;
/** Panels this many cells away still contribute (falling off smoothly to zero). */
const REACH = 4.5;
/** The weakest summed panel contribution anywhere in a fully powered open area (panels every 2 cells). */
const FULL = 2.6;
/**
 * Baked fluorescent light at a cell, 0..1: even and bright wherever powered panels are overhead,
 * fading off toward dark zones and behind walls. Level 0's light is flat and everywhere — it does
 * not come from a few lamps around the player.
 */
export function cellLight(grid: Grid, x: number, y: number): number {
  const cx = cellToWorld(x);
  const cz = cellToWorld(y);
  const r = Math.ceil(REACH);
  let sum = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const lx = x + dx;
      const ly = y + dy;
      if (!isLightCell(grid, lx, ly) || isDark(grid, lx, ly)) continue;
      const w = Math.max(0, 1 - Math.hypot(dx, dy) / REACH) ** 2;
      if (w <= 0) continue;
      if (wallBetween(grid, cx, cz, cellToWorld(lx), cellToWorld(ly))) continue;
      sum += w;
    }
  }
  return AMBIENT_DARK + (1 - AMBIENT_DARK) * Math.min(1, sum / FULL);
}

/** Memoised per-cell light for a level (cells are baked on first use, e.g. when a chunk builds). */
export function createLightField(grid: Grid) {
  const cache = new Float32Array(grid.width * grid.height).fill(-1);
  return (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return AMBIENT_DARK;
    const i = y * grid.width + x;
    if (cache[i] < 0) cache[i] = cellLight(grid, x, y);
    return cache[i];
  };
}
