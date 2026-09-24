import { describe, expect, it } from 'vitest';
import { Cell, CELL_SIZE, cellToWorld, createGrid, getCell, inBounds, isDark, isSolid, setCell, worldToCell } from '../../src/world/grid';

describe('grid', () => {
  it('starts as all walls, not dark, no rooms', () => {
    const g = createGrid(4, 3);
    expect(g.cells.length).toBe(12);
    expect([...g.cells].every((c) => c === Cell.Wall)).toBe(true);
    expect([...g.dark].every((d) => d === 0)).toBe(true);
    expect([...g.room].every((r) => r === -1)).toBe(true);
  });

  it('treats out-of-bounds as solid wall', () => {
    const g = createGrid(4, 4);
    expect(inBounds(g, -1, 0)).toBe(false);
    expect(getCell(g, 4, 0)).toBe(Cell.Wall);
    expect(isSolid(g, 0, -1)).toBe(true);
  });

  it('sets and reads cells; pillars are solid, floor is not', () => {
    const g = createGrid(4, 4);
    setCell(g, 1, 2, Cell.Floor);
    setCell(g, 2, 2, Cell.Pillar);
    expect(getCell(g, 1, 2)).toBe(Cell.Floor);
    expect(isSolid(g, 1, 2)).toBe(false);
    expect(isSolid(g, 2, 2)).toBe(true);
  });

  it('reads the dark flag', () => {
    const g = createGrid(4, 4);
    g.dark[1 * 4 + 1] = 1;
    expect(isDark(g, 1, 1)).toBe(true);
    expect(isDark(g, 0, 0)).toBe(false);
  });

  it('converts between cells and world metres', () => {
    expect(cellToWorld(0)).toBe(CELL_SIZE / 2);
    expect(cellToWorld(3)).toBe(7);
    expect(worldToCell(7)).toBe(3);
    expect(worldToCell(5.999)).toBe(2);
    expect(worldToCell(-0.1)).toBe(-1);
  });
});
