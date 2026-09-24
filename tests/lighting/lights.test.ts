import { describe, expect, it } from 'vitest';
import { isLightCell } from '../../src/lighting/lights';
import { Cell, createGrid, setCell } from '../../src/world/grid';

describe('isLightCell', () => {
  const g = createGrid(8, 8);
  for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) setCell(g, x, y, Cell.Floor);
  setCell(g, 4, 4, Cell.Pillar);

  it('places lights on even/even floor cells', () => {
    expect(isLightCell(g, 2, 2)).toBe(true);
    expect(isLightCell(g, 2, 6)).toBe(true);
  });

  it('skips odd cells, walls and pillars', () => {
    expect(isLightCell(g, 3, 2)).toBe(false);
    expect(isLightCell(g, 0, 0)).toBe(false);
    expect(isLightCell(g, 4, 4)).toBe(false);
  });
});
