import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS } from '../../src/player/collision';
import { exitWallSide, reachedExit } from '../../src/world/exit';
import { Cell, cellToWorld, createGrid, setCell } from '../../src/world/grid';
import { WALL_FACE_DISTANCE } from '../../src/world/solids';

/** 5×5 grid, floor at x,y ∈ 1..3. */
function room() {
  const g = createGrid(5, 5);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) setCell(g, x, y, Cell.Floor);
  return g;
}

describe('exitWallSide', () => {
  it('picks the first adjacent wall in N, E, S, W order', () => {
    expect(exitWallSide(room(), { x: 2, y: 1 })).toBe('N');
    expect(exitWallSide(room(), { x: 3, y: 2 })).toBe('E');
    expect(exitWallSide(room(), { x: 2, y: 3 })).toBe('S');
    expect(exitWallSide(room(), { x: 1, y: 2 })).toBe('W');
  });

  it('throws when the cell has no wall neighbour', () => {
    expect(() => exitWallSide(room(), { x: 2, y: 2 })).toThrow(/no adjacent wall/);
  });
});

describe('reachedExit', () => {
  it('triggers when the player is pressed against the wall face — reachable given collision', () => {
    // Exit cell (2,1) is centred at z = 3; its north wall's thin face is 1.9 m further, at z = 1.1.
    const north = cellToWorld(1) - WALL_FACE_DISTANCE;
    expect(reachedExit({ x: 2, y: 1 }, 'N', { x: 5, z: north + PLAYER_RADIUS + 0.001 })).toBe(true);
    // Cell (3,2)'s east face is at x = 7 + 1.9 = 8.9.
    const east = cellToWorld(3) + WALL_FACE_DISTANCE;
    expect(reachedExit({ x: 3, y: 2 }, 'E', { x: east - PLAYER_RADIUS - 0.001, z: 5 })).toBe(true);
  });

  it('does not trigger from the middle of the cell or from a neighbouring cell', () => {
    expect(reachedExit({ x: 2, y: 1 }, 'N', { x: 5, z: 3 })).toBe(false);
    expect(reachedExit({ x: 2, y: 1 }, 'N', { x: 3.9, z: 1.41 })).toBe(false);
  });
});

describe('exitWallSide with thin walls', () => {
  it('skips a side whose wall does not span the whole cell (it could not hold a noclip wall)', () => {
    const g = createGrid(7, 5);
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 5; x++) setCell(g, x, y, Cell.Floor);
    // (5,1): break its north wall's west arm, so the only full-width face left is the east border.
    setCell(g, 4, 0, Cell.Floor);
    expect(exitWallSide(g, { x: 5, y: 1 })).toBe('E');
  });
});
