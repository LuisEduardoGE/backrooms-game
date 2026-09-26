import { describe, expect, it } from 'vitest';
import { ARCH_WIDTH, archAxis, hasFullFace, solidRects, WALL_THICKNESS } from '../../src/world/solids';
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

describe('arch doorways', () => {
  /** Two rooms (rows 1–4 = room 0, rows 6–9 = room 1) split by a wall on row 5 with a doorway at x. */
  function doorway(x: number) {
    const g = createGrid(12, 11);
    for (let y = 1; y <= 9; y++) {
      for (let cx = 1; cx <= 10; cx++) {
        if (y === 5) continue;
        setCell(g, cx, y, Cell.Floor);
        g.room[y * 12 + cx] = y < 5 ? 0 : 1;
      }
    }
    setCell(g, x, 5, Cell.Floor); // carved: no room, no zone
    return g;
  }
  /** The first arch doorway in the grid, if any. */
  const findArch = (g: ReturnType<typeof doorway>) => {
    for (let x = 1; x <= 10; x++) if (archAxis(g, x, 5)) return x;
    return -1;
  };

  it('turns some one-cell doorways into arches, deterministically', () => {
    let arches = 0;
    for (let x = 2; x <= 9; x++) if (archAxis(doorway(x), x, 5)) arches++;
    expect(arches).toBeGreaterThan(0);
    expect(arches).toBeLessThan(8);
    for (let x = 2; x <= 9; x++) expect(archAxis(doorway(x), x, 5)).toBe(archAxis(doorway(x), x, 5));
  });

  it('never arches a wide opening or a plain floor cell', () => {
    const g = doorway(4);
    setCell(g, 5, 5, Cell.Floor); // now two cells wide
    expect(archAxis(g, 4, 5)).toBe(null);
    expect(archAxis(g, 5, 5)).toBe(null);
    expect(archAxis(g, 4, 3)).toBe(null);
  });

  it('is solid either side of a centred ARCH_WIDTH opening, joined up with the wall on both sides', () => {
    let g = doorway(2);
    let x = findArch(g);
    for (let i = 2; x < 0 && i <= 9; i++) {
      g = doorway(i);
      x = findArch(g);
    }
    expect(x).toBeGreaterThan(0);
    const cx = x * 2 + 1;
    const jambs = solidRects(g, x, 5);
    expect(jambs).toHaveLength(2);
    const [a, b] = [...jambs].sort((p, q) => p.minX - q.minX);
    expect(a.minX).toBeCloseTo(x * 2, 6);
    expect(a.maxX).toBeCloseTo(cx - ARCH_WIDTH / 2, 6);
    expect(b.minX).toBeCloseTo(cx + ARCH_WIDTH / 2, 6);
    expect(b.maxX).toBeCloseTo(x * 2 + 2, 6);
    // The wall cells either side now reach all the way to the arch (no gap beside the jambs).
    expect(Math.max(...solidRects(g, x - 1, 5).map((r) => r.maxX))).toBeCloseTo(x * 2, 6);
    expect(Math.min(...solidRects(g, x + 1, 5).map((r) => r.minX))).toBeCloseTo(x * 2 + 2, 6);
  });
});
