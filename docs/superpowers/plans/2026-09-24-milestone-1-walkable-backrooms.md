# Milestone 1 — Walkable Backrooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser build where the player clicks in and walks (WASD + mouse, sprint, crouch) through an endless-feeling, seeded, procedurally generated Level 0 — yellow wallpaper, damp carpet, drop ceilings with flickering fluorescent panels, fog — at 60 fps.

**Architecture:** Pure, Three.js-free TypeScript modules own every decision (seeded RNG, grid generation, BFS, collision, player movement, fixed-step timing, chunk math, light selection, flicker) and are unit-tested with Vitest. Thin Three.js modules render that state: instanced meshes per 16×16-cell chunk streamed around the player, procedural canvas textures, a pool of 6 point lights, exponential fog. `main.ts` wires it together.

**Tech Stack:** TypeScript (strict), Vite, Three.js, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-level-0-design.md` (this plan implements Milestone 1 of §10; clue/item placement from §5 step 5 is deferred to the Milestone 3 plan).

## Global Constraints

- Desktop browsers only; keyboard + mouse with Pointer Lock.
- TypeScript `strict`; no `any` in `src/`.
- Pure-logic modules must not import `three`: `src/core/*`, `src/world/grid.ts`, `src/world/generator.ts`, `src/world/pathing.ts`, `src/world/chunks.ts`, `src/player/*`, `src/lighting/lights.ts`, `src/ui/params.ts`.
- All gameplay randomness derives from the run seed via `createRng` / `deriveSeed`; never call `Math.random()` except to choose a fresh run seed in `main.ts`.
- Grid: 200×200 cells, 1 cell = 2 m (`CELL_SIZE = 2`), wall height 2.7 m.
- Chunks: 16×16 cells, load radius 3 chunks.
- Exit: straight-line distance ≥ 140 cells (70 % of grid width) from start, reachable by path.
- Dark zones: ~15 % of floor area; the start room is never dark.
- Collision is circle-vs-grid (player radius 0.3 m); no physics engine.
- Controls: WASD/arrows move, mouse look, Shift sprint, **C** crouch (not Ctrl — Ctrl+W closes the tab).
- Performance budget: 60 fps on a mid-range laptop.
- Every asset is self-made or CC0/licensed and listed in `public/CREDITS.md`.
- If `npm install` fails with a certificate error on this machine, prefix the command with `NODE_OPTIONS=--use-system-ca`.

## Review Focus

1. **Seeds that can't place a valid exit** — generation must reroll a bounded number of times and never hang; every one of 25 consecutive seeds must yield a valid level. (Test: Task 3.)
2. **Spawning inside geometry or in the dark** — the start cell must be plain floor (not wall or pillar) and not in a dark zone. (Test: Task 3.)
3. **Huge frame gaps** (tab switched away, debugger pause) — the fixed-step loop must cap catch-up steps and drop the backlog, never spiral or teleport the player through walls. (Test: Task 6.)
4. **Stuck keys** after the window loses focus or pointer lock is released mid-keypress — held keys must be cleared so the player doesn't keep running. (Test: Task 6.)
5. **Garbage `?seed=` values** (`abc`, `-5`, `1.5`, `99999999999`, empty) — must be ignored in favour of a random seed, not produce `NaN` levels. (Test: Task 10.)

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, index.html
public/CREDITS.md
src/
  main.ts                 wiring: renderer, scene, loop (Tasks 8–10)
  style.css               overlay + debug HUD styles
  core/rng.ts             seeded PRNG + seed derivation           (Task 1)
  core/loop.ts            fixed-timestep stepper                  (Task 6)
  core/input.ts           keyboard/mouse state → MoveInput         (Task 6)
  world/grid.ts           grid types, cell access, world↔cell      (Task 2)
  world/pathing.ts        BFS distances                            (Task 2)
  world/generator.ts      rooms, doors, dark zones, start/exit     (Tasks 2–3)
  world/chunks.ts         chunk keys + load/unload diff            (Task 7)
  world/textures.ts       procedural canvas textures + materials   (Task 8)
  world/chunkMesh.ts      instanced meshes for one chunk           (Task 8)
  world/streamer.ts       loads/unloads chunk meshes               (Task 8)
  player/collision.ts     circle-vs-grid movement                  (Task 4)
  player/controller.ts    movement, gaits, look, eye height        (Task 5)
  lighting/lights.ts      light fixture layout, nearest lights, flicker (Tasks 7, 9)
  lighting/lightPool.ts   6 pooled THREE.PointLights               (Task 9)
  ui/params.ts            URL params (?debug, ?seed)               (Task 10)
  ui/debugHud.ts          fps / seed / minimap overlay             (Task 10)
tests/                    mirrors src/ (pure modules only)
```

---

### Task 1: Project scaffold + seeded RNG

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `src/core/rng.ts`
- Test: `tests/core/rng.test.ts`

**Interfaces:**
- Produces:
  - `interface Rng { next(): number; int(min: number, maxExclusive: number): number; range(min: number, max: number): number; chance(p: number): boolean; pick<T>(items: readonly T[]): T; shuffle<T>(items: T[]): T[] }`
  - `createRng(seed: number): Rng`
  - `deriveSeed(seed: number, label: string): number` — returns an unsigned 32-bit integer

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "backrooms-game",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install three && npm install -D vite typescript vitest @types/three`
Expected: `node_modules/` created, `package-lock.json` written, no errors.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 5: Write the failing test `tests/core/rng.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from '../../src/core/rng';

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const same = Array.from({ length: 20 }, () => a.next() === b.next()).filter(Boolean);
    expect(same.length).toBeLessThan(20);
  });

  it('next() stays in [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() stays in [min, maxExclusive) and hits both ends', () => {
    const r = createRng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(7);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('pick() throws on an empty array', () => {
    expect(() => createRng(1).pick([])).toThrow();
  });

  it('shuffle() returns a permutation of the same items', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = createRng(3).shuffle(items.slice());
    expect(shuffled.slice().sort()).toEqual(items);
  });
});

describe('deriveSeed', () => {
  it('is stable and label-dependent', () => {
    expect(deriveSeed(123, 'layout')).toBe(deriveSeed(123, 'layout'));
    expect(deriveSeed(123, 'layout')).not.toBe(deriveSeed(123, 'textures'));
    expect(deriveSeed(123, 'layout')).not.toBe(deriveSeed(124, 'layout'));
  });

  it('returns an unsigned 32-bit integer', () => {
    const s = deriveSeed(0xffffffff, 'x');
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run tests/core/rng.test.ts`
Expected: FAIL — cannot resolve `../../src/core/rng`.

- [ ] **Step 7: Implement `src/core/rng.ts`**

```ts
/** Seeded PRNG (mulberry32). Every gameplay random value must come from one of these. */
export interface Rng {
  next(): number;
  int(min: number, maxExclusive: number): number;
  range(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: T[]): T[];
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min, maxExclusive) => min + Math.floor(next() * (maxExclusive - min)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('Rng.pick: empty array');
      return items[Math.floor(next() * items.length)];
    },
    shuffle: (items) => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    },
  };
}

