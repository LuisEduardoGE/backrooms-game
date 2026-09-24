import { Cell, type Grid, getCell } from '../world/grid';

/** A fluorescent ceiling panel hangs over every floor cell with even x and even y (one per 4 m). */
export function isLightCell(grid: Grid, x: number, y: number): boolean {
  return getCell(grid, x, y) === Cell.Floor && x % 2 === 0 && y % 2 === 0;
}
