import { describe, expect, it } from 'vitest';
import { AMBIENT_DARK, cellLight as bakeCell } from '../../src/lighting/bake';
import { Cell, createGrid, getCell, type Grid, setCell } from '../../src/world/grid';

/** These scenarios lay out their own panels: one over every floor cell. */
const everyCell = (g: Grid, x: number, y: number) => getCell(g, x, y) === Cell.Floor;
const cellLight = (g: Grid, x: number, y: number) => bakeCell(g, x, y, everyCell);

/** 21×21 open room (floor 1..19): a panel over every floor cell. */
function room() {
  const g = createGrid(21, 21);
  for (let y = 1; y <= 19; y++) for (let x = 1; x <= 19; x++) setCell(g, x, y, Cell.Floor);
  return g;
}

describe('cellLight', () => {
  it('lights an open, powered area evenly and brightly — everywhere, not just near you', () => {
    const g = room();
    const samples = [cellLight(g, 10, 10), cellLight(g, 11, 11), cellLight(g, 5, 14), cellLight(g, 15, 4)];
    for (const v of samples) {
      expect(v).toBeGreaterThan(0.85);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('leaves unpowered (dark-zone) areas dark', () => {
    const g = room();
    for (let i = 0; i < g.dark.length; i++) g.dark[i] = 1;
    expect(cellLight(g, 10, 10)).toBeCloseTo(AMBIENT_DARK, 6);
  });

  it('fades toward a dark zone and is blocked by walls', () => {
    const g = room();
    // Right half dark, a wall between the halves except a gap.
    for (let y = 1; y <= 19; y++) for (let x = 11; x <= 19; x++) g.dark[y * 21 + x] = 1;
    const edge = cellLight(g, 11, 10); // just inside the dark half, next to lit panels
    const deep = cellLight(g, 17, 10);
    expect(edge).toBeGreaterThan(deep);
    expect(deep).toBeCloseTo(AMBIENT_DARK, 6);

    // The same dark half behind a wall on column 11 (odd: no panel is removed by the wall, so only
    // occlusion can make the difference).
    const open = room();
    for (let y = 1; y <= 19; y++) for (let x = 12; x <= 19; x++) open.dark[y * 21 + x] = 1;
    const walled = room();
    for (let y = 1; y <= 19; y++) for (let x = 12; x <= 19; x++) walled.dark[y * 21 + x] = 1;
    for (let y = 1; y <= 19; y++) setCell(walled, 11, y, Cell.Wall);
    expect(cellLight(open, 12, 10)).toBeGreaterThan(AMBIENT_DARK + 0.15);
    expect(cellLight(walled, 12, 10)).toBeCloseTo(AMBIENT_DARK, 6);
  });
});

describe('sparse panels', () => {
  it('pools light under a cluster and leaves the gap between clusters dimmer', () => {
    const g = createGrid(41, 21);
    for (let y = 1; y <= 19; y++) for (let x = 1; x <= 39; x++) setCell(g, x, y, Cell.Floor);
    // Two clusters at the ends of a long room, nothing in between.
    const clusters = (_: Grid, x: number, y: number) => y >= 1 && y <= 19 && ((x >= 2 && x <= 8) || (x >= 32 && x <= 38));
    const inCluster = bakeCell(g, 5, 10, clusters);
    const gap = bakeCell(g, 20, 10, clusters);
    expect(inCluster).toBeGreaterThan(0.9);
    expect(gap).toBeLessThan(inCluster - 0.4);
  });
});