/** Derives an independent sub-seed (e.g. 'layout', 'textures') from the run seed. FNV-1a + avalanche. */
export function deriveSeed(seed: number, label: string): number {
  let h = (0x811c9dc5 ^ (seed >>> 0)) >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test`
Expected: all `rng.test.ts` tests PASS.

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (success).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts src/core/rng.ts tests/core/rng.test.ts
git commit -m "feat: scaffold Vite + TS + Vitest project with seeded RNG"
```

---

### Task 2: Grid, BFS, rooms and doorways

**Files:**
- Create: `src/world/grid.ts`, `src/world/pathing.ts`, `src/world/generator.ts`
- Test: `tests/world/grid.test.ts`, `tests/world/pathing.test.ts`, `tests/world/rooms.test.ts`

**Interfaces:**
- Consumes: `Rng`, `createRng` (Task 1)
- Produces (grid.ts):
  - `CELL_SIZE = 2`, `WALL_HEIGHT = 2.7`, `PILLAR_SIZE = 0.8`
  - `Cell = { Floor: 0, Wall: 1, Pillar: 2 }` and `type Cell`
  - `interface Point { x: number; y: number }`
  - `interface Grid { readonly width: number; readonly height: number; readonly cells: Uint8Array; readonly dark: Uint8Array; readonly room: Int32Array }`
  - `createGrid(width, height): Grid`, `inBounds(g, x, y): boolean`, `getCell(g, x, y): Cell` (out of bounds → `Cell.Wall`), `setCell(g, x, y, c): void`, `isSolid(g, x, y): boolean`, `isDark(g, x, y): boolean`, `cellToWorld(cell: number): number` (cell centre, metres), `worldToCell(metres: number): number`
- Produces (pathing.ts): `bfsDistances(grid: Grid, sx: number, sy: number): Int32Array` — steps per cell, `-1` unreachable; only `Cell.Floor` is passable.
- Produces (generator.ts):
  - `interface Room { id: number; x: number; y: number; w: number; h: number; pillared: boolean }` (carved floor rectangle)
  - `interface GenOptions { width; height; minLeaf; maxLeaf; corridorChance; keepBigLeafChance; extraConnectionRatio; pillarHallChance; darkFraction; exitDistanceRatio }` (all `number`)
  - `DEFAULT_GEN: GenOptions`
  - `buildRooms(grid: Grid, rng: Rng, o: GenOptions): Room[]`
  - `connectRooms(grid: Grid, rooms: Room[], rng: Rng, o: GenOptions): number` — returns doorways carved

- [ ] **Step 1: Write the failing test `tests/world/grid.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Cell, CELL_SIZE, cellToWorld, createGrid, getCell, inBounds, isDark, isSolid, setCell, worldToCell } from '../../src/world/grid';

describe('grid', () => {
  it('starts as all walls, not dark, no rooms', () => {
    const g = createGrid(4, 3);
    expect(g.cells.length).toBe(12);
    expect([...g.cells].every((c) => c === Cell.Wall)).toBe(true);
    expect([...g.dark].every((d) => d === 0)).toBe(true);
    expect([...g.room].every((r) => r === -1)).toBe(true);
  });

  it('treats out-of-bounds as solid wall', () => {
    const g = createGrid(4, 4);
    expect(inBounds(g, -1, 0)).toBe(false);
    expect(getCell(g, 4, 0)).toBe(Cell.Wall);
    expect(isSolid(g, 0, -1)).toBe(true);
  });

  it('sets and reads cells; pillars are solid, floor is not', () => {
    const g = createGrid(4, 4);
    setCell(g, 1, 2, Cell.Floor);
    setCell(g, 2, 2, Cell.Pillar);
    expect(getCell(g, 1, 2)).toBe(Cell.Floor);
    expect(isSolid(g, 1, 2)).toBe(false);
    expect(isSolid(g, 2, 2)).toBe(true);
  });

  it('reads the dark flag', () => {
    const g = createGrid(4, 4);
    g.dark[1 * 4 + 1] = 1;
    expect(isDark(g, 1, 1)).toBe(true);
    expect(isDark(g, 0, 0)).toBe(false);
  });

  it('converts between cells and world metres', () => {
    expect(cellToWorld(0)).toBe(CELL_SIZE / 2);
    expect(cellToWorld(3)).toBe(7);
    expect(worldToCell(7)).toBe(3);
    expect(worldToCell(5.999)).toBe(2);
    expect(worldToCell(-0.1)).toBe(-1);
  });
});
```

- [ ] **Step 2: Write the failing test `tests/world/pathing.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Cell, createGrid, setCell } from '../../src/world/grid';
import { bfsDistances } from '../../src/world/pathing';

function corridor() {
  // 7x3 grid with a straight floor corridor along y=1 from x=1..5
  const g = createGrid(7, 3);
  for (let x = 1; x <= 5; x++) setCell(g, x, 1, Cell.Floor);
  return g;
}

describe('bfsDistances', () => {
  it('counts steps along a corridor', () => {
    const g = corridor();
    const d = bfsDistances(g, 1, 1);
    expect(d[1 * 7 + 1]).toBe(0);
    expect(d[1 * 7 + 5]).toBe(4);
    expect(d[0]).toBe(-1);
  });

  it('is blocked by walls and pillars', () => {
    const g = corridor();
    setCell(g, 3, 1, Cell.Pillar);
    const d = bfsDistances(g, 1, 1);
    expect(d[1 * 7 + 2]).toBe(1);
    expect(d[1 * 7 + 4]).toBe(-1);
  });

  it('returns all -1 when starting on a wall', () => {
    const d = bfsDistances(corridor(), 0, 0);
    expect([...d].every((v) => v === -1)).toBe(true);
  });
});
```

- [ ] **Step 3: Write the failing test `tests/world/rooms.test.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/world`
Expected: FAIL — modules `grid`, `pathing`, `generator` not found.

- [ ] **Step 5: Implement `src/world/grid.ts`**

```ts
/** Metres per grid cell. */
export const CELL_SIZE = 2;
export const WALL_HEIGHT = 2.7;
/** Pillars are thinner than a cell, both visually and for collision. */
export const PILLAR_SIZE = 0.8;

export const Cell = { Floor: 0, Wall: 1, Pillar: 2 } as const;
export type Cell = (typeof Cell)[keyof typeof Cell];

export interface Point {
  x: number;
  y: number;
}

export interface Grid {
  readonly width: number;
  readonly height: number;
  /** Cell value per cell, row-major (index = y * width + x). */
  readonly cells: Uint8Array;
  /** 1 = unpowered (dark zone). */
  readonly dark: Uint8Array;
  /** Room id per cell; -1 for walls and doorways. */
  readonly room: Int32Array;
}

export function createGrid(width: number, height: number): Grid {
  return {
    width,
    height,
    cells: new Uint8Array(width * height).fill(Cell.Wall),
    dark: new Uint8Array(width * height),
    room: new Int32Array(width * height).fill(-1),
  };
}

export function inBounds(g: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.width && y < g.height;
}

export function getCell(g: Grid, x: number, y: number): Cell {
  return inBounds(g, x, y) ? (g.cells[y * g.width + x] as Cell) : Cell.Wall;
}

export function setCell(g: Grid, x: number, y: number, c: Cell): void {
  g.cells[y * g.width + x] = c;
}

export function isSolid(g: Grid, x: number, y: number): boolean {
  return getCell(g, x, y) !== Cell.Floor;
}

export function isDark(g: Grid, x: number, y: number): boolean {
  return inBounds(g, x, y) && g.dark[y * g.width + x] === 1;
}

/** Centre of a cell in world metres. Grid x → world X, grid y → world Z. */
export function cellToWorld(cell: number): number {
  return (cell + 0.5) * CELL_SIZE;
}

export function worldToCell(metres: number): number {
  return Math.floor(metres / CELL_SIZE);
}
```

- [ ] **Step 6: Implement `src/world/pathing.ts`**

```ts
import { Cell, type Grid, inBounds } from './grid';

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Breadth-first step distances from (sx, sy) over floor cells; -1 = unreachable. */
export function bfsDistances(grid: Grid, sx: number, sy: number): Int32Array {
  const { width, height } = grid;
  const dist = new Int32Array(width * height).fill(-1);
  if (!inBounds(grid, sx, sy) || grid.cells[sy * width + sx] !== Cell.Floor) return dist;

  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const start = sy * width + sx;
  dist[start] = 0;
  queue[tail++] = start;

  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(grid, nx, ny)) continue;
      const n = ny * width + nx;
      if (dist[n] !== -1 || grid.cells[n] !== Cell.Floor) continue;
      dist[n] = dist[i] + 1;
      queue[tail++] = n;
    }
  }
  return dist;
}
```

- [ ] **Step 7: Implement `src/world/generator.ts` (rooms + doorways)**

```ts
import type { Rng } from '../core/rng';
import { Cell, type Grid, getCell, setCell } from './grid';

export interface Room {
  id: number;
  /** Carved floor rectangle (cells). */
  x: number;
  y: number;
  w: number;
  h: number;
  pillared: boolean;
}

export interface GenOptions {
  width: number;
  height: number;
  /** Smallest partition leaf (cells, including its shared wall). */
  minLeaf: number;
  /** Leaves larger than this are always split. */
  maxLeaf: number;
  /** Chance a split inserts a 3-cell-wide corridor leaf spanning the whole parent. */
  corridorChance: number;
  /** Chance a splittable leaf ≤ maxLeaf is kept whole (bigger rooms). */
  keepBigLeafChance: number;
  /** Extra doorways beyond the spanning tree, as a fraction of room count. */
  extraConnectionRatio: number;
  /** Chance a room ≥ 7×7 gets a pillar lattice. */
  pillarHallChance: number;
  /** Target fraction of floor cells in dark zones. */
  darkFraction: number;
  /** Minimum start→exit straight-line distance as a fraction of width. */
  exitDistanceRatio: number;
}

export const DEFAULT_GEN: GenOptions = {
  width: 200,
  height: 200,
  minLeaf: 5,
  maxLeaf: 16,
  corridorChance: 0.12,
  keepBigLeafChance: 0.2,
  extraConnectionRatio: 0.2,
  pillarHallChance: 0.5,
  darkFraction: 0.15,
  exitDistanceRatio: 0.7,
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Binary space partition into leaves that tile the rect exactly. */
function partition(r: Rect, rng: Rng, o: GenOptions, out: Rect[]): void {
  const canCutX = r.w >= o.minLeaf * 2;
  const canCutY = r.h >= o.minLeaf * 2;
  const tooBig = r.w > o.maxLeaf || r.h > o.maxLeaf;
  if (!canCutX && !canCutY) {
    out.push(r);
    return;
  }
  if (!tooBig && rng.chance(o.keepBigLeafChance)) {
    out.push(r);
    return;
  }

  const cutX = canCutX && (!canCutY || r.w > r.h || (r.w === r.h && rng.chance(0.5)));
  const len = cutX ? r.w : r.h;

  if (len >= o.minLeaf * 2 + 3 && rng.chance(o.corridorChance)) {
    const s = rng.int(o.minLeaf, len - o.minLeaf - 3 + 1);
    const [a, corridor, b]: Rect[] = cutX
      ? [
          { x: r.x, y: r.y, w: s, h: r.h },
          { x: r.x + s, y: r.y, w: 3, h: r.h },
          { x: r.x + s + 3, y: r.y, w: r.w - s - 3, h: r.h },
        ]
      : [
          { x: r.x, y: r.y, w: r.w, h: s },
          { x: r.x, y: r.y + s, w: r.w, h: 3 },
          { x: r.x, y: r.y + s + 3, w: r.w, h: r.h - s - 3 },
        ];
    partition(a, rng, o, out);
    out.push(corridor);
    partition(b, rng, o, out);
    return;
  }

  const s = rng.int(o.minLeaf, len - o.minLeaf + 1);
  const [a, b]: Rect[] = cutX
    ? [
        { x: r.x, y: r.y, w: s, h: r.h },
        { x: r.x + s, y: r.y, w: r.w - s, h: r.h },
      ]
    : [
        { x: r.x, y: r.y, w: r.w, h: s },
        { x: r.x, y: r.y + s, w: r.w, h: r.h - s },
      ];
  partition(a, rng, o, out);
  partition(b, rng, o, out);
}

/**
 * Partitions the interior into leaves and carves each leaf minus its right/bottom
 * edge, so neighbouring rooms are separated by exactly one wall cell.
 */
export function buildRooms(grid: Grid, rng: Rng, o: GenOptions): Room[] {
  const leaves: Rect[] = [];
  partition({ x: 1, y: 1, w: grid.width - 1, h: grid.height - 1 }, rng, o, leaves);

  return leaves.map((leaf, id) => {
    const room: Room = { id, x: leaf.x, y: leaf.y, w: leaf.w - 1, h: leaf.h - 1, pillared: false };
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        setCell(grid, x, y, Cell.Floor);
        grid.room[y * grid.width + x] = id;
      }
    }
    if (room.w >= 7 && room.h >= 7 && rng.chance(o.pillarHallChance)) {
      room.pillared = true;
      for (let y = room.y + 2; y <= room.y + room.h - 3; y += 3) {
        for (let x = room.x + 2; x <= room.x + room.w - 3; x += 3) setCell(grid, x, y, Cell.Pillar);
      }
    }
    return room;
  });
}

interface Separator {
  x: number;
  y: number;
  a: number;
  b: number;
}

/**
 * Carves 1-cell doorways: first a random spanning tree (Kruskal over wall cells that
 * separate two rooms), then extra doorways between not-yet-linked room pairs for loops.
 */
export function connectRooms(grid: Grid, rooms: Room[], rng: Rng, o: GenOptions): number {
  const roomAt = (x: number, y: number): number =>
    getCell(grid, x, y) === Cell.Floor ? grid.room[y * grid.width + x] : -1;

  const seps: Separator[] = [];
  for (let y = 1; y < grid.height - 1; y++) {
    for (let x = 1; x < grid.width - 1; x++) {
      if (getCell(grid, x, y) !== Cell.Wall) continue;
      const l = roomAt(x - 1, y);
      const r = roomAt(x + 1, y);
      if (l >= 0 && r >= 0 && l !== r) {
        seps.push({ x, y, a: l, b: r });
        continue;
      }
      const u = roomAt(x, y - 1);
      const d = roomAt(x, y + 1);
      if (u >= 0 && d >= 0 && u !== d) seps.push({ x, y, a: u, b: d });
    }
  }
  rng.shuffle(seps);

  const parent = rooms.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const linked = new Set<string>();
  const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const carve = (s: Separator) => {
    setCell(grid, s.x, s.y, Cell.Floor);
    linked.add(pairKey(s.a, s.b));
  };

  let doors = 0;
  for (const s of seps) {
    const ra = find(s.a);
    const rb = find(s.b);
    if (ra === rb) continue;
    parent[ra] = rb;
    carve(s);
    doors++;
  }

  const extraTarget = Math.round(rooms.length * o.extraConnectionRatio);
  let extras = 0;
  for (const s of seps) {
    if (extras >= extraTarget) break;
    if (getCell(grid, s.x, s.y) === Cell.Floor || linked.has(pairKey(s.a, s.b))) continue;
    carve(s);
    extras++;
    doors++;
  }
  return doors;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/world`
Expected: all grid, pathing and rooms tests PASS.

- [ ] **Step 9: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/world tests/world
git commit -m "feat: grid model, BFS, and BSP room generation with looping doorways"
```

---

### Task 3: Complete level generation — dark zones, start, exit

**Files:**
- Modify: `src/world/generator.ts` (append)
- Test: `tests/world/generator.test.ts`

**Interfaces:**
- Consumes: `createRng`, `deriveSeed` (Task 1); grid + `bfsDistances` + `buildRooms`/`connectRooms`/`DEFAULT_GEN` (Task 2)
- Produces:
  - `interface Level { seed: number; grid: Grid; rooms: Room[]; start: Point; exit: Point }`
  - `generateLevel(seed: number, overrides?: Partial<GenOptions>): Level` — throws `Error` after 20 failed attempts
  - `MAX_GEN_ATTEMPTS = 20`

- [ ] **Step 1: Write the failing test `tests/world/generator.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_GEN, generateLevel } from '../../src/world/generator';
import { Cell, getCell, isDark } from '../../src/world/grid';
import { bfsDistances } from '../../src/world/pathing';

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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/world/generator.test.ts`
Expected: FAIL — `generateLevel` is not exported.

- [ ] **Step 3: Append level assembly to `src/world/generator.ts`**

Update the imports at the top of the file to:

```ts
import { createRng, deriveSeed, type Rng } from '../core/rng';
import { Cell, createGrid, type Grid, getCell, type Point, setCell } from './grid';
import { bfsDistances } from './pathing';
```

Then append:

```ts
export interface Level {
  seed: number;
  grid: Grid;
  rooms: Room[];
  start: Point;
  exit: Point;
}

