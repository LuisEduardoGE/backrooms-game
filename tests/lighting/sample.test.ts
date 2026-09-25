import { describe, expect, it } from 'vitest';
import { AO_MIN, contactShadow, lightAt } from '../../src/lighting/sample';
import { Cell, cellToWorld, createGrid, setCell } from '../../src/world/grid';

/** 11×11 open room (floor 1..9) with an outer wall ring. */
function room() {
  const g = createGrid(11, 11);
  for (let y = 1; y <= 9; y++) for (let x = 1; x <= 9; x++) setCell(g, x, y, Cell.Floor);
  return g;
}

/** A fake light field: brightness grows with x, so interpolation is easy to check. */
const ramp = (x: number, _y: number) => x / 10;

describe('lightAt', () => {
  it('equals the cell value at a cell centre', () => {
    expect(lightAt(ramp, cellToWorld(4), cellToWorld(6))).toBeCloseTo(0.4, 6);
  });

  it('interpolates smoothly between cell centres (no steps at cell borders)', () => {
    const mid = lightAt(ramp, (cellToWorld(4) + cellToWorld(5)) / 2, cellToWorld(3));
    expect(mid).toBeCloseTo(0.45, 6);
    const a = lightAt(ramp, 9.999, 7);
    const b = lightAt(ramp, 10.001, 7);
    expect(Math.abs(a - b)).toBeLessThan(0.001);
  });
});

describe('contactShadow', () => {
  it('is 1 in the open, far from any wall or column', () => {
    expect(contactShadow(room(), cellToWorld(5), cellToWorld(5))).toBe(1);
  });

  it('darkens next to a wall, more in a corner, and never below AO_MIN', () => {
    const g = room();
    const face = cellToWorld(0) + 0.3; // the ring wall's slab ends around x ≈ 1.2
    const nearWall = contactShadow(g, face + 0.05, cellToWorld(5));
    const corner = contactShadow(g, face + 0.05, face + 0.05);
    const open = contactShadow(g, face + 0.7, cellToWorld(5));
    expect(nearWall).toBeLessThan(0.95);
    expect(corner).toBeLessThan(nearWall);
    expect(open).toBeGreaterThan(nearWall);
    expect(corner).toBeGreaterThanOrEqual(AO_MIN);
  });

  it('darkens around a column', () => {
    const g = room();
    setCell(g, 5, 5, Cell.Pillar);
    expect(contactShadow(g, cellToWorld(5), cellToWorld(5) - 0.6)).toBeLessThan(0.95);
  });

  it('changes continuously as you walk toward a wall', () => {
    const g = room();
    let prev = contactShadow(g, 4, cellToWorld(5));
    for (let x = 3.95; x > 1.4; x -= 0.05) {
      const v = contactShadow(g, x, cellToWorld(5));
      expect(Math.abs(v - prev)).toBeLessThan(0.05);
      prev = v;
    }
  });
});
