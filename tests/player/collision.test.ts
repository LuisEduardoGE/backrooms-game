import { describe, expect, it } from 'vitest';
import { moveWithCollision, PLAYER_RADIUS } from '../../src/player/collision';
import { Cell, createGrid, setCell } from '../../src/world/grid';

/** size×size grid with a walled border and open floor inside. World interior spans [2, (size-1)*2]. */
function room(size: number) {
  const g = createGrid(size, size);
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) setCell(g, x, y, Cell.Floor);
  return g;
}

describe('moveWithCollision', () => {
  it('moves freely in open space', () => {
    const p = moveWithCollision(room(5), { x: 5, z: 5 }, 0.5, -0.5);
    expect(p).toEqual({ x: 5.5, z: 4.5 });
  });

  it('stops flush against a wall in +x and -x', () => {
    const g = room(5); // interior x ∈ [2, 8]
    expect(moveWithCollision(g, { x: 7, z: 5 }, 1.9, 0).x).toBeCloseTo(8 - PLAYER_RADIUS, 3);
    expect(moveWithCollision(g, { x: 3, z: 5 }, -1.9, 0).x).toBeCloseTo(2 + PLAYER_RADIUS, 3);
  });

  it('slides along a wall instead of sticking', () => {
    const p = moveWithCollision(room(5), { x: 7.69, z: 5 }, 0.5, 0.5);
    expect(p.x).toBeCloseTo(8 - PLAYER_RADIUS, 3);
    expect(p.z).toBeCloseTo(5.5, 5);
  });

  it('cannot squeeze through a corner diagonally', () => {
    const g = room(5);
    let p = { x: 7.5, z: 7.5 };
    for (let i = 0; i < 10; i++) p = moveWithCollision(g, p, 0.3, 0.3);
    expect(p.x).toBeCloseTo(8 - PLAYER_RADIUS, 3);
    expect(p.z).toBeCloseTo(8 - PLAYER_RADIUS, 3);
  });

  it('collides with the thin pillar box, not the whole pillar cell', () => {
    const g = room(7);
    setCell(g, 3, 3, Cell.Pillar); // cell spans [6, 8]; pillar box spans [6.6, 7.4]
    const stopped = moveWithCollision(g, { x: 5, z: 7 }, 1.5, 0);
    expect(stopped.x).toBeCloseTo(6.6 - PLAYER_RADIUS, 3);
    // Beside the pillar (outside its box on z) the player may stand inside the pillar's cell.
    const beside = moveWithCollision(g, { x: 5, z: 6.2 }, 1.5, 0);
    expect(beside.x).toBeCloseTo(6.5, 5);
  });
});