export const MAX_GEN_ATTEMPTS = 20;

export function generateLevel(seed: number, overrides: Partial<GenOptions> = {}): Level {
  const o: GenOptions = { ...DEFAULT_GEN, ...overrides };
  for (let attempt = 0; attempt < MAX_GEN_ATTEMPTS; attempt++) {
    const layoutSeed = deriveSeed(seed, attempt === 0 ? 'layout' : `layout:${attempt}`);
    const level = tryGenerate(layoutSeed, o);
    if (level) return { seed, ...level };
  }
  throw new Error(`generateLevel: no valid layout for seed ${seed} after ${MAX_GEN_ATTEMPTS} attempts`);
}

function tryGenerate(layoutSeed: number, o: GenOptions): Omit<Level, 'seed'> | null {
  const rng = createRng(layoutSeed);
  const grid = createGrid(o.width, o.height);
  const rooms = buildRooms(grid, rng, o);
  connectRooms(grid, rooms, rng, o);
  const startRoom = pickStartRoom(rooms, rng, o);
  const start = pickFloorCell(grid, startRoom, rng);
  assignDarkZones(grid, rooms, startRoom.id, rng, o.darkFraction);
  const exit = pickExit(grid, start, rng, o);
  return exit ? { grid, rooms, start, exit } : null;
}

/** Start near a random corner so the far side of the map is available for the exit. */
function pickStartRoom(rooms: Room[], rng: Rng, o: GenOptions): Room {
  const corner = rng.pick([
    { x: 0, y: 0 },
    { x: o.width, y: 0 },
    { x: 0, y: o.height },
    { x: o.width, y: o.height },
  ]);
  const dist = (r: Room) => Math.hypot(r.x + r.w / 2 - corner.x, r.y + r.h / 2 - corner.y);
  const near = rooms.filter((r) => dist(r) < o.width * 0.25);
  return near.length > 0 ? rng.pick(near) : rooms.reduce((best, r) => (dist(r) < dist(best) ? r : best));
}

function pickFloorCell(grid: Grid, room: Room, rng: Rng): Point {
  const cells: Point[] = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (getCell(grid, x, y) === Cell.Floor) cells.push({ x, y });
    }
  }
  return rng.pick(cells);
}

/** Switches off whole rooms (never the start room) until the dark fraction is reached. */
function assignDarkZones(grid: Grid, rooms: Room[], startRoomId: number, rng: Rng, fraction: number): void {
  let floor = 0;
  for (let i = 0; i < grid.cells.length; i++) if (grid.cells[i] === Cell.Floor) floor++;
  const target = floor * fraction;

  let dark = 0;
  for (const r of rng.shuffle(rooms.filter((room) => room.id !== startRoomId))) {
    if (dark >= target) break;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = y * grid.width + x;
        grid.dark[i] = 1;
        if (grid.cells[i] === Cell.Floor) dark++;
      }
    }
  }
}

function hasAdjacentWall(grid: Grid, x: number, y: number): boolean {
  return (
    getCell(grid, x + 1, y) === Cell.Wall ||
    getCell(grid, x - 1, y) === Cell.Wall ||
    getCell(grid, x, y + 1) === Cell.Wall ||
    getCell(grid, x, y - 1) === Cell.Wall
  );
}

/** Exit: reachable, lit floor cell against a wall (the future noclip wall), far from start. */
function pickExit(grid: Grid, start: Point, rng: Rng, o: GenOptions): Point | null {
  const dist = bfsDistances(grid, start.x, start.y);
  const minDistance = o.width * o.exitDistanceRatio;
  const candidates: Point[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      if (grid.cells[i] !== Cell.Floor || dist[i] < 0 || grid.dark[i]) continue;
      if (Math.hypot(x - start.x, y - start.y) < minDistance) continue;
      if (!hasAdjacentWall(grid, x, y)) continue;
      candidates.push({ x, y });
    }
  }
  return candidates.length > 0 ? rng.pick(candidates) : null;
}
```

- [ ] **Step 4: Run all tests to verify they pass**

Run: `npm test`
Expected: all tests PASS (the 25-seed test should take well under a few seconds).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/world/generator.ts tests/world/generator.test.ts
git commit -m "feat: seeded level generation with dark zones, corner start and far exit"
```

---

### Task 4: Circle-vs-grid collision

**Files:**
- Create: `src/player/collision.ts`
- Test: `tests/player/collision.test.ts`

**Interfaces:**
- Consumes: `Grid`, `Cell`, `CELL_SIZE`, `PILLAR_SIZE`, `getCell`, `worldToCell` (Task 2)
- Produces:
  - `interface Vec2 { x: number; z: number }` (world metres)
  - `PLAYER_RADIUS = 0.3`
  - `moveWithCollision(grid: Grid, pos: Vec2, dx: number, dz: number, radius?: number): Vec2` — returns a new position; assumes `|dx|, |dz| < CELL_SIZE` per call

- [ ] **Step 1: Write the failing test `tests/player/collision.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { moveWithCollision, PLAYER_RADIUS } from '../../src/player/collision';
import { Cell, createGrid, setCell } from '../../src/world/grid';

/** size×size grid with a walled border and open floor inside. World interior spans [2, (size-1)*2]. */
function room(size: number) {
  const g = createGrid(size, size);
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) setCell(g, x, y, Cell.Floor);
  return g;
}

describe('moveWithCollision', () => {
  it('moves freely in open space', () => {
    const p = moveWithCollision(room(5), { x: 5, z: 5 }, 0.5, -0.5);
    expect(p).toEqual({ x: 5.5, z: 4.5 });
  });

  it('stops flush against a wall in +x and -x', () => {
    const g = room(5); // interior x ∈ [2, 8]
    expect(moveWithCollision(g, { x: 7, z: 5 }, 1.9, 0).x).toBeCloseTo(8 - PLAYER_RADIUS, 3);
    expect(moveWithCollision(g, { x: 3, z: 5 }, -1.9, 0).x).toBeCloseTo(2 + PLAYER_RADIUS, 3);
  });

  it('slides along a wall instead of sticking', () => {
    const p = moveWithCollision(room(5), { x: 7.69, z: 5 }, 0.5, 0.5);
    expect(p.x).toBeCloseTo(8 - PLAYER_RADIUS, 3);
    expect(p.z).toBeCloseTo(5.5, 5);
  });

  it('cannot squeeze through a corner diagonally', () => {
    const g = room(5);
    let p = { x: 7.5, z: 7.5 };
    for (let i = 0; i < 10; i++) p = moveWithCollision(g, p, 0.3, 0.3);
    expect(p.x).toBeCloseTo(8 - PLAYER_RADIUS, 3);
    expect(p.z).toBeCloseTo(8 - PLAYER_RADIUS, 3);
  });

  it('collides with the thin pillar box, not the whole pillar cell', () => {
    const g = room(7);
    setCell(g, 3, 3, Cell.Pillar); // cell spans [6, 8]; pillar box spans [6.6, 7.4]
    const stopped = moveWithCollision(g, { x: 5, z: 7 }, 1.5, 0);
    expect(stopped.x).toBeCloseTo(6.6 - PLAYER_RADIUS, 3);
    // Beside the pillar (outside its box on z) the player may stand inside the pillar's cell.
    const beside = moveWithCollision(g, { x: 5, z: 6.2 }, 1.5, 0);
    expect(beside.x).toBeCloseTo(6.5, 5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/player/collision.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/player/collision.ts`**

