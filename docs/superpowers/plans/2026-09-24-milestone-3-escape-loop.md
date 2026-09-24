# Milestone 3 — Escape Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the walkable, camcorder-filmed Level 0 into a game: painted arrows (and a few lying ones) lead toward a shimmering noclip wall; batteries, Almond Water and notes lie around; darkness drains a hidden sanity that warps the tape; sanity at zero ends the tape (TAPE ENDS → retry / new tape); walking into the noclip wall drops you out of Level 0 to a "LEVEL 1" teaser.

**Architecture:** Same split as before. Pure, tested modules decide everything: exit wall side and trigger, shortest path, arrow and decoy placement, item and note placement, sanity, interaction targeting, phase transitions, retry URLs, durations. Thin Three.js/DOM glue renders props (arrow decals, items, a glitching exit wall), shows prompts, the note reader and end screens, and feeds a new `uDistortion` uniform to the VHS shader.

**Tech Stack:** TypeScript, Vite, Three.js, Vitest, Google Fonts (VT323, Reenie Beanie).

**Spec:** `docs/superpowers/specs/2026-09-24-level-0-design.md` — implements Milestone 3 of §10: §5 step 5 (clues/items), §6 sanity + Almond Water + battery pickups + E interact, §8 note reader, TAPE ENDS and escape screens, §2 win/lose. Entities are Milestone 4; audio (whispers, footsteps) is Milestone 5.

## Global Constraints

- Everything from the Milestone 1 and 2 plans still applies.
- New pure modules must not import `three`: `src/world/exit.ts`, `src/world/clues.ts`, `src/world/items.ts`, `src/game/*`.
- Numbers from the spec, copied verbatim: battery pickup **+35 %** (capped at 100); Almond Water **+40 sanity**; **5–8 notes** (this plan: 6 from a pool of 8); arrows every **~15–25 cells** along the true shortest path, plus **a few decoys** (4); sanity **0–100, never shown as a number**; sanity 0 → tape ends; Retry = **same seed**, New tape = **new seed**.
- Rulings this plan makes where the spec is silent (each cheap to change):
  - Items are used on pickup — no inventory: E on a battery charges the camcorder, E on Almond Water drinks it, E on a note opens it.
  - Sanity drains 1.0/s in dark zones (halved with night vision on), regenerates 0.4/s in lit areas; entity drains come in M4.
  - Visual distortion starts below 60 sanity and is full at 0.
  - Retry / New tape reload the page with the right `?seed` (keeping `?debug` / `?god`) — the simplest complete reset.
  - The exit is never in a doorway (fixes the M1-deferred minor) and its noclip wall is chosen N, E, S, W in that order.
- Photosensitivity: the exit wall's shimmer is confined to one wall; end sequences use the existing glitch (thin streaks), no full-screen strobing.

## Review Focus

1. **Exit you can't physically trigger** — the noclip wall's trigger distance must be reachable given collision (the player's centre stops 0.3 m from walls). (Test: Task 1.)
2. **Items on cells the player can't reach or inside pillars, or two items overlapping** — every item on plain reachable floor, not on the start/exit cells, ≥ 4 cells apart. (Test: Task 3.)
3. **Dying while reading a note or on the pause screen** — sanity must only drain while playing; if it hits 0 the tape must end from playing or reading, never from title/pause, and end screens are terminal. (Test: Task 5.)
4. **Pressing E twice / on an already-taken item** — each item can be used once. (Test: Task 5.)
5. **Retry losing `?debug` / `?god`, or New tape keeping the old seed** — URLs must keep flags and set/remove the seed correctly. (Test: Task 8.)

---

## File Structure

```
src/
  world/grid.ts         + Dir, DIR_STEP, DIRS                               (Task 1)
  world/exit.ts         exit wall side, reachedExit                          (Task 1)
  world/generator.ts    exit not in doorways; Level.exitSide                 (Task 1)
  world/clues.ts        shortestPath, placeArrows (true + decoys)            (Task 2)
  game/notes.ts         8 notes (title + body)                               (Task 3)
  world/items.ts        placeItems (batteries, Almond Water, notes)          (Task 3)
  game/sanity.ts        sanity drain/regen, Almond Water, distortion curve   (Task 4)
  game/interact.ts      findInteractable, promptFor                          (Task 5)
  player/camcorder.ts   + addBattery                                          (Task 5)
  core/gameState.ts     + reading / ended / escaped phases                   (Task 5)
  world/props.ts        arrow decals, item meshes, noclip wall shader        (Task 6)
  ui/noteReader.ts      note overlay                                          (Task 7)
  ui/hud.ts             + interaction prompt                                 (Task 7)
  ui/params.ts          + god flag, tapeUrl                                  (Task 8)
  ui/osd.ts             + formatDuration                                     (Task 8)
  fx/vhsShader.ts, fx/composer.ts  + uDistortion                             (Task 8)
  main.ts, index.html, style.css                                             (Tasks 6–9)
```

---

### Task 1: Directions, the noclip exit wall, and no exits in doorways

**Files:**
- Modify: `src/world/grid.ts`, `src/world/generator.ts`
- Create: `src/world/exit.ts`
- Test: `tests/world/grid.test.ts` (append), `tests/world/exit.test.ts`, `tests/world/generator.test.ts` (append)

**Interfaces:**
- Produces (grid.ts): `type Dir = 'N' | 'E' | 'S' | 'W'`; `DIR_STEP: Record<Dir, Point>` (N = −y, E = +x, S = +y, W = −x); `DIRS: readonly Dir[]` = `['N', 'E', 'S', 'W']`
- Produces (exit.ts): `EXIT_TRIGGER = 0.45` (m); `exitWallSide(grid: Grid, exit: Point): Dir` (first wall neighbour in `DIRS` order; throws if none); `reachedExit(exit: Point, side: Dir, pos: { x: number; z: number }): boolean`
- Produces (generator.ts): `Level.exitSide: Dir`; exit cells always have `grid.room >= 0`

- [ ] **Step 1: Append failing tests to `tests/world/grid.test.ts`**

Add `DIR_STEP, DIRS` to the import from `'../../src/world/grid'`, then append:

```ts
describe('directions', () => {
  it('maps compass directions to grid steps (N = −y)', () => {
    expect(DIRS).toEqual(['N', 'E', 'S', 'W']);
    expect(DIR_STEP.N).toEqual({ x: 0, y: -1 });
    expect(DIR_STEP.E).toEqual({ x: 1, y: 0 });
    expect(DIR_STEP.S).toEqual({ x: 0, y: 1 });
    expect(DIR_STEP.W).toEqual({ x: -1, y: 0 });
  });
});
```

- [ ] **Step 2: Write the failing test `tests/world/exit.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS } from '../../src/player/collision';
import { exitWallSide, reachedExit } from '../../src/world/exit';
import { Cell, createGrid, setCell } from '../../src/world/grid';

/** 5×5 grid, floor at x,y ∈ 1..3. */
function room() {
  const g = createGrid(5, 5);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) setCell(g, x, y, Cell.Floor);
  return g;
}

describe('exitWallSide', () => {
  it('picks the first adjacent wall in N, E, S, W order', () => {
    expect(exitWallSide(room(), { x: 2, y: 1 })).toBe('N');
    expect(exitWallSide(room(), { x: 3, y: 2 })).toBe('E');
    expect(exitWallSide(room(), { x: 2, y: 3 })).toBe('S');
    expect(exitWallSide(room(), { x: 1, y: 2 })).toBe('W');
  });

  it('throws when the cell has no wall neighbour', () => {
    expect(() => exitWallSide(room(), { x: 2, y: 2 })).toThrow(/no adjacent wall/);
  });
});

describe('reachedExit', () => {
  it('triggers when the player is pressed against the wall face — reachable given collision', () => {
    // Exit cell (2,1) spans x∈[4,6], z∈[2,4]; its north wall face is z = 2.
    expect(reachedExit({ x: 2, y: 1 }, 'N', { x: 5, z: 2 + PLAYER_RADIUS + 0.001 })).toBe(true);
    // Cell (3,2) east wall face is x = 8.
    expect(reachedExit({ x: 3, y: 2 }, 'E', { x: 8 - PLAYER_RADIUS - 0.001, z: 5 })).toBe(true);
  });

  it('does not trigger from the middle of the cell or from a neighbouring cell', () => {
    expect(reachedExit({ x: 2, y: 1 }, 'N', { x: 5, z: 3 })).toBe(false);
    expect(reachedExit({ x: 2, y: 1 }, 'N', { x: 3.9, z: 2.31 })).toBe(false);
  });
});
```

- [ ] **Step 3: Append a failing test to `tests/world/generator.test.ts`**

Append inside the `describe('generateLevel', …)` block (before its closing `});`):

```ts
  it('never puts the exit in a doorway and records which wall is the noclip wall', () => {
    for (let seed = 3000; seed < 3025; seed++) {
      const { grid, exit, exitSide } = generateLevel(seed);
      expect(grid.room[exit.y * grid.width + exit.x]).toBeGreaterThanOrEqual(0);
      const step = DIR_STEP[exitSide];
      expect(getCell(grid, exit.x + step.x, exit.y + step.y)).toBe(Cell.Wall);
    }
  });
```

Add `DIR_STEP` to that file's import from `'../../src/world/grid'`.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/world`
Expected: FAIL — `DIRS`/`DIR_STEP` undefined, `exit` module not found, `exitSide` undefined.

- [ ] **Step 5: Add directions to `src/world/grid.ts`**

Append:

```ts
export type Dir = 'N' | 'E' | 'S' | 'W';

/** Grid step per compass direction: N = −y (world −Z), E = +x, S = +y, W = −x. */
export const DIR_STEP: Record<Dir, Point> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

export const DIRS: readonly Dir[] = ['N', 'E', 'S', 'W'];
```

- [ ] **Step 6: Create `src/world/exit.ts`**

```ts
import { Cell, CELL_SIZE, type Dir, DIR_STEP, DIRS, type Grid, getCell, type Point } from './grid';

/** How close (metres) the player's centre must get to the noclip wall's face to fall through. */
export const EXIT_TRIGGER = 0.45;

/** The noclip wall: the exit cell's first wall neighbour in N, E, S, W order. */
export function exitWallSide(grid: Grid, exit: Point): Dir {
  for (const d of DIRS) {
    const s = DIR_STEP[d];
    if (getCell(grid, exit.x + s.x, exit.y + s.y) === Cell.Wall) return d;
  }
  throw new Error(`exit ${exit.x},${exit.y} has no adjacent wall`);
}

/** True when the player stands in the exit cell pressed against its noclip wall. */
export function reachedExit(exit: Point, side: Dir, pos: { x: number; z: number }): boolean {
  const x0 = exit.x * CELL_SIZE;
  const z0 = exit.y * CELL_SIZE;
  const insideX = pos.x >= x0 && pos.x <= x0 + CELL_SIZE;
  const insideZ = pos.z >= z0 && pos.z <= z0 + CELL_SIZE;
  switch (side) {
    case 'N':
      return insideX && insideZ && pos.z - z0 <= EXIT_TRIGGER;
    case 'S':
      return insideX && insideZ && z0 + CELL_SIZE - pos.z <= EXIT_TRIGGER;
    case 'W':
      return insideX && insideZ && pos.x - x0 <= EXIT_TRIGGER;
    case 'E':
      return insideX && insideZ && x0 + CELL_SIZE - pos.x <= EXIT_TRIGGER;
  }
}
```

- [ ] **Step 7: Update `src/world/generator.ts`**

Add to the imports:

```ts
import { exitWallSide } from './exit';
```

and add `type Dir` to the import from `'./grid'`.

In `interface Level`, after `exit: Point;` add:

```ts
  /** Which wall of the exit cell is the noclip wall. */
  exitSide: Dir;
```

In `tryGenerate`, replace:

```ts
  return exit ? { grid, rooms, start, startYaw: pickStartYaw(grid, start), exit } : null;
```

with:

```ts
  return exit ? { grid, rooms, start, startYaw: pickStartYaw(grid, start), exit, exitSide: exitWallSide(grid, exit) } : null;
```

In `pickExit`, replace:

```ts
      if (grid.cells[i] !== Cell.Floor || dist[i] < 0 || grid.dark[i]) continue;
```

with:

```ts
      // room < 0 = doorway: a noclip wall there would sit in a door gap.
      if (grid.cells[i] !== Cell.Floor || grid.room[i] < 0 || dist[i] < 0 || grid.dark[i]) continue;
```

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 9: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/world tests/world
git commit -m "feat: noclip exit wall side and trigger; exits never in doorways"
```

---

### Task 2: Shortest path and painted arrows

**Files:**
- Create: `src/world/clues.ts`
- Test: `tests/world/clues.test.ts`

**Interfaces:**
- Consumes: `Rng` (M1); `Dir`, `DIR_STEP`, `DIRS` (Task 1); `bfsDistances` (M1)
- Produces:
  - `interface Arrow { cell: Point; wall: Dir; points: Dir; decoy: boolean }` — painted on `cell`'s `wall` side, pointing `points` (along the wall)
  - `ARROW_SPACING_MIN = 15`, `ARROW_SPACING_MAX = 25`, `DECOY_COUNT = 4`
  - `shortestPath(grid: Grid, from: Point, to: Point): Point[]` — inclusive of both ends; `[]` if unreachable
  - `placeArrows(grid: Grid, path: Point[], rng: Rng): Arrow[]`

- [ ] **Step 1: Write the failing test `tests/world/clues.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { ARROW_SPACING_MIN, DECOY_COUNT, placeArrows, shortestPath } from '../../src/world/clues';
import { generateLevel } from '../../src/world/generator';
import { Cell, createGrid, DIR_STEP, getCell, setCell } from '../../src/world/grid';
import { bfsDistances } from '../../src/world/pathing';

const level = generateLevel(42);
const path = shortestPath(level.grid, level.start, level.exit);

describe('shortestPath', () => {
  it('runs from start to exit through adjacent floor cells, with the BFS length', () => {
    expect(path[0]).toEqual(level.start);
    expect(path[path.length - 1]).toEqual(level.exit);
    for (let i = 1; i < path.length; i++) {
      expect(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y)).toBe(1);
      expect(getCell(level.grid, path[i].x, path[i].y)).toBe(Cell.Floor);
    }
    const d = bfsDistances(level.grid, level.start.x, level.start.y);
    expect(path.length - 1).toBe(d[level.exit.y * level.grid.width + level.exit.x]);
  });

  it('returns [] when the target is unreachable', () => {
    const g = createGrid(5, 3);
    setCell(g, 1, 1, Cell.Floor);
    setCell(g, 3, 1, Cell.Floor);
    expect(shortestPath(g, { x: 1, y: 1 }, { x: 3, y: 1 })).toEqual([]);
  });
});

