import { describe, expect, it } from 'vitest';
import { Cell, createGrid, type Grid, PILLAR_SIZE, setCell } from '../../src/world/grid';
import { solidRects, WALL_THICKNESS } from '../../src/world/solids';
import { faceStyle, outletSpots, type WallQuad, wallQuads } from '../../src/world/wallFaces';

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

describe('wallQuads at junctions (no holes)', () => {
  /** Is the point (x, z) on the room side covered by some face with normal (nx, nz) at plane c? */
  function covered(quads: WallQuad[], axis: 'x' | 'z', c: number, sign: number, t: number): boolean {
    return quads.some((q) => {
      if (axis === 'z' ? q.nz !== sign || Math.abs(q.z0 - c) > 1e-6 : q.nx !== sign || Math.abs(q.x0 - c) > 1e-6) return false;
      const [a, b] = axis === 'z' ? [Math.min(q.x0, q.x1), Math.max(q.x0, q.x1)] : [Math.min(q.z0, q.z1), Math.max(q.z0, q.z1)];
      return t > a && t < b;
    });
  }

  it('builds the border wall face on both sides of a wall that runs into it (the T at the map edge)', () => {
    // Floor everywhere except the bottom border row (y = 7) and a wall column x = 4 running into it.
    const g = createGrid(9, 8);
    for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) setCell(g, x, y, Cell.Floor);
    for (let y = 4; y < 7; y++) setCell(g, 4, y, Cell.Wall);
    const quads = wallQuads(g, 0, 0, 16);
    const face = 7 * 2 + 1 - WALL_THICKNESS / 2; // the border wall's room-side face (z)
    // Just left and right of the joining wall's slab (centred at x = 9).
    expect(covered(quads, 'z', face, -1, 8.3)).toBe(true);
    expect(covered(quads, 'z', face, -1, 9.7)).toBe(true);
  });

  it('builds all four corner faces of a cross junction', () => {
    const g = open();
    for (let x = 2; x <= 6; x++) setCell(g, x, 4, Cell.Wall);
    for (let y = 2; y <= 6; y++) setCell(g, 4, y, Cell.Wall);
    const quads = wallQuads(g, 0, 0, 16);
    const h = WALL_THICKNESS / 2;
    // The cross centre is (9, 9); its arms' faces must reach right up to the crossing.
    expect(covered(quads, 'z', 9 - h, -1, 8.5)).toBe(true);
    expect(covered(quads, 'z', 9 + h, 1, 9.5)).toBe(true);
    expect(covered(quads, 'x', 9 - h, -1, 9.5)).toBe(true);
    expect(covered(quads, 'x', 9 + h, 1, 8.5)).toBe(true);
  });
});

describe('outletSpots', () => {
  function hall(): Grid {
    const g = open();
    for (let x = 0; x < 12; x++) setCell(g, x, 2, Cell.Wall);
    for (let x = 0; x < 12; x++) setCell(g, x, 9, Cell.Wall);
    return g;
  }

  it('puts outlets on long wall faces only, away from the ends, flush in front of the face', () => {
    const quads = wallQuads(hall(), 0, 0, 12);
    const spots = outletSpots(quads);
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots) {
      const q = quads.find((q) => q === s.quad)!;
      const len = Math.hypot(q.x1 - q.x0, q.z1 - q.z0);
      expect(len).toBeGreaterThanOrEqual(1.2);
      const t = ((s.x - q.x0) * (q.x1 - q.x0) + (s.z - q.z0) * (q.z1 - q.z0)) / (len * len);
      expect(t).toBeGreaterThanOrEqual(0.15);
      expect(t).toBeLessThanOrEqual(0.85);
      expect([s.nx, s.nz]).toEqual([q.nx, q.nz]);
    }
  });

  it('is sparse (about one per 6 m of wall) and deterministic', () => {
    const quads = wallQuads(hall(), 0, 0, 12);
    const total = quads.reduce((m, q) => m + Math.hypot(q.x1 - q.x0, q.z1 - q.z0), 0);
    const spots = outletSpots(quads);
    expect(spots.length).toBeLessThanOrEqual(Math.ceil(total / 4));
    expect(outletSpots(quads)).toEqual(spots);
  });
});

describe('faceStyle', () => {
  /** Two rooms side by side (ids 1 and 2) split by a wall on x = 6, with a column in room 1. */
  function rooms(): Grid {
    const g = createGrid(12, 8);
    for (let y = 1; y < 7; y++) {
      for (let x = 1; x < 11; x++) {
        if (x === 6) continue;
        setCell(g, x, y, Cell.Floor);
        g.room[y * 12 + x] = x < 6 ? 1 : 2;
      }
    }
    setCell(g, 3, 3, Cell.Pillar);
    g.room[3 * 12 + 3] = -1;
    return g;
  }

  it('gives every face that looks into one room the same paper and rail choice', () => {
    const g = rooms();
    const quads = wallQuads(g, 0, 0, 12);
    const intoRoom1 = quads.filter((q) => {
      // The floor cell in front of the face (the wall cell itself has no room id).
      const x = Math.floor(((q.x0 + q.x1) / 2 + q.nx * 1.2) / 2);
      const z = Math.floor(((q.z0 + q.z1) / 2 + q.nz * 1.2) / 2);
      return g.room[z * 12 + x] === 1 && Math.hypot(q.x1 - q.x0, q.z1 - q.z0) > 1.1;
    });
    expect(intoRoom1.length).toBeGreaterThan(3);
    const styles = intoRoom1.map((q) => faceStyle(g, q));
    for (const s of styles) {
      expect(s.paper).toBe(styles[0].paper);
      expect(s.rail).toBe(styles[0].rail);
    }
  });

  it('never puts a rail on a column or on a short wall end', () => {
    const g = rooms();
    for (const q of wallQuads(g, 0, 0, 12)) {
      const len = Math.hypot(q.x1 - q.x0, q.z1 - q.z0);
      const behindX = Math.floor(((q.x0 + q.x1) / 2 - q.nx * 0.05) / 2);
      const behindZ = Math.floor(((q.z0 + q.z1) / 2 - q.nz * 0.05) / 2);
      const isColumn = g.cells[behindZ * 12 + behindX] === Cell.Pillar;
      if (isColumn || len < 0.5) expect(faceStyle(g, q).rail).toBe(false);
    }
  });

  it('dresses a column in its room\'s paper on all four faces', () => {
    const g = rooms();
    const column = wallQuads(g, 0, 0, 12).filter((q) => Math.abs((q.x0 + q.x1) / 2 - 7) < 0.6 && Math.abs((q.z0 + q.z1) / 2 - 7) < 0.6);
    expect(column).toHaveLength(4);
    const papers = new Set(column.map((q) => faceStyle(g, q).paper));
    expect(papers.size).toBe(1);
  });
});