```ts
import { Cell, CELL_SIZE, type Grid, getCell, PILLAR_SIZE, worldToCell } from '../world/grid';

export interface Vec2 {
  x: number;
  z: number;
}

export const PLAYER_RADIUS = 0.3;
const EPS = 1e-4;

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function solidRect(grid: Grid, cx: number, cy: number): Rect | null {
  const c = getCell(grid, cx, cy);
  const x0 = cx * CELL_SIZE;
  const z0 = cy * CELL_SIZE;
  if (c === Cell.Wall) return { minX: x0, maxX: x0 + CELL_SIZE, minZ: z0, maxZ: z0 + CELL_SIZE };
  if (c === Cell.Pillar) {
    const inset = (CELL_SIZE - PILLAR_SIZE) / 2;
    return { minX: x0 + inset, maxX: x0 + inset + PILLAR_SIZE, minZ: z0 + inset, maxZ: z0 + inset + PILLAR_SIZE };
  }
  return null;
}

/** Solid rects overlapping the player's square footprint (circle approximated by its AABB). */
function overlapping(grid: Grid, x: number, z: number, r: number): Rect[] {
  const hits: Rect[] = [];
  for (let cy = worldToCell(z - r); cy <= worldToCell(z + r); cy++) {
    for (let cx = worldToCell(x - r); cx <= worldToCell(x + r); cx++) {
      const rect = solidRect(grid, cx, cy);
      if (rect && x + r > rect.minX && x - r < rect.maxX && z + r > rect.minZ && z - r < rect.maxZ) hits.push(rect);
    }
  }
  return hits;
}

/** Axis-separated move: resolve X, then Z, so the player slides along walls. */
export function moveWithCollision(grid: Grid, pos: Vec2, dx: number, dz: number, radius = PLAYER_RADIUS): Vec2 {
  let x = pos.x + dx;
  let z = pos.z;
  let hits = overlapping(grid, x, z, radius);
  if (hits.length > 0) {
    if (dx > 0) x = Math.min(...hits.map((h) => h.minX)) - radius - EPS;
    else if (dx < 0) x = Math.max(...hits.map((h) => h.maxX)) + radius + EPS;
  }

  z += dz;
  hits = overlapping(grid, x, z, radius);
  if (hits.length > 0) {
    if (dz > 0) z = Math.min(...hits.map((h) => h.minZ)) - radius - EPS;
    else if (dz < 0) z = Math.max(...hits.map((h) => h.maxZ)) + radius + EPS;
  }
  return { x, z };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/player/collision.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/player/collision.ts tests/player/collision.test.ts
git commit -m "feat: circle-vs-grid collision with wall sliding and thin pillars"
```

---

### Task 5: Player controller (movement, gaits, look)

**Files:**
- Create: `src/player/controller.ts`
- Test: `tests/player/controller.test.ts`

**Interfaces:**
- Consumes: `moveWithCollision`, `Vec2` (Task 4); `Grid` (Task 2)
- Produces:
  - `type Gait = 'walk' | 'sprint' | 'crouch'`
  - `SPEED: Record<Gait, number>` = walk 2.2, sprint 4.5, crouch 1.1 (m/s)
  - `EYE_HEIGHT = { stand: 1.6, crouch: 1.0 }`, `MAX_PITCH = 1.45`
  - `interface MoveInput { forward: number; right: number; sprint: boolean; crouch: boolean; lookDX: number; lookDY: number }` — forward/right in [-1, 1], look in radians
  - `NO_INPUT: MoveInput`
  - `interface PlayerState { pos: Vec2; yaw: number; pitch: number; gait: Gait; moving: boolean; eyeHeight: number }`
  - `createPlayer(pos: Vec2, yaw?: number): PlayerState`
  - `updatePlayer(p: PlayerState, input: MoveInput, dt: number, grid: Grid): PlayerState` — mutates and returns `p`
- Convention: yaw 0 looks toward −Z (Three.js camera default); forward = (−sin yaw, −cos yaw); right = (cos yaw, −sin yaw). Positive `lookDX` turns right (yaw decreases); positive `lookDY` looks down.

- [ ] **Step 1: Write the failing test `tests/player/controller.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  createPlayer, EYE_HEIGHT, MAX_PITCH, type MoveInput, NO_INPUT, SPEED, updatePlayer,
} from '../../src/player/controller';
import { Cell, createGrid, setCell } from '../../src/world/grid';

const open = (() => {
  const g = createGrid(20, 20);
  for (let y = 1; y < 19; y++) for (let x = 1; x < 19; x++) setCell(g, x, y, Cell.Floor);
  return g;
})();

const input = (over: Partial<MoveInput>): MoveInput => ({ ...NO_INPUT, ...over });

function run(p: ReturnType<typeof createPlayer>, i: MoveInput, steps: number, dt = 0.1) {
  for (let s = 0; s < steps; s++) updatePlayer(p, i, dt, open);
  return p;
}

describe('updatePlayer', () => {
  it('moves toward -z when walking forward at yaw 0', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ forward: 1 }), 10);
    expect(p.pos.z).toBeCloseTo(20 - SPEED.walk, 5);
    expect(p.pos.x).toBeCloseTo(20, 5);
  });

  it('moves toward -x when walking forward at yaw π/2', () => {
    const p = run(createPlayer({ x: 20, z: 20 }, Math.PI / 2), input({ forward: 1 }), 10);
    expect(p.pos.x).toBeCloseTo(20 - SPEED.walk, 5);
  });

  it('strafes right toward +x at yaw 0', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ right: 1 }), 10);
    expect(p.pos.x).toBeCloseTo(20 + SPEED.walk, 5);
  });

  it('does not move faster diagonally', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ forward: 1, right: 1 }), 10);
    expect(Math.hypot(p.pos.x - 20, p.pos.z - 20)).toBeCloseTo(SPEED.walk, 5);
  });

  it('sprints faster, and crouch overrides sprint', () => {
    const sprinter = run(createPlayer({ x: 20, z: 20 }), input({ forward: 1, sprint: true }), 4);
    expect(sprinter.gait).toBe('sprint');
    expect(20 - sprinter.pos.z).toBeCloseTo(SPEED.sprint * 0.4, 5);

    const croucher = run(createPlayer({ x: 20, z: 20 }), input({ forward: 1, sprint: true, crouch: true }), 4);
    expect(croucher.gait).toBe('crouch');
    expect(20 - croucher.pos.z).toBeCloseTo(SPEED.crouch * 0.4, 5);
  });

  it('is not sprinting while standing still', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ sprint: true }), 1);
    expect(p.moving).toBe(false);
    expect(p.gait).toBe('walk');
  });

  it('turns right on positive lookDX and clamps pitch', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ lookDX: 0.5, lookDY: 10 }), 1);
    expect(p.yaw).toBeCloseTo(-0.5, 5);
    expect(p.pitch).toBe(-MAX_PITCH);
  });

  it('lowers the eye smoothly when crouching', () => {
    const p = createPlayer({ x: 20, z: 20 });
    updatePlayer(p, input({ crouch: true }), 0.05, open);
    expect(p.eyeHeight).toBeLessThan(EYE_HEIGHT.stand);
    expect(p.eyeHeight).toBeGreaterThan(EYE_HEIGHT.crouch);
    run(p, input({ crouch: true }), 10);
    expect(p.eyeHeight).toBeCloseTo(EYE_HEIGHT.crouch, 5);
  });

  it('is stopped by walls', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ right: 1, sprint: true }), 100);
    expect(p.pos.x).toBeCloseTo(38 - 0.3, 3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/player/controller.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/player/controller.ts`**

```ts
import type { Grid } from '../world/grid';
import { moveWithCollision, type Vec2 } from './collision';

export type Gait = 'walk' | 'sprint' | 'crouch';

export const SPEED: Record<Gait, number> = { walk: 2.2, sprint: 4.5, crouch: 1.1 };
export const EYE_HEIGHT = { stand: 1.6, crouch: 1.0 } as const;
/** Metres per second the eye moves toward its target height. */
const EYE_LERP_SPEED = 4;
export const MAX_PITCH = 1.45;

export interface MoveInput {
  /** -1..1, positive = forward */
  forward: number;
  /** -1..1, positive = right */
  right: number;
  sprint: boolean;
  crouch: boolean;
  /** Radians this step; positive turns right. */
  lookDX: number;
  /** Radians this step; positive looks down. */
  lookDY: number;
}

export const NO_INPUT: MoveInput = Object.freeze({
  forward: 0, right: 0, sprint: false, crouch: false, lookDX: 0, lookDY: 0,
});

export interface PlayerState {
  pos: Vec2;
  yaw: number;
  pitch: number;
  gait: Gait;
  moving: boolean;
  eyeHeight: number;
}

export function createPlayer(pos: Vec2, yaw = 0): PlayerState {
  return { pos: { ...pos }, yaw, pitch: 0, gait: 'walk', moving: false, eyeHeight: EYE_HEIGHT.stand };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function updatePlayer(p: PlayerState, input: MoveInput, dt: number, grid: Grid): PlayerState {
  p.yaw -= input.lookDX;
  p.pitch = clamp(p.pitch - input.lookDY, -MAX_PITCH, MAX_PITCH);

  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  let mx = input.forward * -sin + input.right * cos;
  let mz = input.forward * -cos + input.right * -sin;
  const len = Math.hypot(mx, mz);
  p.moving = len > 1e-6;
  if (len > 1) {
    mx /= len;
    mz /= len;
  }

  p.gait = input.crouch ? 'crouch' : input.sprint && p.moving ? 'sprint' : 'walk';
  if (p.moving) {
    const speed = SPEED[p.gait];
    p.pos = moveWithCollision(grid, p.pos, mx * speed * dt, mz * speed * dt);
  }

  const target = p.gait === 'crouch' ? EYE_HEIGHT.crouch : EYE_HEIGHT.stand;
  const maxStep = EYE_LERP_SPEED * dt;
  p.eyeHeight += clamp(target - p.eyeHeight, -maxStep, maxStep);
  return p;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/player/controller.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/player/controller.ts tests/player/controller.test.ts
git commit -m "feat: first-person controller with walk/sprint/crouch and pitch clamp"
```

