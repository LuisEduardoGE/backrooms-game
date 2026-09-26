import { isLightCell } from '../lighting/lights';
import { Cell, CELL_SIZE, type Grid, getCell, isDark } from './grid';
import { type OutletSpot, spotsAlong, type WallQuad } from './wallFaces';

/** Ceiling tile edge (metres): 3 tiles per cell, matching the ceiling texture and T-bar grid. */
export const TILE = CELL_SIZE / 3;

export type CeilingKind = 'stain' | 'missing' | 'hanging' | 'vent';

/** One dressed ceiling tile; (x, z) is the tile's centre in world metres. */
export interface CeilingItem {
  kind: CeilingKind;
  x: number;
  z: number;
  /** 0..1, for per-item variation (stain size, which edge a tile hangs from). */
  seed: number;
}

function hash(a: number, b: number, salt: number): number {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Share of ceiling tiles per kind (doubled in unpowered zones, where the building is decaying). */
const CEILING_ODDS: readonly [CeilingKind, number][] = [
  ['stain', 0.014],
  ['vent', 0.008],
  ['missing', 0.006],
  ['hanging', 0.003],
];

/**
 * Ceiling damage and fixtures for chunk (cx, cy): water-stained tiles, missing tiles (black void
 * above), a tile hanging askew, and air-vent grilles. Only over open floor, never on the tile a
 * light panel occupies. Deterministic from tile coordinates.
 */
export function ceilingDressing(grid: Grid, cx: number, cy: number, size: number): CeilingItem[] {
  const out: CeilingItem[] = [];
  const x0 = cx * size;
  const y0 = cy * size;
  for (let y = y0; y < Math.min(y0 + size, grid.height); y++) {
    for (let x = x0; x < Math.min(x0 + size, grid.width); x++) {
      if (getCell(grid, x, y) !== Cell.Floor) continue;
      const decay = isDark(grid, x, y) ? 2 : 1;
      for (let ty = 0; ty < 3; ty++) {
        for (let tx = 0; tx < 3; tx++) {
          if (tx === 1 && ty === 1 && isLightCell(grid, x, y)) continue;
          const gx = x * 3 + tx;
          const gy = y * 3 + ty;
          let r = hash(gx, gy, 5);
          for (const [kind, p] of CEILING_ODDS) {
            const odds = kind === 'vent' ? p : p * decay;
            if (r < odds) {
              out.push({ kind, x: (gx + 0.5) * TILE, z: (gy + 0.5) * TILE, seed: hash(gx, gy, 9) });
              break;
            }
            r -= odds;
          }
        }
      }
    }
  }
  return out;
}

/** A damp patch on the carpet: centre (world metres) and radius. */
export interface Puddle {
  x: number;
  z: number;
  r: number;
}

/** "Old moist carpet": a few dark, wet patches per chunk, more of them in unpowered zones. */
export function puddles(grid: Grid, cx: number, cy: number, size: number): Puddle[] {
  const out: Puddle[] = [];
  const x0 = cx * size;
  const y0 = cy * size;
  for (let y = y0; y < Math.min(y0 + size, grid.height); y++) {
    for (let x = x0; x < Math.min(x0 + size, grid.width); x++) {
      if (getCell(grid, x, y) !== Cell.Floor) continue;
      const odds = isDark(grid, x, y) ? 0.05 : 0.02;
      if (hash(x, y, 13) >= odds) continue;
      out.push({
        x: (x + 0.25 + hash(x, y, 14) * 0.5) * CELL_SIZE,
        z: (y + 0.25 + hash(x, y, 15) * 0.5) * CELL_SIZE,
        r: 0.35 + hash(x, y, 16) * 0.55,
      });
    }
  }
  return out;
}

/** Air-vent grilles high on the walls, about one per 18 m of wall. */
export function wallVents(quads: readonly WallQuad[]): OutletSpot[] {
  return spotsAlong(quads, 18, 41);
}

/** A clock or fire-alarm pull station on a wall: where, and how high its centre hangs. */
export interface WallFixture {
  kind: 'clock' | 'fireAlarm';
  spot: OutletSpot;
  y: number;
}

/** Office wall fixtures: a clock about every 30 m of wall, a fire alarm about every 40 m. */
export function wallFixtures(quads: readonly WallQuad[]): WallFixture[] {
  return [
    ...spotsAlong(quads, 30, 71).map((spot) => ({ kind: 'clock' as const, spot, y: 1.75 + hash(Math.round(spot.x * 10), Math.round(spot.z * 10), 3) * 0.45 })),
    ...spotsAlong(quads, 40, 83).map((spot) => ({ kind: 'fireAlarm' as const, spot, y: 1.25 + hash(Math.round(spot.x * 10), Math.round(spot.z * 10), 4) * 0.25 })),
  ];
}
