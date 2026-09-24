import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { buildRooms, connectRooms, DEFAULT_GEN } from '../../src/world/generator';
import { Cell, createGrid, getCell } from '../../src/world/grid';
import { bfsDistances } from '../../src/world/pathing';

function build(seed = 1) {
  const grid = createGrid(DEFAULT_GEN.width, DEFAULT_GEN.height);
  const rng = createRng(seed);
  const rooms = buildRooms(grid, rng, DEFAULT_GEN);
  return { grid, rng, rooms };
}

describe('buildRooms', () => {
  it('keeps the outer border solid wall', () => {
    const { grid } = build();
    for (let i = 0; i < grid.width; i++) {
      expect(getCell(grid, i, 0)).toBe(Cell.Wall);
      expect(getCell(grid, i, grid.height - 1)).toBe(Cell.Wall);
      expect(getCell(grid, 0, i)).toBe(Cell.Wall);
      expect(getCell(grid, grid.width - 1, i)).toBe(Cell.Wall);
    }
  });

  it('carves every room cell as floor or pillar tagged with its room id', () => {
    const { grid, rooms } = build();
    for (const r of rooms) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          expect(getCell(grid, x, y)).not.toBe(Cell.Wall);
          expect(grid.room[y * grid.width + x]).toBe(r.id);
        }
      }
    }
  });

  it('bounds non-corridor rooms by maxLeaf and produces corridors and pillared halls', () => {
    const { rooms } = build();
    const corridors = rooms.filter((r) => Math.min(r.w, r.h) === 2);
    const normal = rooms.filter((r) => Math.min(r.w, r.h) > 2);
    for (const r of normal) {
      expect(r.w).toBeLessThanOrEqual(DEFAULT_GEN.maxLeaf - 1);
      expect(r.h).toBeLessThanOrEqual(DEFAULT_GEN.maxLeaf - 1);
    }
    expect(corridors.length).toBeGreaterThan(0);
    expect(rooms.some((r) => r.pillared)).toBe(true);
  });

  it('never places a pillar on a room edge (doorways stay clear)', () => {
    const { grid, rooms } = build();
    for (const r of rooms) {
      for (let x = r.x; x < r.x + r.w; x++) {
        expect(getCell(grid, x, r.y)).toBe(Cell.Floor);
        expect(getCell(grid, x, r.y + r.h - 1)).toBe(Cell.Floor);
      }
      for (let y = r.y; y < r.y + r.h; y++) {
        expect(getCell(grid, r.x, y)).toBe(Cell.Floor);
        expect(getCell(grid, r.x + r.w - 1, y)).toBe(Cell.Floor);
      }
    }
  });
});

describe('connectRooms', () => {
  it('makes every floor cell reachable from every other', () => {
    const { grid, rng, rooms } = build();
    connectRooms(grid, rooms, rng, DEFAULT_GEN);
    const first = rooms[0];
    const d = bfsDistances(grid, first.x, first.y);
    for (let i = 0; i < grid.cells.length; i++) {
      if (grid.cells[i] === Cell.Floor) expect(d[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('carves extra doorways beyond a spanning tree so the map has loops', () => {
    const { grid, rng, rooms } = build();
    const doors = connectRooms(grid, rooms, rng, DEFAULT_GEN);
    expect(doors).toBeGreaterThan(rooms.length - 1);
  });
});