---

### Task 6: Fixed-step loop and input

**Files:**
- Create: `src/core/loop.ts`, `src/core/input.ts`
- Test: `tests/core/loop.test.ts`, `tests/core/input.test.ts`

**Interfaces:**
- Consumes: `MoveInput` (Task 5)
- Produces:
  - `FIXED_DT = 1 / 60`, `MAX_STEPS_PER_FRAME = 5`
  - `createFixedStepper(step?: number, maxSteps?: number): { advance(frameDt: number): number }` — returns how many fixed updates to run this frame
  - `MOUSE_SENSITIVITY = 0.0022` (radians per pixel)
  - `interface Input { isDown(code: string): boolean; moveInput(sensitivity?: number): MoveInput; clear(): void; dispose(): void }`
  - `createInput(target: EventTarget, isLocked: () => boolean): Input` — listens for `keydown`, `keyup`, `mousemove`, `blur` on `target`; `moveInput()` consumes accumulated mouse movement

- [ ] **Step 1: Write the failing test `tests/core/loop.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createFixedStepper, FIXED_DT, MAX_STEPS_PER_FRAME } from '../../src/core/loop';

describe('createFixedStepper', () => {
  it('runs one step per 60 Hz frame', () => {
    const s = createFixedStepper();
    expect(s.advance(FIXED_DT)).toBe(1);
    expect(s.advance(FIXED_DT)).toBe(1);
  });

  it('accumulates short frames (120 Hz display)', () => {
    const s = createFixedStepper();
    expect(s.advance(FIXED_DT / 2)).toBe(0);
    expect(s.advance(FIXED_DT / 2)).toBe(1);
  });

  it('caps catch-up after a long pause and drops the backlog', () => {
    const s = createFixedStepper();
    expect(s.advance(10)).toBe(MAX_STEPS_PER_FRAME);
    expect(s.advance(FIXED_DT / 2)).toBe(0);
  });

  it('ignores negative frame times', () => {
    const s = createFixedStepper();
    expect(s.advance(-1)).toBe(0);
    expect(s.advance(FIXED_DT)).toBe(1);
  });
});
```

- [ ] **Step 2: Write the failing test `tests/core/input.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createInput } from '../../src/core/input';

function key(type: 'keydown' | 'keyup', code: string): Event {
  const e = new Event(type);
  Object.defineProperty(e, 'code', { value: code });
  return e;
}

function mouse(dx: number, dy: number): Event {
  const e = new Event('mousemove');
  Object.defineProperties(e, { movementX: { value: dx }, movementY: { value: dy } });
  return e;
}

function setup(locked = true) {
  const target = new EventTarget();
  const input = createInput(target, () => locked);
  return { target, input };
}

describe('createInput', () => {
  it('maps WASD and arrows to forward/right axes', () => {
    const { target, input } = setup();
    target.dispatchEvent(key('keydown', 'KeyW'));
    target.dispatchEvent(key('keydown', 'KeyA'));
    expect(input.moveInput()).toMatchObject({ forward: 1, right: -1 });
    target.dispatchEvent(key('keydown', 'ArrowDown'));
    expect(input.moveInput().forward).toBe(0);
  });

  it('maps Shift to sprint and C to crouch', () => {
    const { target, input } = setup();
    target.dispatchEvent(key('keydown', 'ShiftLeft'));
    target.dispatchEvent(key('keydown', 'KeyC'));
    expect(input.moveInput()).toMatchObject({ sprint: true, crouch: true });
    target.dispatchEvent(key('keyup', 'KeyC'));
    expect(input.moveInput().crouch).toBe(false);
  });

  it('accumulates mouse movement while locked and consumes it once', () => {
    const { target, input } = setup(true);
    target.dispatchEvent(mouse(10, -5));
    target.dispatchEvent(mouse(10, 0));
    const first = input.moveInput(0.01);
    expect(first.lookDX).toBeCloseTo(0.2, 6);
    expect(first.lookDY).toBeCloseTo(-0.05, 6);
    expect(input.moveInput(0.01).lookDX).toBe(0);
  });

  it('ignores mouse movement while unlocked', () => {
    const { target, input } = setup(false);
    target.dispatchEvent(mouse(50, 50));
    expect(input.moveInput().lookDX).toBe(0);
  });

  it('releases held keys when the window loses focus', () => {
    const { target, input } = setup();
    target.dispatchEvent(key('keydown', 'KeyW'));
    target.dispatchEvent(new Event('blur'));
    expect(input.moveInput().forward).toBe(0);
  });

  it('clear() releases keys and pending look', () => {
    const { target, input } = setup();
    target.dispatchEvent(key('keydown', 'KeyD'));
    target.dispatchEvent(mouse(30, 0));
    input.clear();
    expect(input.moveInput()).toMatchObject({ right: 0, lookDX: 0 });
  });

  it('stops listening after dispose()', () => {
    const { target, input } = setup();
    input.dispose();
    target.dispatchEvent(key('keydown', 'KeyW'));
    expect(input.isDown('KeyW')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/core`
Expected: FAIL — `loop` and `input` modules not found (rng tests still pass).

- [ ] **Step 4: Implement `src/core/loop.ts`**

```ts
export const FIXED_DT = 1 / 60;
export const MAX_STEPS_PER_FRAME = 5;

/**
 * Converts variable frame times into a count of fixed simulation steps.
 * After a long stall (tab hidden, breakpoint) it runs at most `maxSteps` and drops the rest,
 * so the simulation never spirals or teleports.
 */
export function createFixedStepper(step = FIXED_DT, maxSteps = MAX_STEPS_PER_FRAME) {
  let accumulator = 0;
  return {
    advance(frameDt: number): number {
      accumulator += Math.max(0, frameDt);
      let steps = Math.floor(accumulator / step);
      if (steps > maxSteps) {
        steps = maxSteps;
        accumulator = 0;
      } else {
        accumulator -= steps * step;
      }
      return steps;
    },
  };
}
```

- [ ] **Step 5: Implement `src/core/input.ts`**

```ts
import type { MoveInput } from '../player/controller';

export const MOUSE_SENSITIVITY = 0.0022;

const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const SPRINT = ['ShiftLeft', 'ShiftRight'];
// Not Ctrl: Ctrl+W closes the browser tab.
const CROUCH = ['KeyC'];

export interface Input {
  isDown(code: string): boolean;
  /** Current movement intent; consumes mouse movement accumulated since the last call. */
  moveInput(sensitivity?: number): MoveInput;
  clear(): void;
  dispose(): void;
}

export function createInput(target: EventTarget, isLocked: () => boolean): Input {
  const down = new Set<string>();
  let lookX = 0;
  let lookY = 0;

  const clear = () => {
    down.clear();
    lookX = 0;
    lookY = 0;
  };
  const listeners: Array<[string, (e: Event) => void]> = [
    ['keydown', (e) => down.add((e as KeyboardEvent).code)],
    ['keyup', (e) => down.delete((e as KeyboardEvent).code)],
    [
      'mousemove',
      (e) => {
        if (!isLocked()) return;
        lookX += (e as MouseEvent).movementX;
        lookY += (e as MouseEvent).movementY;
      },
    ],
    ['blur', clear],
  ];
  for (const [type, fn] of listeners) target.addEventListener(type, fn);

  const any = (codes: string[]) => codes.some((c) => down.has(c));

  return {
    isDown: (code) => down.has(code),
    moveInput(sensitivity = MOUSE_SENSITIVITY) {
      const input: MoveInput = {
        forward: (any(FORWARD) ? 1 : 0) - (any(BACK) ? 1 : 0),
        right: (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0),
        sprint: any(SPRINT),
        crouch: any(CROUCH),
        lookDX: lookX * sensitivity,
        lookDY: lookY * sensitivity,
      };
      lookX = 0;
      lookY = 0;
      return input;
    },
    clear,
    dispose() {
      for (const [type, fn] of listeners) target.removeEventListener(type, fn);
    },
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/core tests/core
git commit -m "feat: fixed-timestep stepper and keyboard/mouse input with focus-loss reset"
```

---

### Task 7: Chunk math and light fixture layout

**Files:**
- Create: `src/world/chunks.ts`, `src/lighting/lights.ts`
- Test: `tests/world/chunks.test.ts`, `tests/lighting/lights.test.ts`

**Interfaces:**
- Consumes: `Grid`, `Cell`, `getCell` (Task 2)
- Produces (chunks.ts):
  - `CHUNK_CELLS = 16`, `LOAD_RADIUS = 3`, `type ChunkKey = string`
  - `chunkKey(cx: number, cy: number): ChunkKey` (format `"cx,cy"`), `parseChunkKey(key: ChunkKey): { cx: number; cy: number }`
  - `chunkOf(cell: number): number`
  - `chunksAround(cellX: number, cellY: number, radius: number, gridW: number, gridH: number): Set<ChunkKey>` — clipped to the grid
  - `diffChunks(loaded: ReadonlySet<ChunkKey>, wanted: ReadonlySet<ChunkKey>): { toLoad: ChunkKey[]; toUnload: ChunkKey[] }`
- Produces (lights.ts): `isLightCell(grid: Grid, x: number, y: number): boolean` — a ceiling light hangs over every floor cell with even x and even y

- [ ] **Step 1: Write the failing test `tests/world/chunks.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { chunkKey, chunkOf, chunksAround, diffChunks, parseChunkKey } from '../../src/world/chunks';

describe('chunks', () => {
  it('round-trips keys', () => {
    expect(chunkKey(3, 12)).toBe('3,12');
    expect(parseChunkKey('3,12')).toEqual({ cx: 3, cy: 12 });
  });

  it('maps cells to chunks', () => {
    expect(chunkOf(0)).toBe(0);
    expect(chunkOf(15)).toBe(0);
    expect(chunkOf(16)).toBe(1);
    expect(chunkOf(199)).toBe(12);
  });

  it('returns a full square in the middle of the grid', () => {
    const keys = chunksAround(100, 100, 3, 200, 200);
    expect(keys.size).toBe(49);
    expect(keys.has('6,6')).toBe(true);
    expect(keys.has('3,3')).toBe(true);
    expect(keys.has('9,9')).toBe(true);
  });

  it('clips at the grid edges (no negative or out-of-range chunks)', () => {
    expect([...chunksAround(0, 0, 1, 200, 200)].sort()).toEqual(['0,0', '0,1', '1,0', '1,1']);
    expect([...chunksAround(199, 199, 1, 200, 200)].sort()).toEqual(['11,11', '11,12', '12,11', '12,12']);
  });

  it('diffs loaded vs wanted', () => {
    const { toLoad, toUnload } = diffChunks(new Set(['0,0', '0,1']), new Set(['0,1', '1,1']));
    expect(toLoad).toEqual(['1,1']);
    expect(toUnload).toEqual(['0,0']);
  });
});
```

