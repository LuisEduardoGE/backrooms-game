import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { MAX_SMILERS, spawnHowlerCell, spawnSmilerCells } from '../../src/game/spawns';
import { generateLevel } from '../../src/world/generator';
import { Cell, getCell, isDark } from '../../src/world/grid';
import { bfsDistances } from '../../src/world/pathing';

const level = generateLevel(42);
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('spawnSmilerCells', () => {
  const cells = spawnSmilerCells(level.grid, level.start, createRng(5));

  it('spawns up to MAX_SMILERS in dark floor cells, far from the player and spread out', () => {
    expect(cells.length).toBeGreaterThanOrEqual(1);
    expect(cells.length).toBeLessThanOrEqual(MAX_SMILERS);
    for (const c of cells) {
      expect(getCell(level.grid, c.x, c.y)).toBe(Cell.Floor);
      expect(isDark(level.grid, c.x, c.y)).toBe(true);
      expect(cheb(c, level.start)).toBeGreaterThanOrEqual(12);
    }
    for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) expect(cheb(cells[a], cells[b])).toBeGreaterThanOrEqual(20);
  });
});

describe('spawnHowlerCell', () => {
  it('spawns 30–60 walking cells away from the player', () => {
    const cell = spawnHowlerCell(level.grid, level.start, createRng(5));
    expect(cell).not.toBeNull();
    const d = bfsDistances(level.grid, level.start.x, level.start.y)[cell!.y * level.grid.width + cell!.x];
    expect(d).toBeGreaterThanOrEqual(30);
    expect(d).toBeLessThanOrEqual(60);
  });
});
