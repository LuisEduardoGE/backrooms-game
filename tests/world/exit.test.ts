import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS } from '../../src/player/collision';
import { exitWallSide, reachedExit } from '../../src/world/exit';
import { Cell, createGrid, setCell } from '../../src/world/grid';

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
    // Exit cell (2,1) spans x∈[4,6], z∈[2,4]; its north wall face is z = 2.
    expect(reachedExit({ x: 2, y: 1 }, 'N', { x: 5, z: 2 + PLAYER_RADIUS + 0.001 })).toBe(true);
    // Cell (3,2) east wall face is x = 8.
    expect(reachedExit({ x: 3, y: 2 }, 'E', { x: 8 - PLAYER_RADIUS - 0.001, z: 5 })).toBe(true);
  });

  it('does not trigger from the middle of the cell or from a neighbouring cell', () => {
    expect(reachedExit({ x: 2, y: 1 }, 'N', { x: 5, z: 3 })).toBe(false);
    expect(reachedExit({ x: 2, y: 1 }, 'N', { x: 3.9, z: 2.31 })).toBe(false);
  });
});