- [ ] **Step 2: Write the failing test `tests/lighting/lights.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { isLightCell } from '../../src/lighting/lights';
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/world/chunks.test.ts tests/lighting`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `src/world/chunks.ts`**

```ts
export const CHUNK_CELLS = 16;
export const LOAD_RADIUS = 3;

export type ChunkKey = string;

export function chunkKey(cx: number, cy: number): ChunkKey {
  return `${cx},${cy}`;
}

export function parseChunkKey(key: ChunkKey): { cx: number; cy: number } {
  const [cx, cy] = key.split(',').map(Number);
  return { cx, cy };
}

export function chunkOf(cell: number): number {
  return Math.floor(cell / CHUNK_CELLS);
}

/** Chunks within `radius` (Chebyshev) of the chunk containing the cell, clipped to the grid. */
export function chunksAround(cellX: number, cellY: number, radius: number, gridW: number, gridH: number): Set<ChunkKey> {
  const maxCx = Math.ceil(gridW / CHUNK_CELLS) - 1;
  const maxCy = Math.ceil(gridH / CHUNK_CELLS) - 1;
  const ccx = chunkOf(cellX);
  const ccy = chunkOf(cellY);
  const keys = new Set<ChunkKey>();
  for (let cy = Math.max(0, ccy - radius); cy <= Math.min(maxCy, ccy + radius); cy++) {
    for (let cx = Math.max(0, ccx - radius); cx <= Math.min(maxCx, ccx + radius); cx++) keys.add(chunkKey(cx, cy));
  }
  return keys;
}

export function diffChunks(
  loaded: ReadonlySet<ChunkKey>,
  wanted: ReadonlySet<ChunkKey>,
): { toLoad: ChunkKey[]; toUnload: ChunkKey[] } {
  return {
    toLoad: [...wanted].filter((k) => !loaded.has(k)),
    toUnload: [...loaded].filter((k) => !wanted.has(k)),
  };
}
```

- [ ] **Step 5: Implement `src/lighting/lights.ts`**

```ts
import { Cell, type Grid, getCell } from '../world/grid';

/** A fluorescent ceiling panel hangs over every floor cell with even x and even y (one per 4 m). */
export function isLightCell(grid: Grid, x: number, y: number): boolean {
  return getCell(grid, x, y) === Cell.Floor && x % 2 === 0 && y % 2 === 0;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/world/chunks.ts src/lighting/lights.ts tests/world/chunks.test.ts tests/lighting/lights.test.ts
git commit -m "feat: chunk streaming math and ceiling light layout"
```

---

### Task 8: Rendering — textures, chunk meshes, streaming, walkable build

**Files:**
- Create: `index.html`, `src/style.css`, `src/world/textures.ts`, `src/world/chunkMesh.ts`, `src/world/streamer.ts`, `src/main.ts`, `public/CREDITS.md`

**Interfaces:**
- Consumes: everything from Tasks 1–7
- Produces:
  - `interface WorldMaterials { wall; floor; ceiling; lightOn; lightOff }` (all `THREE.MeshStandardMaterial`), `createWorldMaterials(rng: Rng): WorldMaterials`
  - `buildChunk(grid: Grid, cx: number, cy: number, mats: WorldMaterials): THREE.Group`, `disposeChunk(group: THREE.Group): void`
  - `createChunkStreamer(scene: THREE.Scene, grid: Grid, mats: WorldMaterials): { update(cellX: number, cellY: number): void; loadedCount(): number }`

This task is rendering glue; it's verified in the browser rather than by unit tests.

- [ ] **Step 1: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Backrooms — Level 0</title>
  </head>
  <body>
    <canvas id="game"></canvas>
    <div id="overlay">
      <p class="title">CLICK TO ENTER</p>
      <p class="hint">WASD move · Mouse look · Shift sprint · C crouch · Esc release</p>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/style.css`**

```css
html,
body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: #000;
}

#game {
  display: block;
  width: 100vw;
  height: 100vh;
}

#overlay {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  background: rgba(0, 0, 0, 0.72);
  color: #e8e0c0;
  font-family: 'Courier New', monospace;
  cursor: pointer;
  user-select: none;
}

#overlay[hidden] {
  display: none;
}

#overlay .title {
  font-size: 1.5rem;
  letter-spacing: 0.3em;
  margin: 0;
}

#overlay .hint {
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  opacity: 0.6;
  margin: 0;
}
```

- [ ] **Step 3: Create `src/world/textures.ts`**

```ts
import * as THREE from 'three';
import type { Rng } from '../core/rng';

const SIZE = 256;
/** Bright troffer panel inside a 3×3 drop-ceiling tile layout (canvas pixels). */
const PANEL = { x: SIZE / 3, y: SIZE / 6, w: SIZE / 3, h: (SIZE * 2) / 3 };

function canvasTexture(draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Adds per-pixel luminance noise; `strength` 0..1. */
function noise(ctx: CanvasRenderingContext2D, rng: Rng, strength: number): void {
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * 255 * strength;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function drawWallpaper(ctx: CanvasRenderingContext2D, rng: Rng): void {
  ctx.fillStyle = '#c8b25a';
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let x = 0; x < SIZE; x += 32) {
    ctx.fillStyle = 'rgba(255, 240, 170, 0.18)';
    ctx.fillRect(x, 0, 12, SIZE);
    ctx.fillStyle = 'rgba(120, 95, 30, 0.12)';
    ctx.fillRect(x + 14, 0, 2, SIZE);
  }
  noise(ctx, rng, 0.08);
  // Grime near the floor (canvas bottom = bottom of the wall).
  const g = ctx.createLinearGradient(0, SIZE * 0.8, 0, SIZE);
  g.addColorStop(0, 'rgba(60, 45, 10, 0)');
  g.addColorStop(1, 'rgba(60, 45, 10, 0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, SIZE * 0.8, SIZE, SIZE * 0.2);
}

function drawCarpet(ctx: CanvasRenderingContext2D, rng: Rng): void {
  ctx.fillStyle = '#9a8544';
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 6; i++) {
    const x = rng.range(0, SIZE);
    const y = rng.range(0, SIZE);
    const r = rng.range(20, 70);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(70, 55, 20, 0.25)');
    g.addColorStop(1, 'rgba(70, 55, 20, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  noise(ctx, rng, 0.22);
}

function drawCeilingTiles(ctx: CanvasRenderingContext2D, rng: Rng): void {
  ctx.fillStyle = '#d6cfae';
  ctx.fillRect(0, 0, SIZE, SIZE);
  noise(ctx, rng, 0.1);
  ctx.strokeStyle = 'rgba(90, 80, 50, 0.6)';
  ctx.lineWidth = 3;
  const t = SIZE / 3;
  ctx.beginPath();
  for (let i = 0; i <= 3; i++) {
    ctx.moveTo(i * t, 0);
    ctx.lineTo(i * t, SIZE);
    ctx.moveTo(0, i * t);
    ctx.lineTo(SIZE, i * t);
  }
  ctx.stroke();
}

function drawLightPanel(ctx: CanvasRenderingContext2D, rng: Rng): void {
  drawCeilingTiles(ctx, rng);
  ctx.fillStyle = '#f4efd8';
  ctx.fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  ctx.strokeStyle = 'rgba(120, 110, 80, 0.8)';
  ctx.lineWidth = 4;
  ctx.strokeRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
}

function drawLightEmissive(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#fff';
  ctx.fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
}

export interface WorldMaterials {
  wall: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  lightOn: THREE.MeshStandardMaterial;
  lightOff: THREE.MeshStandardMaterial;
}

export function createWorldMaterials(rng: Rng): WorldMaterials {
  const panel = canvasTexture((ctx) => drawLightPanel(ctx, rng));
  return {
    wall: new THREE.MeshStandardMaterial({ map: canvasTexture((ctx) => drawWallpaper(ctx, rng)), roughness: 0.95 }),
    floor: new THREE.MeshStandardMaterial({ map: canvasTexture((ctx) => drawCarpet(ctx, rng)), roughness: 1 }),
    ceiling: new THREE.MeshStandardMaterial({ map: canvasTexture((ctx) => drawCeilingTiles(ctx, rng)), roughness: 0.9 }),
    lightOn: new THREE.MeshStandardMaterial({
      map: panel,
      emissive: 0xfff3d1,
      emissiveMap: canvasTexture(drawLightEmissive),
      emissiveIntensity: 1.4,
      roughness: 0.6,
    }),
    lightOff: new THREE.MeshStandardMaterial({ map: panel, color: 0x77725f, roughness: 0.6 }),
  };
}
```

- [ ] **Step 4: Create `src/world/chunkMesh.ts`**

```ts
import * as THREE from 'three';
import { isLightCell } from '../lighting/lights';
import { CHUNK_CELLS } from './chunks';
import { Cell, CELL_SIZE, cellToWorld, type Grid, getCell, isDark, PILLAR_SIZE, WALL_HEIGHT } from './grid';
import type { WorldMaterials } from './textures';

// Shared by every chunk; never disposed.
const wallGeo = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
const pillarGeo = new THREE.BoxGeometry(PILLAR_SIZE, WALL_HEIGHT, PILLAR_SIZE);
const floorGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE).rotateX(-Math.PI / 2);
const ceilingGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE).rotateX(Math.PI / 2);

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, positions: number[]): THREE.InstancedMesh | null {
  const count = positions.length / 3;
  if (count === 0) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    m.makeTranslation(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Walls fully enclosed by other walls can never be seen — skip them. */
function isExposedWall(grid: Grid, x: number, y: number): boolean {
  return (
    getCell(grid, x + 1, y) !== Cell.Wall ||
    getCell(grid, x - 1, y) !== Cell.Wall ||
    getCell(grid, x, y + 1) !== Cell.Wall ||
    getCell(grid, x, y - 1) !== Cell.Wall
  );
}

export function buildChunk(grid: Grid, cx: number, cy: number, mats: WorldMaterials): THREE.Group {
  const walls: number[] = [];
  const pillars: number[] = [];
  const floors: number[] = [];
  const ceilings: number[] = [];
  const lightsOn: number[] = [];
  const lightsOff: number[] = [];

  const x0 = cx * CHUNK_CELLS;
  const y0 = cy * CHUNK_CELLS;
  const x1 = Math.min(x0 + CHUNK_CELLS, grid.width);
  const y1 = Math.min(y0 + CHUNK_CELLS, grid.height);

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const wx = cellToWorld(x);
      const wz = cellToWorld(y);
      const c = getCell(grid, x, y);
      if (c === Cell.Wall) {
        if (isExposedWall(grid, x, y)) walls.push(wx, WALL_HEIGHT / 2, wz);
        continue;
      }
      if (c === Cell.Pillar) pillars.push(wx, WALL_HEIGHT / 2, wz);
      floors.push(wx, 0, wz);
      if (isLightCell(grid, x, y)) (isDark(grid, x, y) ? lightsOff : lightsOn).push(wx, WALL_HEIGHT, wz);
      else ceilings.push(wx, WALL_HEIGHT, wz);
    }
  }

  const group = new THREE.Group();
  group.name = `chunk ${cx},${cy}`;
  const meshes = [
    instanced(wallGeo, mats.wall, walls),
    instanced(pillarGeo, mats.wall, pillars),
    instanced(floorGeo, mats.floor, floors),
    instanced(ceilingGeo, mats.ceiling, ceilings),
    instanced(ceilingGeo, mats.lightOn, lightsOn),
    instanced(ceilingGeo, mats.lightOff, lightsOff),
  ];
  for (const mesh of meshes) if (mesh) group.add(mesh);
  return group;
}

