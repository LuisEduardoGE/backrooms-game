import { describe, expect, it } from 'vitest';
import { bfsDistances } from '../../src/world/pathing';
import { furnishRooms, type PropPlacement } from '../../src/world/furnishing';
import { generateLevel } from '../../src/world/generator';
import { Cell, CELL_SIZE, getCell, type Grid, worldToCell } from '../../src/world/grid';

/** The floor cell a prop belongs to (a prop against a wall stands in the wall cell's open half). */
const cellOf = (p: PropPlacement) => p.cell;

/** Floor cells whose centre lies inside a prop's collider (can't be stood in). */
function blockedCells(grid: Grid, props: PropPlacement[]): Set<number> {
  const out = new Set<number>();
  for (const p of props) {
    if (!p.collide) continue;
    for (let y = worldToCell(p.collide.minZ); y <= worldToCell(p.collide.maxZ); y++) {
      for (let x = worldToCell(p.collide.minX); x <= worldToCell(p.collide.maxX); x++) {
        const cx = (x + 0.5) * CELL_SIZE;
        const cz = (y + 0.5) * CELL_SIZE;
        if (cx > p.collide.minX && cx < p.collide.maxX && cz > p.collide.minZ && cz < p.collide.maxZ) out.add(y * grid.width + x);
      }
    }
  }
  return out;
}

describe('furnishRooms', () => {
  const level = generateLevel(42);
  const reserved = new Set<number>([level.start.y * level.grid.width + level.start.x, level.exit.y * level.grid.width + level.exit.x]);
  const props = furnishRooms(level, reserved);

  it('is deterministic for a level', () => {
    expect(furnishRooms(level, reserved)).toEqual(props);
  });

  it('furnishes rooms differently: several themes appear and many rooms stay bare', () => {
    const themes = new Set(props.map((p) => p.theme));
    expect(themes.size).toBeGreaterThanOrEqual(4);
    const furnishedRooms = new Set(props.map((p) => p.room));
    expect(furnishedRooms.size).toBeGreaterThan(level.rooms.length * 0.3);
    expect(furnishedRooms.size).toBeLessThan(level.rooms.length * 0.8);
  });

  it('only stands on the floor of its own room, never on reserved cells', () => {
    for (const p of props) {
      const c = cellOf(p);
      expect(getCell(level.grid, c.x, c.y)).toBe(Cell.Floor);
      expect(level.grid.room[c.y * level.grid.width + c.x]).toBe(p.room);
      expect(reserved.has(c.y * level.grid.width + c.x)).toBe(false);
    }
  });

  it('keeps doorways clear: nothing in a cell next to a doorway or another room', () => {
    const W = level.grid.width;
    for (const p of props) {
      const c = cellOf(p);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = c.x + dx;
          const y = c.y + dy;
          if (getCell(level.grid, x, y) !== Cell.Floor) continue;
          expect(level.grid.room[y * W + x]).toBe(p.room);
        }
      }
    }
  });

  it('never cuts the map: every free floor cell stays reachable around the props', () => {
    const blocked = blockedCells(level.grid, props);
    const grid = level.grid;
    const walkable = { ...grid, cells: Uint8Array.from(grid.cells, (c, i) => (blocked.has(i) ? Cell.Wall : c)) };
    const d = bfsDistances(walkable, level.start.x, level.start.y);
    for (let i = 0; i < grid.cells.length; i++) if (walkable.cells[i] === Cell.Floor) expect(d[i]).toBeGreaterThanOrEqual(0);
  });

  it('makes every piece of furniture solid: each stands inside a collider (its own, the heap it belongs to, or the one it is stacked on)', () => {
    const rects = props.flatMap((p) => (p.collide ? [p.collide] : []));
    for (const p of props) {
      const inside = rects.some((r) => p.x >= r.minX - 0.05 && p.x <= r.maxX + 0.05 && p.z >= r.minZ - 0.05 && p.z <= r.maxZ + 0.05);
      expect(inside, `${p.kind} (${p.theme}) at ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBe(true);
    }
  });
});
