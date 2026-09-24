import { deriveSeed } from '../core/rng';
import { Cell, type Grid, getCell, isDark, type Point } from '../world/grid';

/** A fluorescent ceiling panel hangs over every floor cell with even x and even y (one per 4 m). */
export function isLightCell(grid: Grid, x: number, y: number): boolean {
  return getCell(grid, x, y) === Cell.Floor && x % 2 === 0 && y % 2 === 0;
}

/** Lit ceiling lights nearest to a cell (squared distance, ties by y then x). */
export function nearestLitLights(grid: Grid, cellX: number, cellY: number, count: number, radius = 8): Point[] {
  const found: Array<Point & { d: number }> = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cellX + dx;
      const y = cellY + dy;
      if (!isLightCell(grid, x, y) || isDark(grid, x, y)) continue;
      found.push({ x, y, d: dx * dx + dy * dy });
    }
  }
  found.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  return found.slice(0, count).map(({ x, y }) => ({ x, y }));
}

export const FAULTY_FRACTION = 0.1;
const U32 = 4294967296;
/** Flicker decisions change 12 times per second. */
const FLICKER_RATE = 12;

export function isFaultyLight(lightId: number, seed: number): boolean {
  return deriveSeed(seed, `faulty:${lightId}`) / U32 < FAULTY_FRACTION;
}

/** Brightness multiplier. Healthy lights hum in [0.96, 1]; faulty ones randomly dip to 0.15–0.5. */
export function flicker(timeSec: number, lightId: number, seed: number): number {
  const slot = Math.floor(timeSec * FLICKER_RATE);
  const r = deriveSeed(seed, `flicker:${lightId}:${slot}`) / U32;
  if (isFaultyLight(lightId, seed)) return r < 0.35 ? 0.15 + r : 1;
  return 0.96 + 0.04 * r;
}