/** Frees per-chunk GPU buffers. Geometries and materials are shared and stay alive. */
export function disposeChunk(group: THREE.Group): void {
  for (const child of group.children) if (child instanceof THREE.InstancedMesh) child.dispose();
}
```

- [ ] **Step 5: Create `src/world/streamer.ts`**

```ts
import type * as THREE from 'three';
import { buildChunk, disposeChunk } from './chunkMesh';
import { type ChunkKey, chunkKey, chunkOf, chunksAround, diffChunks, LOAD_RADIUS, parseChunkKey } from './chunks';
import type { Grid } from './grid';
import type { WorldMaterials } from './textures';

/** Keeps chunk meshes loaded within LOAD_RADIUS of the player; only re-diffs when the player changes chunk. */
export function createChunkStreamer(scene: THREE.Scene, grid: Grid, mats: WorldMaterials) {
  const loaded = new Map<ChunkKey, THREE.Group>();
  let currentChunk: ChunkKey | null = null;

  return {
    update(cellX: number, cellY: number): void {
      const here = chunkKey(chunkOf(cellX), chunkOf(cellY));
      if (here === currentChunk) return;
      currentChunk = here;

      const wanted = chunksAround(cellX, cellY, LOAD_RADIUS, grid.width, grid.height);
      const { toLoad, toUnload } = diffChunks(new Set(loaded.keys()), wanted);
      for (const key of toUnload) {
        const group = loaded.get(key);
        if (!group) continue;
        scene.remove(group);
        disposeChunk(group);
        loaded.delete(key);
      }
      for (const key of toLoad) {
        const { cx, cy } = parseChunkKey(key);
        const group = buildChunk(grid, cx, cy, mats);
        scene.add(group);
        loaded.set(key, group);
      }
    },
    loadedCount: () => loaded.size,
  };
}
```

- [ ] **Step 6: Create `src/main.ts`**

```ts
import './style.css';
import * as THREE from 'three';
import { createInput } from './core/input';
import { createFixedStepper, FIXED_DT } from './core/loop';
import { createRng, deriveSeed } from './core/rng';
import { createPlayer, NO_INPUT, updatePlayer } from './player/controller';
import { generateLevel } from './world/generator';
import { cellToWorld, worldToCell } from './world/grid';
import { createChunkStreamer } from './world/streamer';
import { createWorldMaterials } from './world/textures';

const FOG_COLOR = 0x3b3318;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ canvas, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.06);
scene.add(new THREE.HemisphereLight(0xfff2c4, 0x4a3f1c, 0.6));

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ';

const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
const level = generateLevel(seed);
const materials = createWorldMaterials(createRng(deriveSeed(seed, 'textures')));
const streamer = createChunkStreamer(scene, level.grid, materials);
const player = createPlayer({ x: cellToWorld(level.start.x), z: cellToWorld(level.start.y) });

