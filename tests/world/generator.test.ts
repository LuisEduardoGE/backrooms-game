import { describe, expect, it } from 'vitest';
import { DEFAULT_GEN, generateLevel, segmentWalls } from '../../src/world/generator';
import { createRng } from '../../src/core/rng';
import { Cell, createGrid, DIR_STEP, getCell, isDark, setCell } from '../../src/world/grid';
import { bfsDistances } from '../../src/world/pathing';
import { hasFullFace } from '../../src/world/solids';

describe('generateLevel', () => {
  it('is deterministic for a seed', () => {
    const a = generateLevel(1234);
    const b = generateLevel(1234);
    expect(Array.from(a.grid.cells)).toEqual(Array.from(b.grid.cells));
    expect(Array.from(a.grid.dark)).toEqual(Array.from(b.grid.dark));
    expect(a.start).toEqual(b.start);
    expect(a.exit).toEqual(b.exit);
    expect(a.seed).toBe(1234);
  });

  it('differs between seeds', () => {
    const a = generateLevel(1);
    const b = generateLevel(2);
    expect(Array.from(a.grid.cells)).not.toEqual(Array.from(b.grid.cells));
  });

  it('spawns on plain, lit floor (never inside a wall/pillar or in the dark)', () => {
    for (let seed = 0; seed < 10; seed++) {
      const { grid, start } = generateLevel(seed);
      expect(getCell(grid, start.x, start.y)).toBe(Cell.Floor);
      expect(isDark(grid, start.x, start.y)).toBe(false);
    }
  });

  it('puts the exit far away, reachable, lit, and against a wall', () => {
    const { grid, start, exit } = generateLevel(99);
    const d = bfsDistances(grid, start.x, start.y);
    expect(d[exit.y * grid.width + exit.x]).toBeGreaterThan(0);
    expect(Math.hypot(exit.x - start.x, exit.y - start.y)).toBeGreaterThanOrEqual(
      DEFAULT_GEN.width * DEFAULT_GEN.exitDistanceRatio,
    );
    expect(isDark(grid, exit.x, exit.y)).toBe(false);
    const neighbours = [
      getCell(grid, exit.x + 1, exit.y),
      getCell(grid, exit.x - 1, exit.y),
      getCell(grid, exit.x, exit.y + 1),
      getCell(grid, exit.x, exit.y - 1),
    ];
    expect(neighbours).toContain(Cell.Wall);
  });

  it('makes roughly 15% of the floor dark', () => {
    const { grid } = generateLevel(7);
    let floor = 0;
    let dark = 0;
    for (let i = 0; i < grid.cells.length; i++) {
      if (grid.cells[i] !== Cell.Floor) continue;
      floor++;
      if (grid.dark[i]) dark++;
    }
    expect(dark / floor).toBeGreaterThanOrEqual(0.15);
    expect(dark / floor).toBeLessThan(0.25);
  });

  it('produces a valid level for 25 consecutive seeds', () => {
    for (let seed = 1000; seed < 1025; seed++) {
      expect(() => generateLevel(seed)).not.toThrow();
    }
  });

  it('throws a clear error when no layout can satisfy the exit distance', () => {
    expect(() => generateLevel(1, { exitDistanceRatio: 5 })).toThrow(/no valid layout/);
  });

  it('faces the spawn toward the longest open run of floor (never into a wall)', () => {
    const run = (grid: ReturnType<typeof generateLevel>['grid'], x: number, y: number, dx: number, dy: number) => {
      let n = 0;
      while (getCell(grid, x + dx * (n + 1), y + dy * (n + 1)) === Cell.Floor) n++;
      return n;
    };
    for (let seed = 2000; seed < 2025; seed++) {
      const { grid, start, startYaw } = generateLevel(seed);
      const dx = Math.round(-Math.sin(startYaw));
      const dy = Math.round(-Math.cos(startYaw));
      const ahead = run(grid, start.x, start.y, dx, dy);
      expect(ahead).toBeGreaterThan(0);
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        expect(ahead).toBeGreaterThanOrEqual(run(grid, start.x, start.y, ox, oy));
      }
    }
  });

  it('groups dark rooms into a few connected regions (spec §5: contiguous dark zones)', () => {
    for (const seed of [7, 42, 1234]) {
      const { grid } = generateLevel(seed);
      const seen = new Uint8Array(grid.cells.length);
      let regions = 0;
      for (let i = 0; i < grid.cells.length; i++) {
        if (!grid.dark[i] || seen[i]) continue;
        regions++;
        const stack = [i];
        seen[i] = 1;
        while (stack.length > 0) {
          const c = stack.pop()!;
          const x = c % grid.width;
          const y = (c - x) / grid.width;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = (y + dy) * grid.width + (x + dx);
            if (grid.dark[n] && !seen[n]) {
              seen[n] = 1;
              stack.push(n);
            }
          }
        }
      }
      expect(regions).toBeGreaterThanOrEqual(1);
      expect(regions).toBeLessThanOrEqual(8);
    }
  });

  it('never puts the exit in a doorway and records which wall is the noclip wall', () => {
    for (let seed = 3000; seed < 3025; seed++) {
      const { grid, exit, exitSide } = generateLevel(seed);
      expect(grid.room[exit.y * grid.width + exit.x]).toBeGreaterThanOrEqual(0);
      const step = DIR_STEP[exitSide];
      expect(getCell(grid, exit.x + step.x, exit.y + step.y)).toBe(Cell.Wall);
      expect(hasFullFace(grid, exit.x, exit.y, exitSide)).toBe(true);
    }
  });

  it('opens the map up into big halls with leftover partitions (Level 0 is open office space, not closed rooms)', () => {
    const walls = (lv: ReturnType<typeof generateLevel>) => {
      let n = 0;
      for (let y = 1; y < lv.grid.height - 1; y++) for (let x = 1; x < lv.grid.width - 1; x++) if (getCell(lv.grid, x, y) === Cell.Wall) n++;
      return n;
    };
    for (const seed of [7, 42]) {
      const open = generateLevel(seed);
      const closed = generateLevel(seed, { mergeChance: 0, widenChance: 0 });
      expect(walls(open)).toBeLessThan(walls(closed) * 0.85);
    }
  });

  it('keeps every floor cell reachable after opening up', () => {
    for (const seed of [7, 42, 99]) {
      const { grid, start } = generateLevel(seed);
      const d = bfsDistances(grid, start.x, start.y);
      for (let i = 0; i < grid.cells.length; i++) if (grid.cells[i] === Cell.Floor) expect(d[i]).toBeGreaterThanOrEqual(0);
    }
  });
});


