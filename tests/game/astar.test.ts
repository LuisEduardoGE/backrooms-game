import { describe, expect, it } from 'vitest';
import { findPath } from '../../src/game/astar';
import { generateLevel } from '../../src/world/generator';
import { Cell, createGrid, setCell } from '../../src/world/grid';
import { bfsDistances } from '../../src/world/pathing';

/** 9×5 room with a wall column at x=4 except a gap at y=3. */
function room() {
  const g = createGrid(9, 5);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 7; x++) setCell(g, x, y, Cell.Floor);
  setCell(g, 4, 1, Cell.Wall);
  setCell(g, 4, 2, Cell.Wall);
  return g;
}

describe('findPath', () => {
  it('finds a shortest path around walls', () => {
    const g = room();
    const path = findPath(g, { x: 1, y: 1 }, { x: 7, y: 1 });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 1, y: 1 });
    expect(path![path!.length - 1]).toEqual({ x: 7, y: 1 });
    const d = bfsDistances(g, 1, 1);
    expect(path!.length - 1).toBe(d[1 * 9 + 7]);
    for (let i = 1; i < path!.length; i++) {
      expect(Math.abs(path![i].x - path![i - 1].x) + Math.abs(path![i].y - path![i - 1].y)).toBe(1);
    }
  });

  it('returns [from] when already there, null when blocked or the goal is off-limits', () => {
    const g = room();
    expect(findPath(g, { x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }]);
    setCell(g, 4, 3, Cell.Wall);
    expect(findPath(g, { x: 1, y: 1 }, { x: 7, y: 1 })).toBeNull();
    expect(findPath(room(), { x: 1, y: 1 }, { x: 0, y: 0 })).toBeNull();
  });

  it('respects a passability predicate', () => {
    const leftHalf = (x: number) => x < 4;
    expect(findPath(room(), { x: 1, y: 1 }, { x: 7, y: 1 }, (x, y) => leftHalf(x) && y > 0)).toBeNull();
    expect(findPath(room(), { x: 1, y: 1 }, { x: 3, y: 3 }, (x, y) => leftHalf(x) && y > 0)).not.toBeNull();
  });

  it('gives up (null) instead of stalling when the expansion cap is hit', () => {
    const level = generateLevel(42);
    const t0 = performance.now();
    expect(findPath(level.grid, level.start, level.exit, undefined, 50)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
