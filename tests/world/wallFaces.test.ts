import { describe, expect, it } from 'vitest';
import { Cell, createGrid, type Grid, PILLAR_SIZE, setCell } from '../../src/world/grid';
import { solidRects, WALL_THICKNESS } from '../../src/world/solids';
import { type WallQuad, wallQuads } from '../../src/world/wallFaces';

/** 12×12 floor with no border, so only hand-placed solids exist. */
function open(): Grid {
  const g = createGrid(12, 12);
  g.cells.fill(Cell.Floor);
  return g;
}

const len = (q: WallQuad) => Math.hypot(q.x1 - q.x0, q.z1 - q.z0);

describe('wallQuads', () => {
  it('turns a straight wall into two long faces (one per side) with continuous u, plus two end caps', () => {
    const g = open();
    for (let x = 2; x <= 5; x++) setCell(g, x, 4, Cell.Wall); // x 4..12 m, centre z = 9
    const quads = wallQuads(g, 0, 0, 12);
    const long = quads.filter((q) => len(q) > 1);
    expect(long).toHaveLength(2);
    for (const q of long) {
      expect(len(q)).toBeCloseTo(6 + WALL_THICKNESS, 6); // post-to-post: 5 m + 1 m (end cells reach centre ± h)
      expect(Math.abs(q.u1 - q.u0)).toBeCloseTo(len(q), 6);
      expect(Math.abs(q.nz)).toBe(1);
    }
    const caps = quads.filter((q) => len(q) <= 1);
    expect(caps).toHaveLength(2);
    for (const q of caps) expect(len(q)).toBeCloseTo(WALL_THICKNESS, 6);
  });

  it('never emits a face that lies inside or flush against another solid', () => {
    const g = open();
    // An L plus a T junction.
    for (let x = 2; x <= 6; x++) setCell(g, x, 3, Cell.Wall);
    for (let y = 4; y <= 7; y++) setCell(g, 2, y, Cell.Wall);
    for (let y = 4; y <= 6; y++) setCell(g, 4, y, Cell.Wall);
    const rects = [];
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) rects.push(...solidRects(g, x, y));
    for (const q of wallQuads(g, 0, 0, 12)) {
      // Sample a point just in front of the middle of the face: it must be open space.
      const px = (q.x0 + q.x1) / 2 + q.nx * 0.01;
      const pz = (q.z0 + q.z1) / 2 + q.nz * 0.01;
      const inside = rects.some((r) => px > r.minX && px < r.maxX && pz > r.minZ && pz < r.maxZ);
      expect(inside).toBe(false);
    }
  });

  it('gives a column four faces, wound so u runs left to right seen from outside', () => {
    const g = open();
    setCell(g, 5, 5, Cell.Pillar);
    const quads = wallQuads(g, 0, 0, 12);
    expect(quads).toHaveLength(4);
    for (const q of quads) {
      expect(len(q)).toBeCloseTo(PILLAR_SIZE, 6);
      // A viewer facing the wall looks along −n; their right-hand side is (nz, −nx).
      const ex = q.x1 - q.x0;
      const ez = q.z1 - q.z0;
      expect(ex * q.nz - ez * q.nx).toBeGreaterThan(0);
      expect(q.u1).toBeGreaterThan(q.u0);
    }
  });

  it('only includes solids from the requested chunk', () => {
    const g = open();
    setCell(g, 1, 1, Cell.Pillar);
    setCell(g, 9, 9, Cell.Pillar);
    expect(wallQuads(g, 0, 0, 6)).toHaveLength(4);
    expect(wallQuads(g, 1, 1, 6)).toHaveLength(4);
  });
});
