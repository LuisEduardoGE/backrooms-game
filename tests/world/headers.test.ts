import { describe, expect, it } from 'vitest';
import { doorHeaders, HEADER_BOTTOM } from '../../src/world/headers';
import { Cell, createGrid, setCell, WALL_HEIGHT } from '../../src/world/grid';

/** Two rooms (above/below) split by a wall on row 5, with openings cut into it. */
function wallWithOpenings(gaps: number[]) {
  const g = createGrid(20, 11);
  for (let y = 1; y <= 9; y++) {
    for (let x = 1; x <= 18; x++) {
      if (y === 5) continue;
      setCell(g, x, y, Cell.Floor);
      g.room[y * 20 + x] = y < 5 ? 0 : 1;
    }
  }
  // Doorways are carved out of the wall: floor with no room id.
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

  it('never hangs a header across a narrow room or corridor (only over openings carved in a wall)', () => {
    // A 3-wide corridor room running north–south between two walls: every row has wall–floor×3–wall.
    const g = createGrid(9, 12);
    for (let y = 1; y <= 10; y++) {
      for (let x = 3; x <= 5; x++) {
        setCell(g, x, y, Cell.Floor);
        g.room[y * 9 + x] = 0;
      }
    }
    expect(doorHeaders(g, 0, 0, 12)).toHaveLength(0);
  });

  it('leaves gaps between the stubs of a merged hall open (no beam across the hall)', () => {
    const g = wallWithOpenings([4, 9, 14]);
    // The two rooms were merged into one hall: every floor cell, including the carved gaps, shares a zone.
    for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === Cell.Floor) g.zone[i] = 0;
    expect(doorHeaders(g, 0, 0, 20)).toHaveLength(0);
  });
});
