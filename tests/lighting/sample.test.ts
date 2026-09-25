import { describe, expect, it } from 'vitest';
import { AMBIENT_DARK, createLightField } from '../../src/lighting/bake';
import { AO_MIN, contactShadow, lightAt } from '../../src/lighting/sample';
import { WALL_THICKNESS } from '../../src/world/solids';
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
    expect(lightAt(room(), ramp, cellToWorld(4), cellToWorld(6))).toBeCloseTo(0.4, 6);
  });

  it('interpolates smoothly between cell centres (no steps at cell borders)', () => {
    const mid = lightAt(room(), ramp, (cellToWorld(4) + cellToWorld(5)) / 2, cellToWorld(3));
    expect(mid).toBeCloseTo(0.45, 6);
    const a = lightAt(room(), ramp, 9.999, 7);
    const b = lightAt(room(), ramp, 10.001, 7);
    expect(Math.abs(a - b)).toBeLessThan(0.001);
  });
});

describe('lightAt across walls', () => {
  /** 21×21 lit room, a full wall on column 11, everything east of it unpowered. */
  function split() {
    const g = createGrid(21, 21);
    for (let y = 1; y <= 19; y++) for (let x = 1; x <= 19; x++) setCell(g, x, y, Cell.Floor);
    for (let y = 1; y <= 19; y++) setCell(g, 11, y, Cell.Wall);
    for (let y = 1; y <= 19; y++) for (let x = 12; x <= 19; x++) g.dark[y * 21 + x] = 1;
    return g;
  }

  it('never lets light bleed through a wall: each face gets its own room light', () => {
    const g = split();
    const light = createLightField(g);
    const face = WALL_THICKNESS / 2 + 0.06;
    const litSide = lightAt(g, light, cellToWorld(11) - face, cellToWorld(10));
    const darkSide = lightAt(g, light, cellToWorld(11) + face, cellToWorld(10));
    expect(litSide).toBeGreaterThan(0.8);
    expect(darkSide).toBeLessThan(AMBIENT_DARK + 0.05);
    // Floor 1 m into the dark room is dark too.
    expect(lightAt(g, light, cellToWorld(11) + 1, cellToWorld(10))).toBeLessThan(AMBIENT_DARK + 0.05);
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
