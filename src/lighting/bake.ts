import { cellToWorld, type Grid, isDark } from '../world/grid';
import { wallBetween } from '../world/solids';
import { isLightCell } from './lights';

/** Brightness of an unpowered area (a faint glow so it isn't pure black). */
export const AMBIENT_DARK = 0.12;
/** Panels this many cells away still contribute (falling off smoothly to zero). */
const REACH = 3.5;
/**
 * Summed panel weight that counts as full light: reached under a well-lit cluster (~75 % of cells
 * with panels), so the gaps between clusters stay noticeably dimmer.
 */
const FULL = 2.4;
/**
 * Baked fluorescent light at a cell, 0..1: bright in pools under clusters of powered panels, dim in
 * the gaps between them, fading toward dark zones and never passing through walls.
 */
/** Which cells carry a panel (injectable so tests can lay out their own). */
export type PanelLayout = (grid: Grid, x: number, y: number) => boolean;

export function cellLight(grid: Grid, x: number, y: number, panels: PanelLayout = isLightCell): number {
  const cx = cellToWorld(x);
  const cz = cellToWorld(y);
  const r = Math.ceil(REACH);
  let sum = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const lx = x + dx;
      const ly = y + dy;
      if (!panels(grid, lx, ly) || isDark(grid, lx, ly)) continue;
      const w = Math.max(0, 1 - Math.hypot(dx, dy) / REACH) ** 2;
      if (w <= 0) continue;
      if (wallBetween(grid, cx, cz, cellToWorld(lx), cellToWorld(ly))) continue;
      sum += w;
    }
  }
  return AMBIENT_DARK + (1 - AMBIENT_DARK) * Math.min(1, sum / FULL);
}

/** Memoised per-cell light for a level (cells are baked on first use, e.g. when a chunk builds). */
export function createLightField(grid: Grid, panels: PanelLayout = isLightCell) {
  const cache = new Float32Array(grid.width * grid.height).fill(-1);
  return (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return AMBIENT_DARK;
    const i = y * grid.width + x;
    if (cache[i] < 0) cache[i] = cellLight(grid, x, y, panels);
    return cache[i];
  };
}
