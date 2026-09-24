import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { ARROW_SPACING_MIN, DECOY_COUNT, placeArrows, shortestPath } from '../../src/world/clues';
import { generateLevel } from '../../src/world/generator';
import { Cell, createGrid, DIR_STEP, getCell, setCell } from '../../src/world/grid';
import { bfsDistances } from '../../src/world/pathing';

const level = generateLevel(42);
const path = shortestPath(level.grid, level.start, level.exit);

describe('shortestPath', () => {
  it('runs from start to exit through adjacent floor cells, with the BFS length', () => {
    expect(path[0]).toEqual(level.start);
    expect(path[path.length - 1]).toEqual(level.exit);
    for (let i = 1; i < path.length; i++) {
      expect(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y)).toBe(1);
      expect(getCell(level.grid, path[i].x, path[i].y)).toBe(Cell.Floor);
    }
    const d = bfsDistances(level.grid, level.start.x, level.start.y);
    expect(path.length - 1).toBe(d[level.exit.y * level.grid.width + level.exit.x]);
  });

  it('returns [] when the target is unreachable', () => {
    const g = createGrid(5, 3);
    setCell(g, 1, 1, Cell.Floor);
    setCell(g, 3, 1, Cell.Floor);
    expect(shortestPath(g, { x: 1, y: 1 }, { x: 3, y: 1 })).toEqual([]);
  });
});

describe('placeArrows', () => {
  const arrows = placeArrows(level.grid, path, createRng(7));
  const real = arrows.filter((a) => !a.decoy);
  const decoys = arrows.filter((a) => a.decoy);
  const indexOnPath = (a: { cell: { x: number; y: number } }) =>
    path.findIndex((p) => p.x === a.cell.x && p.y === a.cell.y);

  it('paints real arrows on walls along the path, pointing to the next path cell', () => {
    expect(real.length).toBeGreaterThanOrEqual(3);
    for (const a of real) {
      const i = indexOnPath(a);
      expect(i).toBeGreaterThanOrEqual(0);
      const next = path[i + 1];
      expect({ x: a.cell.x + DIR_STEP[a.points].x, y: a.cell.y + DIR_STEP[a.points].y }).toEqual(next);
      expect(getCell(level.grid, a.cell.x + DIR_STEP[a.wall].x, a.cell.y + DIR_STEP[a.wall].y)).toBe(Cell.Wall);
    }
  });

  it('spaces real arrows at least ARROW_SPACING_MIN path cells apart', () => {
    const idx = real.map(indexOnPath);
    for (let k = 1; k < idx.length; k++) expect(idx[k] - idx[k - 1]).toBeGreaterThanOrEqual(ARROW_SPACING_MIN);
  });

  it('adds decoys off the path, on walls, pointing along the wall', () => {
    expect(decoys).toHaveLength(DECOY_COUNT);
    for (const a of decoys) {
      expect(indexOnPath(a)).toBe(-1);
      expect(getCell(level.grid, a.cell.x + DIR_STEP[a.wall].x, a.cell.y + DIR_STEP[a.wall].y)).toBe(Cell.Wall);
      const w = DIR_STEP[a.wall];
      const p = DIR_STEP[a.points];
      expect(w.x * p.x + w.y * p.y).toBe(0);
    }
  });

  it('is deterministic', () => {
    expect(placeArrows(level.grid, path, createRng(7))).toEqual(arrows);
  });
});
