import { describe, expect, it } from 'vitest';
import { hasFullFace, solidRects, WALL_THICKNESS } from '../../src/world/solids';
import { Cell, createGrid, PILLAR_SIZE, setCell } from '../../src/world/grid';

/** 7×7 grid, all floor inside a wall border, so walls can be placed by hand. */
function open() {
  const g = createGrid(7, 7);
  for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) setCell(g, x, y, Cell.Floor);
  return g;
}
const T = WALL_THICKNESS;

describe('solidRects', () => {
  it('draws a wall in a north–south line as one thin slab through the middle of its cell', () => {
    const g = open();
    for (let y = 1; y <= 5; y++) setCell(g, 3, y, Cell.Wall);
    // Cell (3,3) spans x 6..8, z 6..8; centre x = 7.
    expect(solidRects(g, 3, 3)).toEqual([{ minX: 7 - T / 2, maxX: 7 + T / 2, minZ: 6, maxZ: 8 }]);
  });

  it('draws a corner as two arms meeting in the middle', () => {
    const g = open();
    setCell(g, 3, 3, Cell.Wall);
    setCell(g, 4, 3, Cell.Wall); // east neighbour
    setCell(g, 3, 4, Cell.Wall); // south neighbour
    const rects = solidRects(g, 3, 3);
    expect(rects).toContainEqual({ minX: 7 - T / 2, maxX: 7 + T / 2, minZ: 7 - T / 2, maxZ: 8 }); // down to the south edge
    expect(rects).toContainEqual({ minX: 7 - T / 2, maxX: 8, minZ: 7 - T / 2, maxZ: 7 + T / 2 }); // out to the east edge
    expect(rects).toHaveLength(2);
  });

  it('draws a lone wall cell as a thin post, and floor as nothing', () => {
    const g = open();
    setCell(g, 3, 3, Cell.Wall);
    expect(solidRects(g, 3, 3)).toEqual([{ minX: 7 - T / 2, maxX: 7 + T / 2, minZ: 7 - T / 2, maxZ: 7 + T / 2 }]);
    expect(solidRects(g, 2, 2)).toEqual([]);
  });

  it('keeps pillars as their PILLAR_SIZE box, centred in the cell', () => {
    const g = open();
    setCell(g, 3, 3, Cell.Pillar);
    const [r] = solidRects(g, 3, 3);
    const h = PILLAR_SIZE / 2;
    for (const [k, v] of Object.entries({ minX: 7 - h, maxX: 7 + h, minZ: 7 - h, maxZ: 7 + h })) expect(r[k as keyof typeof r]).toBeCloseTo(v, 9);
  });
});

describe('hasFullFace', () => {
  it('is true when the wall beyond a side runs the full width of the cell (paintable, noclip-able)', () => {
    const g = open();
    for (let x = 1; x <= 5; x++) setCell(g, x, 2, Cell.Wall); // an east–west wall line at y=2
    expect(hasFullFace(g, 3, 3, 'N')).toBe(true);
  });

  it('is false for an end-on wall, a wall that stops halfway, or no wall', () => {
    const g = open();
    for (let y = 1; y <= 5; y++) setCell(g, 4, y, Cell.Wall); // north–south line: seen end-on from (4,… ) no; from (3,3) east side it is a face
    expect(hasFullFace(g, 3, 3, 'E')).toBe(true);
    const h = open();
    setCell(h, 3, 2, Cell.Wall);
    setCell(h, 4, 2, Cell.Wall); // wall stops at (3,2): only an east arm
    expect(hasFullFace(h, 3, 3, 'N')).toBe(false);
    expect(hasFullFace(open(), 3, 3, 'N')).toBe(false);
  });
});
