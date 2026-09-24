import { describe, expect, it } from 'vitest';
import { DEFAULT_GEN, generateLevel } from '../../src/world/generator';
import { Cell, getCell, isDark } from '../../src/world/grid';
import { bfsDistances } from '../../src/world/pathing';

describe('generateLevel', () => {
  it('is deterministic for a seed', () => {
    const a = generateLevel(1234);
    const b = generateLevel(1234);
    expect(Array.from(a.grid.cells)).toEqual(Array.from(b.grid.cells));
    expect(Array.from(a.grid.dark)).toEqual(Array.from(b.grid.dark));
    expect(a.start).toEqual(b.start);
    expect(a.exit).toEqual(b.exit);
    expect(a.seed).toBe(1234);
  });

  it('differs between seeds', () => {
    const a = generateLevel(1);
    const b = generateLevel(2);
    expect(Array.from(a.grid.cells)).not.toEqual(Array.from(b.grid.cells));
  });

  it('spawns on plain, lit floor (never inside a wall/pillar or in the dark)', () => {
    for (let seed = 0; seed < 10; seed++) {
      const { grid, start } = generateLevel(seed);
      expect(getCell(grid, start.x, start.y)).toBe(Cell.Floor);
      expect(isDark(grid, start.x, start.y)).toBe(false);
    }
  });

  it('puts the exit far away, reachable, lit, and against a wall', () => {
    const { grid, start, exit } = generateLevel(99);
    const d = bfsDistances(grid, start.x, start.y);
    expect(d[exit.y * grid.width + exit.x]).toBeGreaterThan(0);
    expect(Math.hypot(exit.x - start.x, exit.y - start.y)).toBeGreaterThanOrEqual(
      DEFAULT_GEN.width * DEFAULT_GEN.exitDistanceRatio,
    );
    expect(isDark(grid, exit.x, exit.y)).toBe(false);
    const neighbours = [
      getCell(grid, exit.x + 1, exit.y),
      getCell(grid, exit.x - 1, exit.y),
      getCell(grid, exit.x, exit.y + 1),
      getCell(grid, exit.x, exit.y - 1),
    ];
    expect(neighbours).toContain(Cell.Wall);
  });

  it('makes roughly 15% of the floor dark', () => {
    const { grid } = generateLevel(7);
    let floor = 0;
    let dark = 0;
    for (let i = 0; i < grid.cells.length; i++) {
      if (grid.cells[i] !== Cell.Floor) continue;
      floor++;
      if (grid.dark[i]) dark++;
    }
    expect(dark / floor).toBeGreaterThanOrEqual(0.15);
    expect(dark / floor).toBeLessThan(0.25);
  });

  it('produces a valid level for 25 consecutive seeds', () => {
    for (let seed = 1000; seed < 1025; seed++) {
      expect(() => generateLevel(seed)).not.toThrow();
    }
  });

  it('throws a clear error when no layout can satisfy the exit distance', () => {
    expect(() => generateLevel(1, { exitDistanceRatio: 5 })).toThrow(/no valid layout/);
  });

  it('faces the spawn toward the longest open run of floor (never into a wall)', () => {
    const run = (grid: ReturnType<typeof generateLevel>['grid'], x: number, y: number, dx: number, dy: number) => {
      let n = 0;
      while (getCell(grid, x + dx * (n + 1), y + dy * (n + 1)) === Cell.Floor) n++;
      return n;
    };
    for (let seed = 2000; seed < 2025; seed++) {
      const { grid, start, startYaw } = generateLevel(seed);
      const dx = Math.round(-Math.sin(startYaw));
      const dy = Math.round(-Math.cos(startYaw));
      const ahead = run(grid, start.x, start.y, dx, dy);
      expect(ahead).toBeGreaterThan(0);
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        expect(ahead).toBeGreaterThanOrEqual(run(grid, start.x, start.y, ox, oy));
      }
    }
  });
});
