import { describe, expect, it } from 'vitest';
import { Cell, createGrid, setCell } from '../../src/world/grid';
import { bfsDistances } from '../../src/world/pathing';

function corridor() {
  // 7x3 grid with a straight floor corridor along y=1 from x=1..5
  const g = createGrid(7, 3);
  for (let x = 1; x <= 5; x++) setCell(g, x, 1, Cell.Floor);
  return g;
}

describe('bfsDistances', () => {
  it('counts steps along a corridor', () => {
    const g = corridor();
    const d = bfsDistances(g, 1, 1);
    expect(d[1 * 7 + 1]).toBe(0);
    expect(d[1 * 7 + 5]).toBe(4);
    expect(d[0]).toBe(-1);
  });

  it('is blocked by walls and pillars', () => {
    const g = corridor();
    setCell(g, 3, 1, Cell.Pillar);
    const d = bfsDistances(g, 1, 1);
    expect(d[1 * 7 + 2]).toBe(1);
    expect(d[1 * 7 + 4]).toBe(-1);
  });

  it('returns all -1 when starting on a wall', () => {
    const d = bfsDistances(corridor(), 0, 0);
    expect([...d].every((v) => v === -1)).toBe(true);
  });
});
