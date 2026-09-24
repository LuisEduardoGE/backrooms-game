import { describe, expect, it } from 'vitest';
import { flicker, isFaultyLight, isLightCell, nearestLitLights } from '../../src/lighting/lights';
import { Cell, createGrid, setCell } from '../../src/world/grid';

describe('isLightCell', () => {
  const g = createGrid(8, 8);
  for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) setCell(g, x, y, Cell.Floor);
  setCell(g, 4, 4, Cell.Pillar);

  it('places lights on even/even floor cells', () => {
    expect(isLightCell(g, 2, 2)).toBe(true);
    expect(isLightCell(g, 2, 6)).toBe(true);
  });

  it('skips odd cells, walls and pillars', () => {
    expect(isLightCell(g, 3, 2)).toBe(false);
    expect(isLightCell(g, 0, 0)).toBe(false);
    expect(isLightCell(g, 4, 4)).toBe(false);
  });
});

describe('nearestLitLights', () => {
  const g = createGrid(20, 20);
  for (let y = 1; y < 19; y++) for (let x = 1; x < 19; x++) setCell(g, x, y, Cell.Floor);

  it('returns the closest light cells, ties ordered by y then x', () => {
    expect(nearestLitLights(g, 9, 9, 4)).toEqual([
      { x: 8, y: 8 },
      { x: 10, y: 8 },
      { x: 8, y: 10 },
      { x: 10, y: 10 },
    ]);
  });

  it('skips lights in dark zones', () => {
    const dark = createGrid(20, 20);
    for (let y = 1; y < 19; y++) for (let x = 1; x < 19; x++) setCell(dark, x, y, Cell.Floor);
    dark.dark[8 * 20 + 8] = 1;
    expect(nearestLitLights(dark, 9, 9, 4)).not.toContainEqual({ x: 8, y: 8 });
  });

  it('respects the count and radius limits', () => {
    expect(nearestLitLights(g, 9, 9, 2)).toHaveLength(2);
    expect(nearestLitLights(g, 9, 9, 50, 1)).toHaveLength(4);
  });
});

describe('flicker', () => {
  const seed = 42;
  const faultyId = Array.from({ length: 500 }, (_, i) => i).find((i) => isFaultyLight(i, seed));
  const healthyId = Array.from({ length: 500 }, (_, i) => i).find((i) => !isFaultyLight(i, seed));

  it('has both faulty and healthy lights', () => {
    expect(faultyId).toBeDefined();
    expect(healthyId).toBeDefined();
  });

  it('keeps healthy lights near full brightness', () => {
    for (let t = 0; t < 10; t += 0.05) {
      const v = flicker(t, healthyId!, seed);
      expect(v).toBeGreaterThanOrEqual(0.96);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('makes faulty lights dip and recover', () => {
    const values = Array.from({ length: 200 }, (_, i) => flicker(i * 0.05, faultyId!, seed));
    expect(values.some((v) => v < 0.6)).toBe(true);
    expect(values.some((v) => v === 1)).toBe(true);
    expect(values.every((v) => v > 0)).toBe(true);
  });

  it('is deterministic', () => {
    expect(flicker(3.21, 7, seed)).toBe(flicker(3.21, 7, seed));
  });
});