describe('room structures', () => {
  /** Wall cells not connected (8-way) to the outer border's wall network: free-standing structures. */
  function freeStanding(grid: ReturnType<typeof generateLevel>['grid']): number {
    const W = grid.width;
    const seen = new Uint8Array(grid.cells.length);
    const stack: number[] = [];
    for (let x = 0; x < W; x++) stack.push(x, (grid.height - 1) * W + x);
    for (let y = 0; y < grid.height; y++) stack.push(y * W, y * W + W - 1);
    while (stack.length) {
      const i = stack.pop()!;
      if (seen[i] || grid.cells[i] !== Cell.Wall) continue;
      seen[i] = 1;
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < grid.height) stack.push(ny * W + nx);
      }
    }
    let n = 0;
    for (let i = 0; i < grid.cells.length; i++) if (grid.cells[i] === Cell.Wall && !seen[i]) n++;
    return n;
  }

  it('furnishes some rooms with free-standing partitions and blocks (the photo, Kane Pixels)', () => {
    for (const seed of [7, 42]) {
      const plain = generateLevel(seed, { structureChance: 0 });
      const furnished = generateLevel(seed);
      expect(freeStanding(furnished.grid)).toBeGreaterThan(freeStanding(plain.grid) + 25);
    }
  });

  it('keeps a walkable ring around every structure, so everything stays reachable', () => {
    for (const seed of [3, 11]) {
      const { grid, start } = generateLevel(seed);
      const d = bfsDistances(grid, start.x, start.y);
      for (let i = 0; i < grid.cells.length; i++) if (grid.cells[i] === Cell.Floor) expect(d[i]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('halls (zones)', () => {
  it('gives rooms merged into one hall a single zone, so the hall is dressed as one space', () => {
    for (const seed of [7, 42]) {
      const { grid } = generateLevel(seed);
      const W = grid.width;
      let merged = 0;
      for (let y = 1; y < grid.height - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const z = grid.zone[y * W + x];
          if (z < 0) continue;
          for (const [dx, dy] of [[1, 0], [0, 1]]) {
            const n = grid.zone[(y + dy) * W + x + dx];
            if (n < 0) continue;
            expect(n).toBe(z);
            if (grid.room[y * W + x] !== grid.room[(y + dy) * W + x + dx]) merged++;
          }
        }
      }
      // Merges happened (so the check above really compared cells from different rooms).
      expect(merged).toBeGreaterThan(10);
    }
  });
});

describe('segmented walls', () => {
  /** Two 24×6 rooms (ids 0 and 1) stacked, sharing a 24-cell wall on row 7. */
  function twoRooms() {
    const g = createGrid(26, 15);
    for (let y = 1; y <= 13; y++) {
      for (let x = 1; x <= 24; x++) {
        if (y === 7) continue;
        setCell(g, x, y, Cell.Floor);
        g.room[y * 26 + x] = y < 7 ? 0 : 1;
      }
    }
    return g;
  }

  it('breaks a long wall between rooms into segments ("randomly segmented rooms")', () => {
    const g = twoRooms();
    segmentWalls(g, createRng(3), { ...DEFAULT_GEN, segmentChance: 1 });
    const open = Array.from({ length: 24 }, (_, i) => getCell(g, i + 1, 7) === Cell.Floor);
    // Several openings, each 1–2 cells, none at the wall's ends, never two touching.
    const runs: number[] = [];
    let len = 0;
    for (const o of [...open, false]) {
      if (o) len++;
      else if (len) {
        runs.push(len);
        len = 0;
      }
    }
    expect(runs.length).toBeGreaterThanOrEqual(2);
    for (const r of runs) expect(r).toBeLessThanOrEqual(2);
    expect(open[0]).toBe(false);
    expect(open[23]).toBe(false);
  });

  it('leaves walls whole when segmenting is off', () => {
    const g = twoRooms();
    segmentWalls(g, createRng(3), { ...DEFAULT_GEN, segmentChance: 0 });
    for (let x = 1; x <= 24; x++) expect(getCell(g, x, 7)).toBe(Cell.Wall);
  });
});

describe('openness (tuned 2026-09-26)', () => {
  /** Wall pieces vs openings along wall lines between different halls, exits per room, sightlines. */
  function measure(seed: number) {
    const { grid, rooms } = generateLevel(seed);
    const W = grid.width;
    const c = (x: number, y: number) => grid.cells[y * W + x];
    const walls: number[] = [];
    const gaps: number[] = [];
    for (let y = 1; y < grid.height - 1; y++) {
      let kind = -1;
      let len = 0;
      const flush = () => {
        if (len) (kind === 1 ? walls : gaps).push(len);
        len = 0;
      };
      for (let x = 1; x < W - 1; x++) {
        const a = grid.room[(y - 1) * W + x];
        const b = grid.room[(y + 1) * W + x];
        const line = a >= 0 && b >= 0 && a !== b && grid.zone[(y - 1) * W + x] !== grid.zone[(y + 1) * W + x];
        if (!line) {
          flush();
          kind = -1;
          continue;
        }
        const k = c(x, y) === Cell.Wall ? 1 : 0;
        if (k !== kind) {
          flush();
          kind = k;
        }
        len++;
      }
      flush();
    }
    const exits = new Map<number, Set<number>>();
    const link = (a: number, b: number) => {
      if (a < 0 || b < 0 || a === b) return;
      (exits.get(a) ?? exits.set(a, new Set()).get(a)!).add(b);
      (exits.get(b) ?? exits.set(b, new Set()).get(b)!).add(a);
    };
    for (let y = 1; y < grid.height - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (c(x, y) !== Cell.Floor || grid.room[y * W + x] >= 0) continue;
        link(grid.room[y * W + x - 1], grid.room[y * W + x + 1]);
        link(grid.room[(y - 1) * W + x], grid.room[(y + 1) * W + x]);
      }
    }
    const sight: number[] = [];
    for (let i = 0; i < grid.cells.length; i += 7) {
      if (grid.cells[i] !== Cell.Floor) continue;
      const x0 = i % W;
      const y0 = (i - x0) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let n = 0;
        while (c(x0 + dx * (n + 1), y0 + dy * (n + 1)) === Cell.Floor) n++;
        sight.push(n * 2);
      }
    }
    const sorted = (a: number[]) => [...a].sort((p, q) => p - q);
    return {
      wall: sorted(walls)[walls.length >> 1],
      gap: sorted(gaps)[gaps.length >> 1],
      twoExits: rooms.filter((r) => (exits.get(r.id)?.size ?? 0) >= 2).length / rooms.length,
      farSight: sorted(sight)[Math.floor(sight.length * 0.9)],
    };
  }

  it('walls read as walls: pieces between openings are at least twice as long as the openings', () => {
    for (const seed of [7, 42]) {
      const m = measure(seed);
      expect(m.wall).toBeGreaterThanOrEqual(2 * m.gap);
    }
  });

  it('stays a maze you can move through: 90 %+ of rooms have two or more exits, with long sightlines', () => {
    for (const seed of [7, 42]) {
      const m = measure(seed);
      expect(m.twoExits).toBeGreaterThanOrEqual(0.9);
      expect(m.farSight).toBeGreaterThanOrEqual(20);
    }
  });
});
