/** Metres per grid cell. */
export const CELL_SIZE = 2;
export const WALL_HEIGHT = 2.7;
/** Square 1 m office columns (wallpapered, with baseboards). */
export const PILLAR_SIZE = 1.0;

export const Cell = { Floor: 0, Wall: 1, Pillar: 2 } as const;
export type Cell = (typeof Cell)[keyof typeof Cell];

export interface Point {
  x: number;
  y: number;
}

export interface Grid {
  readonly width: number;
  readonly height: number;
  /** Cell value per cell, row-major (index = y * width + x). */
  readonly cells: Uint8Array;
  /** 1 = unpowered (dark zone). */
  readonly dark: Uint8Array;
  /** Room id per cell; -1 for walls and doorways. */
  readonly room: Int32Array;
}

export function createGrid(width: number, height: number): Grid {
  return {
    width,
    height,
    cells: new Uint8Array(width * height).fill(Cell.Wall),
    dark: new Uint8Array(width * height),
    room: new Int32Array(width * height).fill(-1),
  };
}

export function inBounds(g: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.width && y < g.height;
}

export function getCell(g: Grid, x: number, y: number): Cell {
  return inBounds(g, x, y) ? (g.cells[y * g.width + x] as Cell) : Cell.Wall;
}

export function setCell(g: Grid, x: number, y: number, c: Cell): void {
  g.cells[y * g.width + x] = c;
}

export function isSolid(g: Grid, x: number, y: number): boolean {
  return getCell(g, x, y) !== Cell.Floor;
}

export function isDark(g: Grid, x: number, y: number): boolean {
  return inBounds(g, x, y) && g.dark[y * g.width + x] === 1;
}

/** Centre of a cell in world metres. Grid x → world X, grid y → world Z. */
export function cellToWorld(cell: number): number {
  return (cell + 0.5) * CELL_SIZE;
}

export function worldToCell(metres: number): number {
  return Math.floor(metres / CELL_SIZE);
}

export type Dir = 'N' | 'E' | 'S' | 'W';

/** Grid step per compass direction: N = −y (world −Z), E = +x, S = +y, W = −x. */
export const DIR_STEP: Record<Dir, Point> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

export const DIRS: readonly Dir[] = ['N', 'E', 'S', 'W'];
