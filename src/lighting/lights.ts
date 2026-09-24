import { deriveSeed } from '../core/rng';
import { Cell, cellToWorld, type Grid, getCell, isDark, type Point, worldToCell } from '../world/grid';

/** A fluorescent ceiling panel hangs over every floor cell with even x and even y (one per 4 m). */
export function isLightCell(grid: Grid, x: number, y: number): boolean {
  return getCell(grid, x, y) === Cell.Floor && x % 2 === 0 && y % 2 === 0;
}

/** Lit ceiling lights nearest to a cell centre (ties by y then x). */
export function nearestLitLights(grid: Grid, cellX: number, cellY: number, count: number, radius = 8): Point[] {
  return nearestLitLightsAt(grid, cellToWorld(cellX), cellToWorld(cellY), count, radius);
}

/** Lit ceiling lights nearest to a world position in metres (exact distance, ties by y then x). */
export function nearestLitLightsAt(grid: Grid, x: number, z: number, count: number, radius = 8): Point[] {
  const cx = worldToCell(x);
  const cy = worldToCell(z);
  const found: Array<Point & { d: number }> = [];
  for (let ly = cy - radius; ly <= cy + radius; ly++) {
    for (let lx = cx - radius; lx <= cx + radius; lx++) {
      if (!isLightCell(grid, lx, ly) || isDark(grid, lx, ly)) continue;
      found.push({ x: lx, y: ly, d: (cellToWorld(lx) - x) ** 2 + (cellToWorld(ly) - z) ** 2 });
    }
  }
  found.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  return found.slice(0, count).map(({ x: px, y: py }) => ({ x: px, y: py }));
}

export const FAULTY_FRACTION = 0.1;
const U32 = 4294967296;
/**
 * Flicker decisions per second. Kept ≤ 5 so a dip-and-recover flash cycles below 3 Hz
 * (photosensitivity guidance flags 3–30 Hz flashing).
 */
export const FLICKER_RATE = 4;

/** Metres from the player where pooled light starts to fade, and where it reaches zero. */
const FALLOFF_FULL = 2;
const FALLOFF_ZERO = 5;

/**
 * Intensity weight for a pooled light at `distance` metres. It reaches 0 before a fixture drops out
 * of the nearest-6 set, so swapping pool lights never makes the room visibly jump.
 */
export function lightFalloff(distance: number): number {
  return Math.min(1, Math.max(0, (FALLOFF_ZERO - distance) / (FALLOFF_ZERO - FALLOFF_FULL)));
}

export function isFaultyLight(lightId: number, seed: number): boolean {
  return deriveSeed(seed, `faulty:${lightId}`) / U32 < FAULTY_FRACTION;
}

/** Brightness multiplier. Healthy lights hum in [0.96, 1]; faulty ones randomly dip to 0.15–0.5 a few times a second. */
export function flicker(timeSec: number, lightId: number, seed: number): number {
  const slot = Math.floor(timeSec * FLICKER_RATE);
  const r = deriveSeed(seed, `flicker:${lightId}:${slot}`) / U32;
  if (isFaultyLight(lightId, seed)) return r < 0.35 ? 0.15 + r : 1;
  return 0.96 + 0.04 * r;
}

/** Panel glow while the Howler's warning holds the lights down (matches the pooled lights' 35 %). */
const PANEL_DIM = 0.35;
/** Panel glow during a Presence blackout: nearly dead, a faint afterglow. */
const PANEL_BLACKOUT = 0.12;

/**
 * Multiplier for the ceiling panels' emissive glow, so they die with the pooled lights instead of
 * glowing over a darkened room. (Panels share one material, so this dims them all.)
 */
export function panelGlow(blackout: boolean, dim: boolean): number {
  if (blackout) return PANEL_BLACKOUT;
  return dim ? PANEL_DIM : 1;
}
