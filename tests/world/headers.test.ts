import { describe, expect, it } from 'vitest';
import { doorHeaders, HEADER_BOTTOM } from '../../src/world/headers';
import { Cell, createGrid, setCell, WALL_HEIGHT } from '../../src/world/grid';

/** Two rooms (above/below) split by a wall on row 5, with openings cut into it. */
function wallWithOpenings(gaps: number[]) {
  const g = createGrid(20, 11);
  for (let y = 1; y <= 9; y++) for (let x = 1; x <= 18; x++) if (y !== 5) setCell(g, x, y, Cell.Floor);
  for (const x of gaps) setCell(g, x, 5, Cell.Floor);
  return g;
}

describe('doorHeaders', () => {
  it('puts a header over a doorway cut into a wall, spanning wall end to wall end', () => {
    const headers = doorHeaders(wallWithOpenings([4]), 0, 0, 20);
    expect(headers).toHaveLength(1);
    const [h] = headers;
    // Wall cells 3 and 5 are centred at x = 7 and x = 11: the header joins their slabs.
    expect(h.minX).toBeCloseTo(7, 6);
    expect(h.maxX).toBeCloseTo(11, 6);
    expect(h.y0).toBe(HEADER_BOTTOM);
    expect(h.y1).toBe(WALL_HEIGHT);
    expect(HEADER_BOTTOM).toBeGreaterThan(2);
  });

  it('covers 2- and 3-cell openings but not wide gaps (merged halls stay open to the ceiling)', () => {
    expect(doorHeaders(wallWithOpenings([4, 5]), 0, 0, 20)).toHaveLength(1);
    expect(doorHeaders(wallWithOpenings([4, 5, 6]), 0, 0, 20)).toHaveLength(1);
    expect(doorHeaders(wallWithOpenings([4, 5, 6, 7]), 0, 0, 20)).toHaveLength(0);
  });

  it('is built by the chunk holding the opening only', () => {
    const g = wallWithOpenings([12]);
    expect(doorHeaders(g, 0, 0, 10)).toHaveLength(0);
    expect(doorHeaders(g, 1, 0, 10)).toHaveLength(1);
  });
});