describe('placeArrows', () => {
  const arrows = placeArrows(level.grid, path, createRng(7));
  const real = arrows.filter((a) => !a.decoy);
  const decoys = arrows.filter((a) => a.decoy);
  const indexOnPath = (a: { cell: { x: number; y: number } }) =>
    path.findIndex((p) => p.x === a.cell.x && p.y === a.cell.y);

  it('paints real arrows on walls along the path, pointing to the next path cell', () => {
    expect(real.length).toBeGreaterThanOrEqual(3);
    for (const a of real) {
      const i = indexOnPath(a);
      expect(i).toBeGreaterThanOrEqual(0);
      const next = path[i + 1];
      expect({ x: a.cell.x + DIR_STEP[a.points].x, y: a.cell.y + DIR_STEP[a.points].y }).toEqual(next);
      expect(getCell(level.grid, a.cell.x + DIR_STEP[a.wall].x, a.cell.y + DIR_STEP[a.wall].y)).toBe(Cell.Wall);
    }
  });

  it('spaces real arrows at least ARROW_SPACING_MIN path cells apart', () => {
    const idx = real.map(indexOnPath);
    for (let k = 1; k < idx.length; k++) expect(idx[k] - idx[k - 1]).toBeGreaterThanOrEqual(ARROW_SPACING_MIN);
  });

  it('adds decoys off the path, on walls, pointing along the wall', () => {
    expect(decoys).toHaveLength(DECOY_COUNT);
    for (const a of decoys) {
      expect(indexOnPath(a)).toBe(-1);
      expect(getCell(level.grid, a.cell.x + DIR_STEP[a.wall].x, a.cell.y + DIR_STEP[a.wall].y)).toBe(Cell.Wall);
      const w = DIR_STEP[a.wall];
      const p = DIR_STEP[a.points];
      expect(w.x * p.x + w.y * p.y).toBe(0);
    }
  });

  it('is deterministic', () => {
    expect(placeArrows(level.grid, path, createRng(7))).toEqual(arrows);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/world/clues.test.ts`
Expected: FAIL — cannot resolve `../../src/world/clues`.

- [ ] **Step 3: Implement `src/world/clues.ts`**

```ts
import type { Rng } from '../core/rng';
import { Cell, type Dir, DIR_STEP, DIRS, type Grid, getCell, inBounds, type Point } from './grid';
import { bfsDistances } from './pathing';

export interface Arrow {
  /** Floor cell the arrow is painted in. */
  cell: Point;
  /** Which of the cell's walls carries the paint. */
  wall: Dir;
  /** Direction the arrow points (along the wall). */
  points: Dir;
  /** Decoys point somewhere random, off the true path. */
  decoy: boolean;
}

export const ARROW_SPACING_MIN = 15;
export const ARROW_SPACING_MAX = 25;
export const DECOY_COUNT = 4;

const PERPENDICULAR: Record<Dir, readonly [Dir, Dir]> = { N: ['E', 'W'], S: ['E', 'W'], E: ['N', 'S'], W: ['N', 'S'] };

const isWallSide = (grid: Grid, p: Point, d: Dir) => getCell(grid, p.x + DIR_STEP[d].x, p.y + DIR_STEP[d].y) === Cell.Wall;

/** Shortest walkable path from → to (inclusive), following BFS distances from `to`. */
export function shortestPath(grid: Grid, from: Point, to: Point): Point[] {
  const dist = bfsDistances(grid, to.x, to.y);
  const at = (p: Point) => dist[p.y * grid.width + p.x];
  if (at(from) < 0) return [];
  const path: Point[] = [{ ...from }];
  let cur = from;
  while (at(cur) > 0) {
    const d = at(cur);
    const next = DIRS.map((dir) => ({ x: cur.x + DIR_STEP[dir].x, y: cur.y + DIR_STEP[dir].y })).find(
      (p) => inBounds(grid, p.x, p.y) && at(p) === d - 1,
    );
    if (!next) break;
    path.push(next);
    cur = next;
  }
  return path;
}

function dirBetween(a: Point, b: Point): Dir {
  const d = DIRS.find((dir) => a.x + DIR_STEP[dir].x === b.x && a.y + DIR_STEP[dir].y === b.y);
  if (!d) throw new Error('dirBetween: cells are not adjacent');
  return d;
}

/** Real arrows every ~15–25 path cells on a side wall, pointing onward; plus DECOY_COUNT random ones off-path. */
export function placeArrows(grid: Grid, path: Point[], rng: Rng): Arrow[] {
  const arrows: Arrow[] = [];
  let nextAt = rng.int(3, 8);
  for (let i = 0; i < path.length - 1; i++) {
    if (i < nextAt) continue;
    const cell = path[i];
    const points = dirBetween(cell, path[i + 1]);
    const wall = rng.shuffle([...PERPENDICULAR[points]]).find((d) => isWallSide(grid, cell, d));
    if (!wall) continue;
    arrows.push({ cell: { ...cell }, wall, points, decoy: false });
    nextAt = i + rng.int(ARROW_SPACING_MIN, ARROW_SPACING_MAX + 1);
  }

  const onPath = new Set(path.map((p) => p.y * grid.width + p.x));
  let decoys = 0;
  for (let attempt = 0; decoys < DECOY_COUNT && attempt < 5000; attempt++) {
    const cell = { x: rng.int(1, grid.width - 1), y: rng.int(1, grid.height - 1) };
    if (getCell(grid, cell.x, cell.y) !== Cell.Floor || onPath.has(cell.y * grid.width + cell.x)) continue;
    const wall = rng.shuffle([...DIRS]).find((d) => isWallSide(grid, cell, d));
    if (!wall) continue;
    arrows.push({ cell, wall, points: rng.pick(PERPENDICULAR[wall]), decoy: true });
    decoys++;
  }
  return arrows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/world/clues.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/world/clues.ts tests/world/clues.test.ts
git commit -m "feat: shortest path and painted arrow clues with decoys"
```

---

### Task 3: Notes and item placement

**Files:**
- Create: `src/game/notes.ts`, `src/world/items.ts`
- Test: `tests/game/notes.test.ts`, `tests/world/items.test.ts`

**Interfaces:**
- Consumes: `Level` (M1 + Task 1), `Rng` (M1), `shortestPath` (Task 2)
- Produces:
  - `interface Note { title: string; body: string }`, `NOTES: readonly Note[]` (8 notes)
  - `type ItemKind = 'battery' | 'almondWater' | 'note'`
  - `interface Item { id: number; kind: ItemKind; cell: Point; note: number | null }` — `note` indexes `NOTES`
  - `ITEM_COUNTS: Record<ItemKind, number>` = battery 12, almondWater 10, note 6; `MIN_ITEM_SPACING = 4`
  - `placeItems(level: Level, path: Point[], rng: Rng): Item[]` — ids 0..n-1

- [ ] **Step 1: Write the failing test `tests/game/notes.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { NOTES } from '../../src/game/notes';

describe('NOTES', () => {
  it('has enough short, non-empty notes to place 6 per tape', () => {
    expect(NOTES.length).toBeGreaterThanOrEqual(6);
    for (const n of NOTES) {
      expect(n.title.trim().length).toBeGreaterThan(0);
      expect(n.body.trim().length).toBeGreaterThan(0);
      expect(n.body.length).toBeLessThanOrEqual(420);
    }
  });

  it('hints at the arrows and the noclip wall', () => {
    expect(NOTES.filter((n) => /arrow/i.test(n.body)).length).toBeGreaterThanOrEqual(2);
    expect(NOTES.some((n) => /wall/i.test(n.body))).toBe(true);
  });
});
```

- [ ] **Step 2: Write the failing test `tests/world/items.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { shortestPath } from '../../src/world/clues';
import { generateLevel } from '../../src/world/generator';
import { Cell, getCell } from '../../src/world/grid';
import { ITEM_COUNTS, MIN_ITEM_SPACING, placeItems } from '../../src/world/items';

for (const seed of [7, 42]) {
  describe(`placeItems (seed ${seed})`, () => {
    const level = generateLevel(seed);
    const path = shortestPath(level.grid, level.start, level.exit);
    const items = placeItems(level, path, createRng(seed));
    const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

    it('places the configured number of each kind with sequential ids', () => {
      for (const kind of ['battery', 'almondWater', 'note'] as const) {
        expect(items.filter((i) => i.kind === kind)).toHaveLength(ITEM_COUNTS[kind]);
      }
      expect(items.map((i) => i.id)).toEqual(items.map((_, k) => k));
    });

    it('uses plain floor only, never the start or exit cell', () => {
      for (const it of items) {
        expect(getCell(level.grid, it.cell.x, it.cell.y)).toBe(Cell.Floor);
        expect(it.cell).not.toEqual(level.start);
        expect(it.cell).not.toEqual(level.exit);
      }
    });

    it('keeps items at least MIN_ITEM_SPACING apart', () => {
      for (let a = 0; a < items.length; a++) {
        for (let b = a + 1; b < items.length; b++) {
          expect(cheb(items[a].cell, items[b].cell)).toBeGreaterThanOrEqual(MIN_ITEM_SPACING);
        }
      }
    });

    it('favours the edges of dark zones for batteries and Almond Water', () => {
      const supplies = items.filter((i) => i.kind !== 'note');
      const nearDark = supplies.filter((i) => {
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const x = i.cell.x + dx;
            const y = i.cell.y + dy;
            if (x >= 0 && y >= 0 && x < level.grid.width && y < level.grid.height && level.grid.dark[y * level.grid.width + x]) return true;
          }
        }
        return false;
      });
      expect(nearDark.length / supplies.length).toBeGreaterThanOrEqual(0.5);
    });

    it('puts distinct notes within 6 cells of the true path', () => {
      const notes = items.filter((i) => i.kind === 'note');
      expect(new Set(notes.map((n) => n.note)).size).toBe(notes.length);
      for (const n of notes) expect(Math.min(...path.map((p) => cheb(p, n.cell)))).toBeLessThanOrEqual(6);
    });

    it('is deterministic', () => {
      expect(placeItems(level, path, createRng(seed))).toEqual(items);
    });
  });
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/game/notes.test.ts tests/world/items.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Create `src/game/notes.ts`**

```ts
export interface Note {
  title: string;
  body: string;
}

/** Notes left by earlier wanderers. Six are placed per tape. */
export const NOTES: readonly Note[] = [
  {
    title: 'Day ?',
    body: "I stopped counting the rooms. The hum never stops. If you're reading this, don't sit down. Keep walking.",
  },
  {
    title: 'Arrows',
    body: 'Someone painted arrows on the walls. Red, like old paint. I followed them for an hour and the rooms started to feel less the same. Trust the arrows. Mostly.',
  },
  {
    title: 'Not all of them',
    body: 'Some arrows lie. The real ones all lead the same way. If two disagree, walk on and look for the next arrow before you choose.',
  },
  {
    title: 'Water',
    body: 'Found a bottle of water that smells like almonds. It tastes wrong. My head cleared right after. Drink it when the walls start breathing.',
  },
  {
    title: 'The dark rooms',
    body: "Where the lights are dead, you start to come apart. Don't linger in there. If you have to cross, go quick, or use the camera's green.",
  },
  {
    title: 'Camera',
    body: 'The camcorder sees green in the dark. It eats batteries. There are batteries lying around, like someone left them for us. Or for bait.',
  },
  {
    title: 'The wall',
    body: "There's a wall out here that doesn't sit right. It shimmers, like the tape is chewed. I think you're supposed to walk into it. I'm too scared to try.",
  },
  {
    title: 'Last one',
    body: "If you find this, I went through the shimmering wall. Or I didn't. Either way, don't stay. The longer you stay, the less of you is left.",
  },
];
```

- [ ] **Step 5: Create `src/world/items.ts`**

```ts
import type { Rng } from '../core/rng';
import { NOTES } from '../game/notes';
import type { Level } from './generator';
import { Cell, type Grid, type Point } from './grid';

export type ItemKind = 'battery' | 'almondWater' | 'note';

export interface Item {
  id: number;
  kind: ItemKind;
  cell: Point;
  /** Index into NOTES for notes, otherwise null. */
  note: number | null;
}

export const ITEM_COUNTS: Record<ItemKind, number> = { battery: 12, almondWater: 10, note: 6 };
/** Minimum Chebyshev distance (cells) between any two items. */
export const MIN_ITEM_SPACING = 4;
const NEAR_DARK_RADIUS = 3;
/** Share of supplies drawn from dark-zone edges (the rest anywhere). */
const NEAR_DARK_BIAS = 0.7;
const NOTE_PATH_RADIUS = 6;
const MAX_TRIES = 400;

/** Marks every cell within `r` (Chebyshev) of a source cell. */
function dilate(grid: Grid, isSource: (i: number) => boolean, r: number): Uint8Array {
  const out = new Uint8Array(grid.cells.length);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!isSource(y * grid.width + x)) continue;
      for (let ny = Math.max(0, y - r); ny <= Math.min(grid.height - 1, y + r); ny++) {
        for (let nx = Math.max(0, x - r); nx <= Math.min(grid.width - 1, x + r); nx++) out[ny * grid.width + nx] = 1;
      }
    }
  }
  return out;
}

/** Batteries and Almond Water favour dark-zone edges; notes sit within reach of the true path. */
export function placeItems(level: Level, path: Point[], rng: Rng): Item[] {
  const { grid, start, exit } = level;
  const w = grid.width;
  const reserved = new Set([start.y * w + start.x, exit.y * w + exit.x]);
  const floor: number[] = [];
  for (let i = 0; i < grid.cells.length; i++) if (grid.cells[i] === Cell.Floor && !reserved.has(i)) floor.push(i);

  const darkEdge = dilate(grid, (i) => grid.dark[i] === 1, NEAR_DARK_RADIUS);
  const nearDark = floor.filter((i) => darkEdge[i] && !grid.dark[i]);
  const pathSet = new Set(path.map((p) => p.y * w + p.x));
  const pathBand = dilate(grid, (i) => pathSet.has(i), NOTE_PATH_RADIUS);
  const nearPath = floor.filter((i) => pathBand[i]);

  const items: Item[] = [];
  const farEnough = (x: number, y: number) =>
    items.every((it) => Math.max(Math.abs(it.cell.x - x), Math.abs(it.cell.y - y)) >= MIN_ITEM_SPACING);
  const place = (kind: ItemKind, pool: number[], note: number | null) => {
    if (pool.length === 0) return;
    for (let t = 0; t < MAX_TRIES; t++) {
      const i = rng.pick(pool);
      const x = i % w;
      const y = (i - x) / w;
      if (!farEnough(x, y)) continue;
      items.push({ id: items.length, kind, cell: { x, y }, note });
      return;
    }
  };
  const supplyPool = () => (nearDark.length > 0 && rng.chance(NEAR_DARK_BIAS) ? nearDark : floor);

  for (let k = 0; k < ITEM_COUNTS.battery; k++) place('battery', supplyPool(), null);
  for (let k = 0; k < ITEM_COUNTS.almondWater; k++) place('almondWater', supplyPool(), null);
  const noteIds = rng.shuffle(NOTES.map((_, k) => k)).slice(0, ITEM_COUNTS.note);
  for (const note of noteIds) place('note', nearPath.length > 0 ? nearPath : floor, note);
  return items;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/game/notes.test.ts tests/world/items.test.ts`
Expected: PASS.

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/game/notes.ts src/world/items.ts tests/game/notes.test.ts tests/world/items.test.ts
git commit -m "feat: notes and seeded placement of batteries, Almond Water and notes"
```

---

### Task 4: Sanity

**Files:**
- Create: `src/game/sanity.ts`
- Test: `tests/game/sanity.test.ts`

**Interfaces:**
- Produces:
  - `SANITY_MAX = 100`, `DARK_DRAIN = 1.0`, `NIGHT_VISION_DRAIN_FACTOR = 0.5`, `LIGHT_REGEN = 0.4`, `ALMOND_WATER = 40`, `DISTORTION_START = 60`
  - `interface Sanity { value: number }`, `createSanity(): Sanity`
  - `updateSanity(s: Sanity, dt: number, env: { dark: boolean; nightVision: boolean }): void`
  - `drinkAlmondWater(s: Sanity): void`, `isInsane(s: Sanity): boolean`
  - `distortionFromSanity(value: number): number` — 0 at ≥ 60, rising to 1 at 0

- [ ] **Step 1: Write the failing test `tests/game/sanity.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  ALMOND_WATER, createSanity, DARK_DRAIN, distortionFromSanity, drinkAlmondWater, isInsane, LIGHT_REGEN,
  NIGHT_VISION_DRAIN_FACTOR, SANITY_MAX, updateSanity,
} from '../../src/game/sanity';

const run = (s: ReturnType<typeof createSanity>, seconds: number, env: { dark: boolean; nightVision: boolean }) => {
  for (let i = 0; i < seconds * 10; i++) updateSanity(s, 0.1, env);
  return s;
};

describe('sanity', () => {
  it('starts full', () => {
    expect(createSanity().value).toBe(SANITY_MAX);
  });

  it('drains in the dark, slower with night vision', () => {
    expect(run(createSanity(), 10, { dark: true, nightVision: false }).value).toBeCloseTo(SANITY_MAX - DARK_DRAIN * 10, 6);
    expect(run(createSanity(), 10, { dark: true, nightVision: true }).value).toBeCloseTo(
      SANITY_MAX - DARK_DRAIN * NIGHT_VISION_DRAIN_FACTOR * 10,
      6,
    );
  });

  it('recovers slowly in the light, never above the max', () => {
    const s = createSanity();
    s.value = 50;
    run(s, 10, { dark: false, nightVision: false });
    expect(s.value).toBeCloseTo(50 + LIGHT_REGEN * 10, 6);
    run(s, 1000, { dark: false, nightVision: false });
    expect(s.value).toBe(SANITY_MAX);
  });

  it('bottoms out at 0 and reports insanity', () => {
    const s = run(createSanity(), 500, { dark: true, nightVision: false });
    expect(s.value).toBe(0);
    expect(isInsane(s)).toBe(true);
    expect(isInsane(createSanity())).toBe(false);
  });

  it('Almond Water restores 40, capped', () => {
    const s = createSanity();
    s.value = 30;
    drinkAlmondWater(s);
    expect(s.value).toBe(30 + ALMOND_WATER);
    drinkAlmondWater(s);
    drinkAlmondWater(s);
    expect(s.value).toBe(SANITY_MAX);
  });
});

describe('distortionFromSanity', () => {
  it('is 0 while sane, rises steadily, and is 1 at 0', () => {
    expect(distortionFromSanity(100)).toBe(0);
    expect(distortionFromSanity(60)).toBe(0);
    expect(distortionFromSanity(0)).toBe(1);
    const mid = distortionFromSanity(30);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(distortionFromSanity(20)).toBeGreaterThan(mid);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/game/sanity.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/game/sanity.ts`**

```ts
export const SANITY_MAX = 100;
/** Per second in a dark zone. */
export const DARK_DRAIN = 1.0;
/** Night vision makes the dark more bearable. */
export const NIGHT_VISION_DRAIN_FACTOR = 0.5;
/** Per second in lit areas. */
export const LIGHT_REGEN = 0.4;
export const ALMOND_WATER = 40;
/** Below this the tape starts to warp. */
export const DISTORTION_START = 60;

/** Hidden 0–100 meter; the player only ever sees its effects. */
export interface Sanity {
  value: number;
}

export function createSanity(): Sanity {
  return { value: SANITY_MAX };
}

export function updateSanity(s: Sanity, dt: number, env: { dark: boolean; nightVision: boolean }): void {
  const delta = env.dark ? -DARK_DRAIN * (env.nightVision ? NIGHT_VISION_DRAIN_FACTOR : 1) : LIGHT_REGEN;
  s.value = Math.min(SANITY_MAX, Math.max(0, s.value + delta * dt));
}

export function drinkAlmondWater(s: Sanity): void {
  s.value = Math.min(SANITY_MAX, s.value + ALMOND_WATER);
}

export function isInsane(s: Sanity): boolean {
  return s.value <= 0;
}

/** VHS distortion strength 0..1: none above DISTORTION_START, accelerating toward 1 at 0. */
export function distortionFromSanity(value: number): number {
  const t = Math.min(1, Math.max(0, (DISTORTION_START - value) / DISTORTION_START));
  return t ** 1.5;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/game/sanity.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/game/sanity.ts tests/game/sanity.test.ts
git commit -m "feat: hidden sanity meter with dark drain, light regen and Almond Water"
```

---

### Task 5: Interaction targeting, battery pickups, and new phases

**Files:**
- Create: `src/game/interact.ts`
- Modify: `src/player/camcorder.ts`, `src/core/gameState.ts`
- Test: `tests/game/interact.test.ts`, `tests/player/camcorder.test.ts` (append), `tests/core/gameState.test.ts` (append)

**Interfaces:**
- Consumes: `Item`, `ItemKind` (Task 3); `cellToWorld` (M1)
- Produces:
  - `INTERACT_RANGE = 1.6` (m); `findInteractable(items: readonly Item[], taken: ReadonlySet<number>, pos: { x: number; z: number }, yaw: number): Item | null` — nearest untaken item in range and in front (or underfoot within 0.5 m)
  - `promptFor(kind: ItemKind): string`
  - `BATTERY_PICKUP = 35`, `addBattery(c: Camcorder, amount?: number): void` (capped at 100)
  - `type Phase = 'title' | 'playing' | 'paused' | 'reading' | 'ended' | 'escaped'`
  - `type PhaseEvent = 'lock' | 'unlock' | 'readNote' | 'closeNote' | 'die' | 'escape'`
  - `nextPhase(phase: Phase, event: PhaseEvent): Phase` — `ended` and `escaped` are terminal

- [ ] **Step 1: Write the failing test `tests/game/interact.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { findInteractable, INTERACT_RANGE, promptFor } from '../../src/game/interact';
import type { Item } from '../../src/world/items';

// Cell (5,5) has its centre at world (11, 11).
const battery: Item = { id: 0, kind: 'battery', cell: { x: 5, y: 5 }, note: null };
const water: Item = { id: 1, kind: 'almondWater', cell: { x: 5, y: 4 }, note: null }; // centre (11, 9)
const none = new Set<number>();

describe('findInteractable', () => {
  it('finds an item in front of the player within range', () => {
    // Standing 1.2 m south of the battery, looking north (yaw 0 = −z).
    expect(findInteractable([battery], none, { x: 11, z: 12.2 }, 0)).toBe(battery);
  });

  it('ignores items behind the player or out of range', () => {
    expect(findInteractable([battery], none, { x: 11, z: 12.2 }, Math.PI)).toBeNull();
    expect(findInteractable([battery], none, { x: 11, z: 11 + INTERACT_RANGE + 0.1 }, 0)).toBeNull();
  });

  it('allows an item right underfoot whatever the facing', () => {
    expect(findInteractable([battery], none, { x: 11, z: 11.3 }, Math.PI)).toBe(battery);
  });

  it('never offers a taken item', () => {
    expect(findInteractable([battery], new Set([0]), { x: 11, z: 12.2 }, 0)).toBeNull();
  });

  it('prefers the nearest candidate', () => {
    expect(findInteractable([water, battery], none, { x: 11, z: 12.2 }, 0)).toBe(battery);
  });
});

describe('promptFor', () => {
  it('names the action for each kind', () => {
    expect(promptFor('battery')).toBe('[E] TAKE BATTERY');
    expect(promptFor('almondWater')).toBe('[E] DRINK ALMOND WATER');
    expect(promptFor('note')).toBe('[E] READ NOTE');
  });
});
```

- [ ] **Step 2: Append failing tests to `tests/player/camcorder.test.ts`**

Add `addBattery, BATTERY_PICKUP` to the import, then append:

```ts
describe('addBattery', () => {
  it('adds a pickup worth of charge, capped at the max', () => {
    const c = createCamcorder();
    c.battery = 20;
    addBattery(c);
    expect(c.battery).toBe(20 + BATTERY_PICKUP);
    addBattery(c);
    addBattery(c);
    expect(c.battery).toBe(BATTERY_MAX);
  });
});
```

- [ ] **Step 3: Append failing tests to `tests/core/gameState.test.ts`**

```ts
describe('nextPhase — notes and endings', () => {
  it('opens and closes notes only while playing', () => {
    expect(nextPhase('playing', 'readNote')).toBe('reading');
    expect(nextPhase('reading', 'closeNote')).toBe('playing');
    expect(nextPhase('paused', 'readNote')).toBe('paused');
    expect(nextPhase('title', 'closeNote')).toBe('title');
  });

  it('pauses when the pointer unlocks while reading', () => {
    expect(nextPhase('reading', 'unlock')).toBe('paused');
  });

  it('ends the tape from playing or reading, never from title or pause', () => {
    expect(nextPhase('playing', 'die')).toBe('ended');
    expect(nextPhase('reading', 'die')).toBe('ended');
    expect(nextPhase('paused', 'die')).toBe('paused');
    expect(nextPhase('title', 'die')).toBe('title');
  });

  it('escapes only while playing', () => {
    expect(nextPhase('playing', 'escape')).toBe('escaped');
    expect(nextPhase('paused', 'escape')).toBe('paused');
  });

  it('treats ended and escaped as terminal', () => {
    for (const terminal of ['ended', 'escaped'] as const) {
      for (const event of ['lock', 'unlock', 'readNote', 'closeNote', 'die', 'escape'] as const) {
        expect(nextPhase(terminal, event)).toBe(terminal);
      }
    }
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/game/interact.test.ts tests/player/camcorder.test.ts tests/core/gameState.test.ts`
Expected: FAIL — `interact` module not found; `addBattery` not exported; new phase events return wrong values.

- [ ] **Step 5: Create `src/game/interact.ts`**

```ts
import { cellToWorld } from '../world/grid';
import type { Item, ItemKind } from '../world/items';

/** Metres from the player's centre to an item's centre. */
export const INTERACT_RANGE = 1.6;
/** cos of the widest angle between the view direction and an item (60°). */
const MIN_FACING_DOT = 0.5;
/** Closer than this, an item counts as underfoot and facing doesn't matter. */
const UNDERFOOT = 0.5;

/** The nearest untaken item within reach that the player is facing. */
export function findInteractable(
  items: readonly Item[],
  taken: ReadonlySet<number>,
  pos: { x: number; z: number },
  yaw: number,
): Item | null {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  let best: Item | null = null;
  let bestDist = Infinity;
  for (const item of items) {
    if (taken.has(item.id)) continue;
    const dx = cellToWorld(item.cell.x) - pos.x;
    const dz = cellToWorld(item.cell.y) - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > INTERACT_RANGE || dist >= bestDist) continue;
    if (dist > UNDERFOOT && (dx * fx + dz * fz) / dist < MIN_FACING_DOT) continue;
    best = item;
    bestDist = dist;
  }
  return best;
}

const PROMPTS: Record<ItemKind, string> = {
  battery: '[E] TAKE BATTERY',
  almondWater: '[E] DRINK ALMOND WATER',
  note: '[E] READ NOTE',
};

export function promptFor(kind: ItemKind): string {
  return PROMPTS[kind];
}
```

- [ ] **Step 6: Add `addBattery` to `src/player/camcorder.ts`**

After `LOW_BATTERY` add:

```ts
/** Charge restored by one battery pickup (percent). */
export const BATTERY_PICKUP = 35;
```

and append:

```ts
export function addBattery(c: Camcorder, amount = BATTERY_PICKUP): void {
  c.battery = Math.min(BATTERY_MAX, c.battery + amount);
}
```

- [ ] **Step 7: Replace `src/core/gameState.ts`**

```ts
export type Phase = 'title' | 'playing' | 'paused' | 'reading' | 'ended' | 'escaped';
export type PhaseEvent = 'lock' | 'unlock' | 'readNote' | 'closeNote' | 'die' | 'escape';

/**
 * Pointer lock drives play/pause; notes open over play; `ended` (sanity gone) and `escaped`
 * (through the noclip wall) are terminal until the page reloads a tape.
 */
export function nextPhase(phase: Phase, event: PhaseEvent): Phase {
  if (phase === 'ended' || phase === 'escaped') return phase;
  switch (event) {
    case 'lock':
      return 'playing';
    case 'unlock':
      return phase === 'playing' || phase === 'reading' ? 'paused' : phase;
    case 'readNote':
      return phase === 'playing' ? 'reading' : phase;
    case 'closeNote':
      return phase === 'reading' ? 'playing' : phase;
    case 'die':
      return phase === 'playing' || phase === 'reading' ? 'ended' : phase;
    case 'escape':
      return phase === 'playing' ? 'escaped' : phase;
  }
}
```

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: all PASS (the existing lock/unlock tests keep passing).

- [ ] **Step 9: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/game/interact.ts src/player/camcorder.ts src/core/gameState.ts tests
git commit -m "feat: item targeting, battery pickups, and note/ending phases"
```

---

### Task 6: Props — arrow decals, items, and the noclip wall

**Files:**
- Create: `src/world/props.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Level` (Task 1), `Arrow` (Task 2), `Item` (Task 3), `WorldMaterials` (M1)
- Produces: `createProps(scene: THREE.Scene, level: Level, arrows: readonly Arrow[], items: readonly Item[], wallMap: THREE.Texture | null): { update(timeSec: number): void; hideItem(id: number): void }`

Rendering glue — verified in the browser.

- [ ] **Step 1: Create `src/world/props.ts`**

```ts
import * as THREE from 'three';
import type { Arrow } from './clues';
import type { Level } from './generator';
import { CELL_SIZE, cellToWorld, type Dir, DIR_STEP, WALL_HEIGHT } from './grid';
import type { Item } from './items';

/** Y-rotation that turns a +Z-facing plane to face out of the given wall into the cell. */
const FACE_ROTATION: Record<Dir, number> = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };
/** Which way a plane's texture +u runs in the world for each wall side. */
const TEXTURE_RIGHT: Record<Dir, Dir> = { N: 'E', S: 'W', W: 'N', E: 'S' };

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A hand-painted red arrow pointing +u, with drips. */
function arrowTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = 'rgba(128, 22, 14, 0.92)';
    ctx.strokeStyle = 'rgba(128, 22, 14, 0.92)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(24, 64);
    ctx.lineTo(196, 60);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(232, 62);
    ctx.lineTo(170, 22);
    ctx.lineTo(176, 102);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 4;
    for (const x of [60, 110, 150, 190]) {
      ctx.beginPath();
      ctx.moveTo(x, 70);
      ctx.lineTo(x + 2, 70 + 18 + (x % 3) * 8);
      ctx.stroke();
    }
  });
}

function paperTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 176, (ctx) => {
    ctx.fillStyle = '#e9e1cc';
    ctx.fillRect(0, 0, 128, 176);
    ctx.strokeStyle = 'rgba(40, 40, 70, 0.55)';
    ctx.lineWidth = 2;
    for (let y = 24; y < 160; y += 14) {
      ctx.beginPath();
      ctx.moveTo(14, y);
      for (let x = 14; x < 114; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.7 + y) * 2);
      ctx.stroke();
    }
  });
}

/** Wallpaper with rows shearing and sparking — the noclip wall. `uMap` is assigned by the caller. */
function noclipMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uMap: { value: null } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform sampler2D uMap;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        float t = fract(uTime / 100.0) * 100.0;
        float row = floor(vUv.y * 40.0);
        float shear = (hash(vec2(row, floor(t * 6.0))) - 0.5) * 0.12;
        vec3 c = texture2D(uMap, vUv + vec2(shear, 0.0)).rgb * 0.75;
        float spark = step(0.985, hash(floor(vUv * vec2(60.0, 80.0)) + floor(t * 8.0)));
        c = mix(c, vec3(1.0), spark * 0.7);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}

/** Position on the face of `side` wall of `cell`, pulled `offset` metres into the cell. */
function wallFacePosition(cell: { x: number; y: number }, side: Dir, offset: number, height: number): THREE.Vector3 {
  const s = DIR_STEP[side];
  return new THREE.Vector3(
    cellToWorld(cell.x) + s.x * (CELL_SIZE / 2 - offset),
    height,
    cellToWorld(cell.y) + s.y * (CELL_SIZE / 2 - offset),
  );
}

export function createProps(
  scene: THREE.Scene,
  level: Level,
  arrows: readonly Arrow[],
  items: readonly Item[],
  wallMap: THREE.Texture | null,
) {
  const group = new THREE.Group();
  group.name = 'props';
  scene.add(group);

  // Arrows: decals on wall faces.
  const arrowMat = new THREE.MeshStandardMaterial({
    map: arrowTexture(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    roughness: 0.9,
  });
  const arrowGeo = new THREE.PlaneGeometry(0.9, 0.45);
  for (const a of arrows) {
    const mesh = new THREE.Mesh(arrowGeo, arrowMat);
    mesh.position.copy(wallFacePosition(a.cell, a.wall, 0.01, 1.35));
    mesh.rotation.y = FACE_ROTATION[a.wall];
    if (TEXTURE_RIGHT[a.wall] !== a.points) mesh.rotation.z = Math.PI;
    group.add(mesh);
  }

  // Items.
  const batteryGeo = new THREE.BoxGeometry(0.18, 0.07, 0.1);
  const batteryMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, emissive: 0x442200, roughness: 0.5 });
  const bottleGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.24, 12);
  const bottleMat = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.25, transparent: true, opacity: 0.85 });
  const capGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10);
  const capMat = new THREE.MeshStandardMaterial({ color: 0x3355aa, roughness: 0.4 });
  const paperGeo = new THREE.PlaneGeometry(0.21, 0.29).rotateX(-Math.PI / 2);
  const paperMat = new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: 0.95 });
  const itemMeshes = new Map<number, THREE.Object3D>();
  for (const item of items) {
    let obj: THREE.Object3D;
    if (item.kind === 'battery') {
      obj = new THREE.Mesh(batteryGeo, batteryMat);
      obj.position.y = 0.035;
    } else if (item.kind === 'almondWater') {
      const bottle = new THREE.Group();
      const body = new THREE.Mesh(bottleGeo, bottleMat);
      body.position.y = 0.12;
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 0.255;
      bottle.add(body, cap);
      obj = bottle;
    } else {
      obj = new THREE.Mesh(paperGeo, paperMat);
      obj.position.y = 0.005;
    }
    obj.position.x = cellToWorld(item.cell.x);
    obj.position.z = cellToWorld(item.cell.y);
    obj.rotation.y = ((item.id * 2.399) % (Math.PI * 2)) - Math.PI;
    group.add(obj);
    itemMeshes.set(item.id, obj);
  }

  // The noclip wall.
  const noclip = noclipMaterial();
  // Assigned after creation: UniformsUtils.merge would otherwise clone the texture.
  noclip.uniforms.uMap.value = wallMap;
  const exitWall = new THREE.Mesh(new THREE.PlaneGeometry(CELL_SIZE, WALL_HEIGHT), noclip);
  exitWall.position.copy(wallFacePosition(level.exit, level.exitSide, 0.02, WALL_HEIGHT / 2));
  exitWall.rotation.y = FACE_ROTATION[level.exitSide];
  group.add(exitWall);

  return {
    update(timeSec: number): void {
      noclip.uniforms.uTime.value = timeSec;
    },
    hideItem(id: number): void {
      const obj = itemMeshes.get(id);
      if (obj) obj.visible = false;
    },
  };
}
```

- [ ] **Step 2: Wire props into `src/main.ts`**

Add imports:

```ts
import { placeArrows, shortestPath } from './world/clues';
import { placeItems } from './world/items';
import { createProps } from './world/props';
```

After `const lightPool = createLightPool(...)` add:

```ts
const truePath = shortestPath(level.grid, level.start, level.exit);
const arrows = placeArrows(level.grid, truePath, createRng(deriveSeed(seed, 'clues')));
const items = placeItems(level, truePath, createRng(deriveSeed(seed, 'items')));
const props = createProps(scene, level, arrows, items, materials.wall.map);
```

In the animation loop, after `lightPool.update(...)` add:

```ts
  props.update(now / 1000);
```

- [ ] **Step 3: Type-check, test, build, and verify in the browser**

Run: `npx tsc --noEmit && npm test && npm run build` — expected: success.

Open `http://localhost:5173/?debug&seed=42` and hide the overlay (or click in). Walk (or, headless, temporarily set the spawn to a path cell) and expect:
- Red painted arrows on side walls at head height, pointing along the corridor, never mirrored or floating.
- Small dark battery packs with a faint orange glow, white bottles with blue caps, and sheets of lined paper lying flat on the carpet.
- At the exit (red square on the minimap) one wall section shimmers: rows shear sideways and sparkle, fading into the fog like the rest of the scene.
- No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/world/props.ts src/main.ts
git commit -m "feat: render arrow decals, pickups, notes and the shimmering noclip wall"
```

---

### Task 7: Picking things up and reading notes

**Files:**
- Create: `src/ui/noteReader.ts`
- Modify: `src/ui/hud.ts`, `src/main.ts`, `src/style.css`, `index.html`, `public/CREDITS.md`

**Interfaces:**
- Consumes: `findInteractable`, `promptFor` (Task 5); `addBattery`; `createSanity`, `drinkAlmondWater` (Task 4); `NOTES`, `Note` (Task 3); `nextPhase`, `PhaseEvent` (Task 5); `props.hideItem` (Task 6)
- Produces:
  - `createNoteReader(parent: HTMLElement): { show(note: Note): void; setVisible(visible: boolean): void }`
  - `hud.setPrompt(text: string | null): void`

- [ ] **Step 1: Add the handwriting font to `index.html`**

Replace the VT323 stylesheet link with:

```html
    <link href="https://fonts.googleapis.com/css2?family=Reenie+Beanie&family=VT323&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Create `src/ui/noteReader.ts`**

```ts
import type { Note } from '../game/notes';

/** Full-screen scanned-paper view of a note. Text is set with textContent only. */
export function createNoteReader(parent: HTMLElement) {
  const root = document.createElement('div');
  root.id = 'note-reader';
  root.hidden = true;
  const paper = document.createElement('div');
  paper.className = 'paper';
  const title = document.createElement('h2');
  const body = document.createElement('p');
  const hint = document.createElement('p');
  hint.className = 'note-hint';
  hint.textContent = '[E] or click to put it down';
  paper.append(title, body);
  root.append(paper, hint);
  parent.append(root);

  return {
    show(note: Note): void {
      title.textContent = note.title;
      body.textContent = note.body;
    },
    setVisible(visible: boolean): void {
      root.hidden = !visible;
    },
  };
}
```

- [ ] **Step 3: Add the prompt to `src/ui/hud.ts`**

In the `root.innerHTML` template, after the `osd-br` line add:

```html
    <div class="osd-prompt"></div>
```

After `const bars = …;` add:

```ts
  const prompt = el('.osd-prompt');
  let lastPrompt: string | null = null;
```

In the returned object, after `setVisible`, add:

```ts
    setPrompt(text: string | null): void {
      if (text === lastPrompt) return;
      lastPrompt = text;
      prompt.textContent = text ?? '';
      prompt.hidden = text === null;
    },
```

- [ ] **Step 4: Append styles to `src/style.css`**

```css
.osd-prompt {
  position: absolute;
  left: 50%;
  bottom: 18vh;
  transform: translateX(-50%);
  font-size: 0.85em;
  padding: 0.1em 0.6em;
  background: rgba(0, 0, 0, 0.35);
}

.osd-prompt[hidden] {
  display: none;
}

#note-reader {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  background: rgba(0, 0, 0, 0.6);
}

#note-reader[hidden] {
  display: none;
}

#note-reader .paper {
  width: min(34rem, 86vw);
  padding: 2rem 2.4rem;
  background:
    repeating-linear-gradient(transparent 0 2.05rem, rgba(60, 70, 120, 0.18) 2.05rem 2.1rem),
    #efe7d2;
  color: #2b2418;
  font-family: 'Reenie Beanie', 'Segoe Print', cursive;
  font-size: 1.9rem;
  line-height: 2.1rem;
  transform: rotate(-1.5deg);
  box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.6);
}

#note-reader h2 {
  margin: 0 0 0.6rem;
  font-size: 2.3rem;
  text-transform: uppercase;
}

#note-reader p {
  margin: 0;
}

#note-reader .note-hint {
  font-family: 'VT323', 'Courier New', monospace;
  font-size: 1.3rem;
  color: #f4f4ec;
  opacity: 0.8;
}
```

- [ ] **Step 5: Wire interaction into `src/main.ts`**

Update imports:

```ts
import { nextPhase, type Phase, type PhaseEvent } from './core/gameState';
import { findInteractable, promptFor } from './game/interact';
import { NOTES } from './game/notes';
import { createSanity, drinkAlmondWater } from './game/sanity';
import { addBattery, createCamcorder, toggleNightVision, updateCamcorder } from './player/camcorder';
import { createNoteReader } from './ui/noteReader';
import type { Item } from './world/items';
```

(replacing the existing `gameState` and `camcorder` import lines).

After `const props = createProps(...)` add:

```ts
const taken = new Set<number>();
let notesFound = 0;
const sanity = createSanity();
const noteReader = createNoteReader(document.body);
```

Replace the whole `function showPhase(): void { … }` with:

```ts
function showPhase(): void {
  overlay.hidden = phase === 'playing' || phase === 'reading';
  titleScreen.hidden = phase !== 'title';
  pauseScreen.hidden = phase !== 'paused';
  noteReader.setVisible(phase === 'reading');
  hud.setVisible(phase !== 'title');
}

function setPhase(event: PhaseEvent): void {
  phase = nextPhase(phase, event);
  showPhase();
}

function interact(item: Item): void {
  taken.add(item.id);
  props.hideItem(item.id);
  if (item.kind === 'battery') addBattery(camcorder);
  else if (item.kind === 'almondWater') drinkAlmondWater(sanity);
  else if (item.note !== null) {
    notesFound++;
    noteReader.show(NOTES[item.note]);
    setPhase('readNote');
  }
}
```

Replace the `pointerlockchange` listener body with:

```ts
  input.clear();
  setPhase(isLocked() ? 'lock' : 'unlock');
```

After the `pointerlockchange` listener add:

```ts
// A click while reading puts the note down (the pointer is still locked).
window.addEventListener('mousedown', () => {
  if (phase === 'reading') setPhase('closeNote');
});
```

In the animation loop, after the `if (playing && input.consumePressed('KeyN')) …` line add:

```ts
  const target = playing ? findInteractable(items, taken, player.pos, player.yaw) : null;
  hud.setPrompt(target ? promptFor(target.kind) : null);
  if (input.consumePressed('KeyE')) {
    if (phase === 'reading') setPhase('closeNote');
    else if (target) interact(target);
  }
```

- [ ] **Step 6: Credit the font in `public/CREDITS.md`**

Append:

```markdown
| Reenie Beanie font (notes) | Google Fonts — James Grieshaber | SIL Open Font License 1.1 |
```

- [ ] **Step 7: Type-check, test, build, and verify in the browser**

Run: `npx tsc --noEmit && npm test && npm run build` — expected: success.

Hands-on (pointer lock required): walk up to a battery → `[E] TAKE BATTERY` appears above the timestamp; E removes it and the battery icon fills. A bottle → `[E] DRINK ALMOND WATER`. A note → `[E] READ NOTE`; E opens a tilted, handwritten, lined page over a dimmed screen; E or a click puts it down; Esc while reading shows the pause screen, and resuming returns to play with the note closed. Items behind you never show a prompt.

Headless check: with the overlay hidden and the spawn temporarily moved next to an item, the prompt text appears in the DOM (`document.querySelector('.osd-prompt').textContent`).

- [ ] **Step 8: Commit**

```bash
git add src/ui/noteReader.ts src/ui/hud.ts src/main.ts src/style.css index.html public/CREDITS.md
git commit -m "feat: E to take batteries, drink Almond Water and read notes"
```

---

### Task 8: Sanity on the tape, TAPE ENDS, retry and god mode

**Files:**
- Modify: `src/ui/params.ts`, `src/ui/osd.ts`, `src/fx/vhsShader.ts`, `src/fx/composer.ts`, `src/main.ts`, `index.html`, `src/style.css`
- Test: `tests/ui/params.test.ts` (append), `tests/ui/osd.test.ts` (append)

**Interfaces:**
- Consumes: `updateSanity`, `isInsane`, `distortionFromSanity` (Task 4); `isDark` (M1)
- Produces:
  - `GameParams.god: boolean`; `tapeUrl(href: string, seed: number | null): string` — keeps other params, sets `seed` or removes it
  - `formatDuration(seconds: number): string` — `MM:SS` (minutes may exceed 59)
  - `VhsParams.distortion: number` (0..1) → shader `uDistortion`

- [ ] **Step 1: Append failing tests to `tests/ui/params.test.ts`**

Change the import to `import { parseParams, tapeUrl } from '../../src/ui/params';`. Update the first test's expectation to `{ debug: false, seed: null, god: false }`. Append:

```ts
describe('god flag', () => {
  it('is on with ?god', () => {
    expect(parseParams('?debug&god').god).toBe(true);
    expect(parseParams('?debug').god).toBe(false);
  });
});

describe('tapeUrl', () => {
  it('retries the same tape, keeping other flags', () => {
    const url = new URL(tapeUrl('http://localhost:5173/?debug&god&seed=5', 42));
    expect(url.searchParams.get('seed')).toBe('42');
    expect(url.searchParams.has('debug')).toBe(true);
    expect(url.searchParams.has('god')).toBe(true);
  });

  it('starts a new tape by dropping the seed', () => {
    const url = new URL(tapeUrl('http://localhost:5173/?debug&seed=5', null));
    expect(url.searchParams.has('seed')).toBe(false);
    expect(url.searchParams.has('debug')).toBe(true);
  });
});
```

- [ ] **Step 2: Append a failing test to `tests/ui/osd.test.ts`**

Add `formatDuration` to the import, then append:

```ts
describe('formatDuration', () => {
  it('formats recorded time as MM:SS', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65.9)).toBe('01:05');
    expect(formatDuration(3600 + 125)).toBe('62:05');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/ui`
Expected: FAIL — `tapeUrl`/`formatDuration` not exported, `god` missing.

- [ ] **Step 4: Implement in `src/ui/params.ts` and `src/ui/osd.ts`**

Replace `src/ui/params.ts` with:

```ts
export interface GameParams {
  debug: boolean;
  seed: number | null;
  /** Debug: sanity never drains. */
  god: boolean;
}

export function parseParams(search: string): GameParams {
  const params = new URLSearchParams(search);
  const raw = params.get('seed');
  const seed = raw !== null && /^\d{1,10}$/.test(raw) && Number(raw) <= 0xffffffff ? Number(raw) : null;
  return { debug: params.has('debug'), seed, god: params.has('god') };
}

/** URL for replaying a tape (`seed`) or starting a new one (`null`), keeping other flags. */
export function tapeUrl(href: string, seed: number | null): string {
  const url = new URL(href);
  if (seed === null) url.searchParams.delete('seed');
  else url.searchParams.set('seed', String(seed));
  return url.toString();
}
```

Append to `src/ui/osd.ts`:

```ts
/** Recorded time as MM:SS (minutes may exceed 59). */
export function formatDuration(seconds: number): string {
  const s = Math.floor(seconds);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Add `uDistortion` to the VHS shader and composer**

In `src/fx/vhsShader.ts`:
- add `uDistortion: { value: 0 },` to `uniforms` and `uniform float uDistortion;` to the fragment declarations;
- after the `float t = …;` line add:

```glsl
      // Sanity: the picture swims.
      uv += vec2(sin(uv.y * 18.0 + t * 2.3), cos(uv.x * 14.0 + t * 1.7)) * 0.006 * uDistortion;
```

- change `float bleed = 0.0025 + uGlitch * 0.006;` to `float bleed = 0.0025 + uGlitch * 0.006 + uDistortion * 0.008;`
- change `float grain = 0.06 + uNightVision * 0.10 + (1.0 - power) * 0.15;` to `float grain = 0.06 + uNightVision * 0.10 + (1.0 - power) * 0.15 + uDistortion * 0.12;`
- change the vignette line to `col *= 1.0 - smoothstep(0.35 - 0.15 * uDistortion, 0.85 - 0.25 * uDistortion, length(vUv - 0.5));`

In `src/fx/composer.ts`, add to `VhsParams`:

```ts
  /** 0..1 sanity distortion. */
  distortion: number;
```

and in `render`, add `vhs.uniforms.uDistortion.value = p.distortion;`.

- [ ] **Step 7: Add the TAPE ENDS screen to `index.html`**

Change the title screen's hint line to:

```html
        <p class="hint">Click to start · WASD move · Mouse look · Shift sprint · C crouch · E use · N night vision · Esc pause</p>
```

Inside `#overlay`, after the pause screen, add:

```html
      <div id="end-screen" class="screen" hidden>
        <p class="title">TAPE ENDS</p>
        <p class="hint stats"></p>
        <div class="actions">
          <button type="button" id="retry-tape">↺ RETRY TAPE</button>
          <button type="button" class="new-tape">⏏ NEW TAPE</button>
        </div>
      </div>
      <p id="lock-error" class="lock-error" hidden>Couldn't capture the mouse — click again.</p>
```

- [ ] **Step 8: Append button and error styles to `src/style.css`**

```css
.screen .actions {
  display: flex;
  gap: 1.2rem;
  margin-top: 1.2rem;
  flex-wrap: wrap;
  justify-content: center;
}

.screen button {
  font: inherit;
  font-size: 1.6rem;
  color: #f4f4ec;
  background: rgba(0, 0, 0, 0.4);
  border: 2px solid currentColor;
  padding: 0.2em 0.9em;
  cursor: pointer;
}

.screen button:hover,
.screen button:focus-visible {
  background: #f4f4ec;
  color: #000;
}

.lock-error {
  position: absolute;
  bottom: 12vh;
  margin: 0;
  font-size: 1.2rem;
  color: #ffb4a8;
}

.lock-error[hidden] {
  display: none;
}
```

- [ ] **Step 9: Wire sanity, the ending and retry into `src/main.ts`**

Update imports:

```ts
import { createSanity, distortionFromSanity, drinkAlmondWater, isInsane, updateSanity } from './game/sanity';
import { formatDuration, tapeStartTime } from './ui/osd';
import { parseParams, tapeUrl } from './ui/params';
import { cellToWorld, isDark, worldToCell } from './world/grid';
import { ITEM_COUNTS, placeItems, type Item } from './world/items';
```

(replacing the existing sanity, osd, params, grid and items import lines; drop the separate `import type { Item }` line).

After the existing `const pauseScreen = …` line add:

```ts
const endScreen = document.getElementById('end-screen') as HTMLDivElement;
const lockError = document.getElementById('lock-error') as HTMLParagraphElement;
/** Seconds of glitching before an end screen appears. */
const END_REVEAL_SEC = 1.0;
```

After `const noteReader = …` add:

```ts
/** performance.now() when the tape ended or escaped; null while the tape is running. */
let endedAt: number | null = null;
let endRevealed = false;
```

Replace `showPhase` with:

```ts
function showPhase(): void {
  const over = phase === 'ended' || phase === 'escaped';
  overlay.hidden = phase === 'playing' || phase === 'reading' || (over && !endRevealed);
  titleScreen.hidden = phase !== 'title';
  pauseScreen.hidden = phase !== 'paused';
  endScreen.hidden = !(phase === 'ended' && endRevealed);
  noteReader.setVisible(phase === 'reading');
  hud.setVisible(phase !== 'title' && !(over && endRevealed));
}
```

After `interact` add:

```ts
function endTape(event: 'die' | 'escape', now: number): void {
  setPhase(event);
  endedAt = now;
  const stats = `RECORDED ${formatDuration(recordedSec)} · NOTES ${notesFound}/${ITEM_COUNTS.note}`;
  for (const el of document.querySelectorAll<HTMLElement>('.stats')) el.textContent = stats;
  document.exitPointerLock();
}
```

Replace the overlay click listener with:

```ts
overlay.addEventListener('click', () => {
  if (phase !== 'title' && phase !== 'paused') return;
  // Browsers refuse to re-lock for ~1 s after Esc; swallow that rejection — the next click works.
  Promise.resolve(canvas.requestPointerLock()).catch(() => undefined);
});
document.addEventListener('pointerlockerror', () => {
  lockError.hidden = false;
});
document.getElementById('retry-tape')?.addEventListener('click', () => location.assign(tapeUrl(location.href, seed)));
for (const button of document.querySelectorAll('.new-tape')) {
  button.addEventListener('click', () => location.assign(tapeUrl(location.href, null)));
}
```

In the `pointerlockchange` listener, add `if (isLocked()) lockError.hidden = true;` as its first line.

Replace the whole fixed-step block — from `const steps = stepper.advance(frameDt);` through the `for` loop's closing `}` — with:

```ts
  const steps = stepper.advance(frameDt);
  for (let i = 0; i < steps; i++) {
    // Steps keep running when not playing (with no input) so interpolation settles instead of drifting.
    updatePlayer(player, stepInput, FIXED_DT, level.grid);
    if (playing) {
      updateCamcorder(camcorder, FIXED_DT);
      recordedSec += FIXED_DT;
      if (!params.god) {
        const dark = isDark(level.grid, worldToCell(player.pos.x), worldToCell(player.pos.z));
        updateSanity(sanity, FIXED_DT, { dark, nightVision: camcorder.nightVision });
      }
    }
  }
  if (phase === 'playing' && isInsane(sanity)) endTape('die', now);
  if (endedAt !== null && !endRevealed && (now - endedAt) / 1000 >= END_REVEAL_SEC) {
    endRevealed = true;
    showPhase();
  }
```

Replace the `vhs.render({ … })` call with:

```ts
  const ending = endedAt !== null && !endRevealed;
  vhs.render({
    time: t,
    nightVision: camcorder.nvBlend,
    battery: camcorder.battery / 100,
    glitch: ending ? 1 : glitchAmount(t, glitchSeed, camcorder.battery),
    distortion: ending ? 1 : distortionFromSanity(sanity.value),
  });
```

- [ ] **Step 10: Type-check, test, build, and verify in the browser**

Run: `npx tsc --noEmit && npm test && npm run build` — expected: success.

Hands-on: stand in a dark zone (dark patches on the `?debug` minimap) for ~40 s → the picture starts to swim, fringe and close in; drinking Almond Water eases it; after ~100 s in the dark without night vision the tape glitches hard for a second and **TAPE ENDS** appears with `RECORDED mm:ss · NOTES n/6`, **↺ RETRY TAPE** (same map) and **⏏ NEW TAPE** (new map), both keeping `?debug`. With `?god` sanity never drains. The title hint now starts with "Click to start".

Headless: temporarily set `DARK_DRAIN` to `50` and spawn in a dark cell to see the ending within ~2 s; revert.

- [ ] **Step 11: Commit**

```bash
git add src index.html tests
git commit -m "feat: sanity warps the tape; TAPE ENDS with retry/new tape; god mode"
```

---

### Task 9: Falling through the noclip wall

**Files:**
- Modify: `index.html`, `src/main.ts`, `README.md`

**Interfaces:**
- Consumes: `reachedExit` (Task 1); `endTape`, `showPhase` (Task 8)

- [ ] **Step 1: Add the escape screen to `index.html`**

Inside `#overlay`, after the end screen, add:

```html
      <div id="escape-screen" class="screen" hidden>
        <p class="brand">YOU NOCLIPPED OUT</p>
        <p class="title">LEVEL 1</p>
        <p class="hint">HABITABLE ZONE — COMING SOON</p>
        <p class="hint stats"></p>
        <div class="actions">
          <button type="button" class="new-tape">⏏ NEW TAPE</button>
        </div>
      </div>
```

- [ ] **Step 2: Wire the exit into `src/main.ts`**

Add the import:

```ts
import { reachedExit } from './world/exit';
```

After `const endScreen = …` add:

```ts
const escapeScreen = document.getElementById('escape-screen') as HTMLDivElement;
/** The fall through the floor lasts a little longer than the TAPE ENDS glitch. */
const ESCAPE_REVEAL_SEC = 1.4;
```

In `showPhase`, after the `endScreen.hidden = …` line add:

```ts
  escapeScreen.hidden = !(phase === 'escaped' && endRevealed);
```

In the fixed-step loop, right after `updatePlayer(player, stepInput, FIXED_DT, level.grid);` add:

```ts
    if (playing && reachedExit(level.exit, level.exitSide, player.pos)) {
      endTape('escape', now);
      break;
    }
```

Replace the reveal check `(now - endedAt) / 1000 >= END_REVEAL_SEC` with:

```ts
(now - endedAt) / 1000 >= (phase === 'escaped' ? ESCAPE_REVEAL_SEC : END_REVEAL_SEC)
```

After the `camera.rotation.set(player.pitch, player.yaw, 0);` line add:

```ts
  if (phase === 'escaped' && endedAt !== null) {
    // Noclip: drop through the floor.
    const fall = (now - endedAt) / 1000;
    camera.position.y -= 4.9 * fall * fall;
  }
```

Note: the `playing` constant is computed once per frame before the step loop, so after `endTape('escape')` the `break` stops further steps that frame.

- [ ] **Step 3: Describe the goal in `README.md`**

After the first paragraph add:

```markdown
**Goal:** follow the painted arrows (not all of them tell the truth) to the wall that doesn't sit right, and walk into it. Batteries keep the camcorder's night vision alive; Almond Water steadies your nerves; the dark wears you down. If the tape ends, retry the same tape or start a new one.
```

- [ ] **Step 4: Type-check, test, build, and verify in the browser**

Run: `npx tsc --noEmit && npm test && npm run build` — expected: success.

Hands-on with `?debug&god`: follow the minimap to the red exit square and walk into the shimmering wall → the camera drops through the floor while the tape glitches, then **YOU NOCLIPPED OUT / LEVEL 1 / HABITABLE ZONE — COMING SOON** with stats and **⏏ NEW TAPE**.

Headless: temporarily spawn the player in the exit cell facing its noclip wall with `forward` held (or set `EXIT_TRIGGER` to 2) and confirm the escape screen appears after ~1.4 s; revert.

- [ ] **Step 5: Commit**

```bash
git add index.html src/main.ts README.md
git commit -m "feat: walking into the noclip wall drops you out to a LEVEL 1 teaser"
```

---

## Milestone 3 done when

- `npm test` and `npm run build` pass.
- A tape is winnable: arrows (with a few decoys) lead to a shimmering wall; walking into it plays the fall and shows the LEVEL 1 teaser.
- A tape is losable: lingering in the dark warps the tape until TAPE ENDS; Retry replays the same map, New tape a fresh one; `?god` disables sanity drain.
- Batteries, Almond Water and notes can each be used once via E; notes open in the reader and pause the world.
- Next: write the Milestone 4 plan (threats: director, Presence, Smilers, Howler).
