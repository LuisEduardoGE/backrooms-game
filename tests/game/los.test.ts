import { describe, expect, it } from 'vitest';
import { hasLineOfSight } from '../../src/game/los';
import { Cell, createGrid, setCell } from '../../src/world/grid';

/** 9×9 open room (floor x,y ∈ 1..7). World interior spans 2..16 m. */
function room() {
  const g = createGrid(9, 9);
  for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) setCell(g, x, y, Cell.Floor);
  return g;
}

describe('hasLineOfSight', () => {
  it('sees across an open room', () => {
    expect(hasLineOfSight(room(), { x: 3, z: 3 }, { x: 15, z: 15 })).toBe(true);
  });

  it('is blocked by a wall in between', () => {
    const g = room();
    setCell(g, 4, 4, Cell.Wall); // spans 8..10 m
    expect(hasLineOfSight(g, { x: 5, z: 9 }, { x: 13, z: 9 })).toBe(false);
  });

  it('is blocked by a pillar box but not by the empty part of a pillar cell', () => {
    const g = room();
    setCell(g, 4, 4, Cell.Pillar); // box spans 8.6..9.4 m
    expect(hasLineOfSight(g, { x: 5, z: 9 }, { x: 13, z: 9 })).toBe(false);
    expect(hasLineOfSight(g, { x: 5, z: 8.2 }, { x: 13, z: 8.2 })).toBe(true);
  });
});