const isLocked = () => document.pointerLockElement === canvas;
const input = createInput(window, isLocked);
overlay.addEventListener('click', () => canvas.requestPointerLock());
document.addEventListener('pointerlockchange', () => {
  overlay.hidden = isLocked();
  if (!isLocked()) input.clear();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const stepper = createFixedStepper();
let last = performance.now();

renderer.setAnimationLoop((now: number) => {
  const frameDt = (now - last) / 1000;
  last = now;

  const steps = stepper.advance(frameDt);
  for (let i = 0; i < steps; i++) {
    updatePlayer(player, isLocked() ? input.moveInput() : NO_INPUT, FIXED_DT, level.grid);
  }

  camera.position.set(player.pos.x, player.eyeHeight, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  streamer.update(worldToCell(player.pos.x), worldToCell(player.pos.z));
  renderer.render(scene, camera);
});
```

- [ ] **Step 7: Create `public/CREDITS.md`**

```markdown
# Credits

| Asset | Source | License |
|---|---|---|
| Wallpaper, carpet, ceiling tile and light panel textures | Procedurally generated in `src/world/textures.ts` | Project's own |
```

- [ ] **Step 8: Type-check, test and build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors, all tests PASS, Vite prints `✓ built in …` and writes `dist/`.

- [ ] **Step 9: Verify in the browser**

Run: `npm run dev` (in the background), open `http://localhost:5173`.
Expected:
- Overlay reads "CLICK TO ENTER"; behind it, yellow wallpapered walls, brownish carpet, a tiled ceiling with glowing panels, fog in the distance.
- After clicking: mouse look works; WASD walks; Shift is faster; C lowers the camera and slows down; walls and pillars block movement; Esc shows the overlay again and the player stops moving.
- Walking in one direction for 30+ seconds never reveals the edge of loaded geometry (fog hides chunk loading).
- No errors in the browser console.

If driving the check with Playwright, take a screenshot of the overlay state (the scene renders behind it without pointer lock) and read the console messages.

- [ ] **Step 10: Commit**

```bash
git add index.html src/style.css src/world/textures.ts src/world/chunkMesh.ts src/world/streamer.ts src/main.ts public/CREDITS.md
git commit -m "feat: render streamed Level 0 chunks with procedural textures; walkable build"
```

---

### Task 9: Pooled fluorescent lights with flicker

**Files:**
- Modify: `src/lighting/lights.ts` (append)
- Create: `src/lighting/lightPool.ts`
- Modify: `src/main.ts`
- Test: `tests/lighting/lights.test.ts` (append)

**Interfaces:**
- Consumes: `deriveSeed` (Task 1); `Grid`, `Point`, `isDark`, `cellToWorld`, `WALL_HEIGHT` (Task 2); `isLightCell` (Task 7)
- Produces (lights.ts):
  - `nearestLitLights(grid: Grid, cellX: number, cellY: number, count: number, radius?: number): Point[]` — lit (non-dark) light cells sorted by distance, ties by y then x; default radius 8 cells
  - `FAULTY_FRACTION = 0.1`
  - `isFaultyLight(lightId: number, seed: number): boolean`
  - `flicker(timeSec: number, lightId: number, seed: number): number` — brightness multiplier in (0, 1]; healthy lights stay in [0.96, 1]
- Produces (lightPool.ts): `POOL_SIZE = 6`, `createLightPool(scene: THREE.Scene, grid: Grid, seed: number): { update(cellX: number, cellY: number, timeSec: number): void }`

- [ ] **Step 1: Append failing tests to `tests/lighting/lights.test.ts`**

Change the import line at the top to:

```ts
import { flicker, isFaultyLight, isLightCell, nearestLitLights } from '../../src/lighting/lights';
```

Then append:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lighting`
Expected: FAIL — `nearestLitLights`, `isFaultyLight`, `flicker` not exported.

- [ ] **Step 3: Append to `src/lighting/lights.ts`**

Change the import line to:

```ts
import { deriveSeed } from '../core/rng';
import { Cell, type Grid, getCell, isDark, type Point } from '../world/grid';
```

Then append:

```ts
/** Lit ceiling lights nearest to a cell (squared distance, ties by y then x). */
export function nearestLitLights(grid: Grid, cellX: number, cellY: number, count: number, radius = 8): Point[] {
  const found: Array<Point & { d: number }> = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cellX + dx;
      const y = cellY + dy;
      if (!isLightCell(grid, x, y) || isDark(grid, x, y)) continue;
      found.push({ x, y, d: dx * dx + dy * dy });
    }
  }
  found.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  return found.slice(0, count).map(({ x, y }) => ({ x, y }));
}

export const FAULTY_FRACTION = 0.1;
const U32 = 4294967296;
/** Flicker decisions change 12 times per second. */
const FLICKER_RATE = 12;

export function isFaultyLight(lightId: number, seed: number): boolean {
  return deriveSeed(seed, `faulty:${lightId}`) / U32 < FAULTY_FRACTION;
}

/** Brightness multiplier. Healthy lights hum in [0.96, 1]; faulty ones randomly dip to 0.15–0.5. */
export function flicker(timeSec: number, lightId: number, seed: number): number {
  const slot = Math.floor(timeSec * FLICKER_RATE);
  const r = deriveSeed(seed, `flicker:${lightId}:${slot}`) / U32;
  if (isFaultyLight(lightId, seed)) return r < 0.35 ? 0.15 + r : 1;
  return 0.96 + 0.04 * r;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Create `src/lighting/lightPool.ts`**

```ts
import * as THREE from 'three';
import { cellToWorld, type Grid, WALL_HEIGHT } from '../world/grid';
import { flicker, nearestLitLights } from './lights';

export const POOL_SIZE = 6;
const BASE_INTENSITY = 10;
const LIGHT_RANGE = 10;

/**
 * Only POOL_SIZE real lights exist; each frame they move to the lit panels nearest the player.
 * Every other panel only glows (emissive). Fixed light count = no shader recompiles.
 */
export function createLightPool(scene: THREE.Scene, grid: Grid, seed: number) {
  const lights = Array.from({ length: POOL_SIZE }, () => {
    const light = new THREE.PointLight(0xfff1c8, 0, LIGHT_RANGE, 2);
    scene.add(light);
    return light;
  });

  return {
    update(cellX: number, cellY: number, timeSec: number): void {
      const cells = nearestLitLights(grid, cellX, cellY, POOL_SIZE);
      lights.forEach((light, i) => {
        const cell = cells[i];
        if (!cell) {
          light.intensity = 0;
          return;
        }
        light.position.set(cellToWorld(cell.x), WALL_HEIGHT - 0.2, cellToWorld(cell.y));
        light.intensity = BASE_INTENSITY * flicker(timeSec, cell.y * grid.width + cell.x, seed);
      });
    },
  };
}
```

- [ ] **Step 6: Wire the pool into `src/main.ts`**

Add the import:

```ts
import { createLightPool } from './lighting/lightPool';
```

Lower the hemisphere light so dark zones read as dark — replace the `scene.add(new THREE.HemisphereLight(...))` line with:

```ts
scene.add(new THREE.HemisphereLight(0xfff2c4, 0x4a3f1c, 0.3));
```

After `const streamer = ...` add:

```ts
const lightPool = createLightPool(scene, level.grid, deriveSeed(seed, 'lights'));
```

In the animation loop, replace the `streamer.update(...)` line with:

```ts
  const cellX = worldToCell(player.pos.x);
  const cellY = worldToCell(player.pos.z);
  streamer.update(cellX, cellY);
  lightPool.update(cellX, cellY, now / 1000);
```

- [ ] **Step 7: Type-check, test, build, and verify in the browser**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: success.

Run `npm run dev`, open `http://localhost:5173`, click in, and walk.
Expected: pools of warm light under nearby panels; an occasional panel's light stutters; rooms with dead panels (dark zones) are noticeably darker; frame rate stays smooth (check the browser performance monitor or Task 10's fps counter).

- [ ] **Step 8: Commit**

```bash
git add src/lighting src/main.ts tests/lighting
git commit -m "feat: pooled point lights following the player with seeded fluorescent flicker"
```

---

### Task 10: Debug mode, seed parameter, docs

**Files:**
- Create: `src/ui/params.ts`, `src/ui/debugHud.ts`
- Modify: `src/main.ts`, `src/style.css`, `CLAUDE.md`, `README.md`
- Test: `tests/ui/params.test.ts`

**Interfaces:**
- Consumes: `Level` (Task 3), `PlayerState` (Task 5), grid helpers (Task 2)
- Produces:
  - `interface GameParams { debug: boolean; seed: number | null }`
  - `parseParams(search: string): GameParams` — `seed` accepted only as 1–10 decimal digits ≤ 0xffffffff
  - `createDebugHud(level: Level): { update(frameDt: number, player: PlayerState): void }`

- [ ] **Step 1: Write the failing test `tests/ui/params.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { parseParams } from '../../src/ui/params';

describe('parseParams', () => {
  it('defaults to no debug and no seed', () => {
    expect(parseParams('')).toEqual({ debug: false, seed: null });
  });

  it('enables debug with or without a value', () => {
    expect(parseParams('?debug').debug).toBe(true);
    expect(parseParams('?debug=1').debug).toBe(true);
  });

  it('accepts a valid unsigned 32-bit seed', () => {
    expect(parseParams('?seed=12345').seed).toBe(12345);
    expect(parseParams('?seed=0').seed).toBe(0);
    expect(parseParams('?seed=4294967295').seed).toBe(4294967295);
  });

  it.each(['abc', '-5', '1.5', '99999999999', '4294967296', '', '12a', ' 7'])('rejects seed=%j', (raw) => {
    expect(parseParams(`?seed=${encodeURIComponent(raw)}`).seed).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ui`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/ui/params.ts`**

```ts
export interface GameParams {
  debug: boolean;
  seed: number | null;
}

export function parseParams(search: string): GameParams {
  const params = new URLSearchParams(search);
  const raw = params.get('seed');
  const seed = raw !== null && /^\d{1,10}$/.test(raw) && Number(raw) <= 0xffffffff ? Number(raw) : null;
  return { debug: params.has('debug'), seed };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ui`
Expected: PASS.

- [ ] **Step 5: Create `src/ui/debugHud.ts`**

```ts
import type { PlayerState } from '../player/controller';
import type { Level } from '../world/generator';
import { Cell, CELL_SIZE, worldToCell } from '../world/grid';

const SCALE = 2; // minimap pixels per cell
const COLORS = { wall: '#1c1c1c', floor: '#c8b25a', dark: '#4a3f1c', pillar: '#666', start: '#3c3', exit: '#e33' };

function drawBaseMap(level: Level): HTMLCanvasElement {
  const { grid, start, exit } = level;
  const canvas = document.createElement('canvas');
  canvas.width = grid.width * SCALE;
  canvas.height = grid.height * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      const c = grid.cells[i];
      ctx.fillStyle =
        c === Cell.Wall ? COLORS.wall : c === Cell.Pillar ? COLORS.pillar : grid.dark[i] ? COLORS.dark : COLORS.floor;
      ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
    }
  }
  ctx.fillStyle = COLORS.start;
  ctx.fillRect((start.x - 1) * SCALE, (start.y - 1) * SCALE, SCALE * 3, SCALE * 3);
  ctx.fillStyle = COLORS.exit;
  ctx.fillRect((exit.x - 1) * SCALE, (exit.y - 1) * SCALE, SCALE * 3, SCALE * 3);
  return canvas;
}

/** `?debug` overlay: fps, seed, player cell, and a top-down minimap with heading. */
export function createDebugHud(level: Level) {
  const base = drawBaseMap(level);
  const root = document.createElement('div');
  root.className = 'debug';
  const info = document.createElement('div');
  const map = document.createElement('canvas');
  map.width = base.width;
  map.height = base.height;
  root.append(info, map);
  document.body.append(root);
  const ctx = map.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  let frames = 0;
  let elapsed = 0;
  let fps = 0;

  return {
    update(frameDt: number, player: PlayerState): void {
      frames++;
      elapsed += frameDt;
      if (elapsed >= 0.5) {
        fps = Math.round(frames / elapsed);
        frames = 0;
        elapsed = 0;
      }
      const cx = worldToCell(player.pos.x);
      const cy = worldToCell(player.pos.z);
      info.textContent = `${fps} fps · seed ${level.seed} · cell ${cx},${cy} · ${player.gait}`;

      ctx.drawImage(base, 0, 0);
      const px = (player.pos.x / CELL_SIZE) * SCALE;
      const py = (player.pos.z / CELL_SIZE) * SCALE;
      ctx.fillStyle = '#0af';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0af';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - Math.sin(player.yaw) * 10, py - Math.cos(player.yaw) * 10);
      ctx.stroke();
    },
  };
}
```

- [ ] **Step 6: Append debug styles to `src/style.css`**

```css
.debug {
  position: fixed;
  top: 8px;
  right: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font: 12px/1.3 'Courier New', monospace;
  color: #0f0;
  background: rgba(0, 0, 0, 0.6);
  padding: 6px;
  pointer-events: none;
}

.debug canvas {
  width: 200px;
  height: 200px;
  image-rendering: pixelated;
}
```

- [ ] **Step 7: Wire params and the HUD into `src/main.ts`**

Add the imports:

```ts
import { createDebugHud } from './ui/debugHud';
import { parseParams } from './ui/params';
```

Replace the `const seed = ...` line with:

```ts
const params = parseParams(window.location.search);
const seed = params.seed ?? Math.floor(Math.random() * 0xffffffff) >>> 0;
```

After `const player = ...` add:

```ts
const debugHud = params.debug ? createDebugHud(level) : null;
if (params.debug) console.info(`[backrooms] seed ${seed} — reload with ?debug&seed=${seed} to replay`);
```

At the end of the animation loop, just before `renderer.render(scene, camera);`, add:

```ts
  debugHud?.update(frameDt, player);
```

- [ ] **Step 8: Fill in the Commands section of `CLAUDE.md`**

Replace the Commands section body with:

````markdown
```
npm install
npm run dev       # http://localhost:5173 — add ?debug for fps/seed/minimap, ?seed=123 to replay a layout
npm test          # vitest (pure logic only)
npm run build     # tsc type-check + vite production build to dist/
```
````

- [ ] **Step 9: Add a "Run locally" section to `README.md`**

Append:

````markdown
## Run locally

```
npm install
npm run dev
```

Open http://localhost:5173 and click to enter. Controls: WASD move · mouse look · Shift sprint · C crouch · Esc release.
Add `?debug` for an fps counter and minimap, `?seed=123` to replay a specific layout.
````

- [ ] **Step 10: Full verification**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors; all tests PASS; build succeeds.

Run `npm run dev` and open:
- `http://localhost:5173/?debug&seed=42` — green HUD top-right shows fps (≈60 on a mid-range laptop), `seed 42`, the current cell and gait; the minimap shows yellow rooms, darker dark zones, a green start, a red exit, and a blue dot + heading that moves as you walk.
- Reload the same URL — identical minimap layout.
- `http://localhost:5173/?debug&seed=abc` — loads normally with a random seed (shown in the HUD), no errors.
- `http://localhost:5173/` — no HUD.

- [ ] **Step 11: Commit and push**

```bash
git add src/ui src/main.ts src/style.css tests/ui CLAUDE.md README.md
git commit -m "feat: debug HUD with fps, seed replay and minimap; document commands"
git push
```

---

## Milestone 1 done when

- `npm test` and `npm run build` pass.
- A fresh load drops the player into lit Level 0 rooms; walking, sprinting, crouching, looking and wall collision all work; dark zones are visibly darker; lights flicker occasionally.
- `?debug&seed=N` reproduces the same layout, and the fps counter holds ~60 on a mid-range laptop.
- Next: write the Milestone 2 plan (VHS camcorder) from the spec.
