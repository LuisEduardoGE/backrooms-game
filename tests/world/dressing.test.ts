import { describe, expect, it } from 'vitest';
import { isLightCell } from '../../src/lighting/lights';
import { ceilingDressing, puddles, TILE, wallVents } from '../../src/world/dressing';
import { Cell, CELL_SIZE, createGrid, type Grid, setCell } from '../../src/world/grid';
import { wallQuads } from '../../src/world/wallFaces';

/** A 64×64 open floor with a wall line across it. */
function level(): Grid {
  const g = createGrid(64, 64);
  for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) setCell(g, x, y, Cell.Floor);
  for (let x = 1; x < 63; x++) setCell(g, x, 32, Cell.Wall);
  return g;
}

describe('ceilingDressing', () => {
  const g = level();
  const items = [0, 1, 2, 3].flatMap((c) => [0, 1, 2, 3].flatMap((r) => ceilingDressing(g, c, r, 16)));

  it('places every kind of ceiling damage somewhere, sparsely', () => {
    for (const kind of ['stain', 'missing', 'hanging', 'vent'] as const) expect(items.some((i) => i.kind === kind)).toBe(true);
    const tiles = 62 * 62 * 9;
    expect(items.length).toBeLessThan(tiles * 0.12);
  });

  it('keeps off walls and off the tile a light panel occupies', () => {
    for (const it of items) {
      const cx = Math.floor(it.x / CELL_SIZE);
      const cz = Math.floor(it.z / CELL_SIZE);
      expect(g.cells[cz * 64 + cx]).toBe(Cell.Floor);
      const centreTile = Math.abs(it.x - (cx + 0.5) * CELL_SIZE) < TILE / 2 && Math.abs(it.z - (cz + 0.5) * CELL_SIZE) < TILE / 2;
      if (centreTile) expect(isLightCell(g, cx, cz)).toBe(false);
    }
  });

  it('is deterministic', () => {
    expect(ceilingDressing(g, 1, 1, 16)).toEqual(ceilingDressing(g, 1, 1, 16));
  });
});

describe('puddles', () => {
  it('leaves a few damp patches on floor cells only', () => {
    const g = level();
    const all = [0, 1, 2, 3].flatMap((c) => [0, 1, 2, 3].flatMap((r) => puddles(g, c, r, 16)));
    expect(all.length).toBeGreaterThan(5);
    expect(all.length).toBeLessThan(62 * 62 * 0.1);
    for (const p of all) expect(g.cells[Math.floor(p.z / CELL_SIZE) * 64 + Math.floor(p.x / CELL_SIZE)]).toBe(Cell.Floor);
  });
});

describe('wallVents', () => {
  it('puts a few vents high on long walls', () => {
    const g = level();
    const quads = [0, 1, 2, 3].flatMap((c) => wallQuads(g, c, 2, 16));
    const vents = wallVents(quads);
    expect(vents.length).toBeGreaterThan(0);
    const wallLength = quads.reduce((m, q) => m + Math.hypot(q.x1 - q.x0, q.z1 - q.z0), 0);
    expect(vents.length).toBeLessThanOrEqual(Math.ceil(wallLength / 10));
  });
});
