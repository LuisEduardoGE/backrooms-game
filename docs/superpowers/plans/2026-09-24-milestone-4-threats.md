# Milestone 4 — Threats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Level 0 hunt the player. Footsteps make noise; a director escalates from the Presence (lights die around you, the tape jolts) to Smilers (grinning eyes that live in dark zones and come for noise) to the Howler (a tall figure that roams the whole map, investigates noise, chases on sight and loses you after ~4 s out of view). Being caught ends the tape.

**Architecture:** Pure, tested modules make every decision: footsteps and noise, A* pathfinding and line of sight on the grid, one entity state machine (roam → investigate → chase → search) with per-kind tuning, the escalation director, spawn placement, fear-driven sanity drain. Thin Three.js glue renders a billboard Smiler face and a procedurally animated primitive Howler, and applies Presence blackouts through the light pool. Entities update in fixed steps only while playing.

**Tech Stack:** TypeScript, Vite, Three.js, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-level-0-design.md` — implements Milestone 4 of §10: §6 noise, §7 director / Presence / Smilers / Howler / entity state machine / A*, §6 sanity drain near entities and on sighting a Smiler, §8 god mode. Audio (mirrored footsteps, whispers, the warning howl) is Milestone 5.

## Global Constraints

- Everything from the Milestone 1–3 plans still applies.
- New pure modules must not import `three`: `src/game/noise.ts`, `src/game/astar.ts`, `src/game/los.ts`, `src/game/entity.ts`, `src/game/director.ts`, `src/game/spawns.ts`.
- Numbers copied from the spec: noise radius **crouch 0, walk ≈6 cells, sprint ≈18 cells**; Smilers from **3 min**, only in dark zones and never leaving them; Howler from **8 min or earlier if very loud**, exactly **one**, **chases on line of sight at sprint speed (4.5 m/s)**, **loses the player after ~4 s** without line of sight, then searches the last-known position; contact ends the tape; A* recomputed at a throttled rate.
- Rulings where the spec is silent or impractical (each cheap to change):
  - The Howler is a **procedural primitive figure** with a code-driven walk cycle instead of a downloaded Mixamo/Sketchfab model — no external asset, licence or loader; it reads as a tall silhouette under the VHS pass.
  - **Presence without audio (until M5):** every 20–40 s the lights within ~8 m of the player die for 3 s, the tape glitches for 0.8 s, and sanity takes a 3-point jolt.
  - **Loudness for the early Howler** counts each footstep as `(radius / 6)²` — a sprint step weighs 9× a walking step — against a threshold of 2500, so walking alone never beats the 8-minute timer but ~1.5 minutes of total sprinting does.
  - **Howler warning (until M5's howl):** 1.5 s of heavy tape glitch with the pooled lights held at 35 % — steady, not strobing.
  - Fear: +0.8 sanity/s drain while any entity is within 8 cells; +2/s more while a Smiler is in view (≤ 10 cells, clear line of sight).
  - `?god` also makes the player uncatchable and fearless.
- Performance: A* is capped at 3000 node expansions per search and re-planned at most every 0.5 s per entity; ≤ 6 entities exist.
- Photosensitivity: no new full-screen flashing; blackouts are 3 s steady, the Howler warning uses the existing glitch (thin streaks) plus a steady dim.

## Review Focus

1. **Pathfinding stalls the frame** — A* over a 200×200 grid must be bounded (expansion cap, throttled re-planning) so a far or unreachable goal can't hitch the game. (Test: Task 2.)
2. **Smilers leaving the dark** — a Smiler must never step onto a lit cell, even while it can see the player standing just outside. (Test: Task 3.)
3. **Unfair deaths** — entities spawn far away (Smilers ≥ 12 cells, the Howler 30–60 path cells) and only "catch" at contact (< 0.7 m), never through walls. (Tests: Tasks 3 and 4.)
4. **A Howler that can never be shaken** — out of sight for 4 s it must switch to searching, then give up and roam. (Test: Task 3.)
5. **Threats acting off-screen time** — entities, the director and fear only advance while playing (not on title, pause, note reader or end screens). (Task 6 wiring; phases already tested.)

---

## File Structure

```
src/
  game/noise.ts        footstep cadence, noise radius, loudness weight           (Task 1)
  game/astar.ts        A* with passability predicate and expansion cap           (Task 2)
  game/los.ts          grid line of sight between world points                    (Task 2)
  game/entity.ts       roam/investigate/chase/search brain, movement, catch       (Task 3)
  game/director.ts     escalation timeline, loudness, Presence schedule           (Task 4)
  game/spawns.ts       Smiler/Howler spawn cells                                  (Task 4)
  game/sanity.ts       + fear drain, jolt                                         (Task 4)
  world/entityViews.ts Smiler billboard + animated primitive Howler              (Task 5)
  lighting/lightPool.ts + blackout / dim                                          (Task 7)
  ui/debugHud.ts       + entity markers on the minimap                            (Task 6)
  main.ts                                                                          (Tasks 6–7)
```

---

### Task 1: Footsteps and noise

**Files:**
- Create: `src/game/noise.ts`
- Test: `tests/game/noise.test.ts`

**Interfaces:**
- Consumes: `Gait` (M1 `src/player/controller.ts`)
- Produces:
  - `NOISE_RADIUS: Record<Gait, number>` = crouch 0, walk 6, sprint 18 (cells)
  - `STEP_INTERVAL: Record<Gait, number>` = crouch 0.8, walk 0.55, sprint 0.35 (s)
  - `interface NoiseEvent { x: number; z: number; radius: number }` — world metres, radius in cells
  - `interface Footsteps { phase: number }`, `createFootsteps(): Footsteps`
  - `stepFootsteps(f: Footsteps, dt: number, moving: boolean, gait: Gait): number | null` — radius of a footstep landing this tick, else null
  - `noiseWeight(radius: number): number` — `(radius / 6)²`

- [ ] **Step 1: Write the failing test `tests/game/noise.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createFootsteps, NOISE_RADIUS, noiseWeight, stepFootsteps } from '../../src/game/noise';
import type { Gait } from '../../src/player/controller';

function steps(gait: Gait, seconds: number, moving = true, dt = 0.05) {
  const f = createFootsteps();
  const out: number[] = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const r = stepFootsteps(f, dt, moving, gait);
    if (r !== null) out.push(r);
  }
  return out;
}

describe('stepFootsteps', () => {
  it('lands walking steps every ~0.55 s at walking loudness', () => {
    expect(steps('walk', 1.2)).toEqual([NOISE_RADIUS.walk, NOISE_RADIUS.walk]);
  });

  it('lands sprint steps faster and louder', () => {
    expect(steps('sprint', 1.1)).toEqual([NOISE_RADIUS.sprint, NOISE_RADIUS.sprint, NOISE_RADIUS.sprint]);
  });

  it('makes crouched steps silent', () => {
    expect(steps('crouch', 2).every((r) => r === 0)).toBe(true);
  });

  it('makes no steps while standing still, and restarts the cycle on stopping', () => {
    expect(steps('walk', 3, false)).toEqual([]);
    const f = createFootsteps();
    stepFootsteps(f, 0.5, true, 'walk');
    stepFootsteps(f, 0.05, false, 'walk');
    expect(stepFootsteps(f, 0.5, true, 'walk')).toBeNull();
  });
});

describe('noiseWeight', () => {
  it('weighs a sprint step 9× a walking step and silence as nothing', () => {
    expect(noiseWeight(NOISE_RADIUS.walk)).toBe(1);
    expect(noiseWeight(NOISE_RADIUS.sprint)).toBe(9);
    expect(noiseWeight(0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/game/noise.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/game/noise.ts`**

```ts
import type { Gait } from '../player/controller';

/** How far (cells) a footstep carries. */
export const NOISE_RADIUS: Record<Gait, number> = { crouch: 0, walk: 6, sprint: 18 };
/** Seconds between footsteps. */
export const STEP_INTERVAL: Record<Gait, number> = { crouch: 0.8, walk: 0.55, sprint: 0.35 };

export interface NoiseEvent {
  /** World metres. */
  x: number;
  z: number;
  /** Cells. */
  radius: number;
}

export interface Footsteps {
  phase: number;
}

export function createFootsteps(): Footsteps {
  return { phase: 0 };
}

/** Advances the step cycle; returns the radius of a footstep that lands this tick, or null. */
export function stepFootsteps(f: Footsteps, dt: number, moving: boolean, gait: Gait): number | null {
  if (!moving) {
    f.phase = 0;
    return null;
  }
  f.phase += dt;
  const interval = STEP_INTERVAL[gait];
  if (f.phase < interval) return null;
  f.phase -= interval;
  return NOISE_RADIUS[gait];
}

/** How much a footstep counts toward summoning the Howler early: a sprint step is 9× a walking one. */
export function noiseWeight(radius: number): number {
  return (radius / NOISE_RADIUS.walk) ** 2;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/game/noise.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/game/noise.ts tests/game/noise.test.ts
git commit -m "feat: footstep cadence and noise radius by gait"
```

---

### Task 2: A* pathfinding and line of sight

**Files:**
- Create: `src/game/astar.ts`, `src/game/los.ts`
- Test: `tests/game/astar.test.ts`, `tests/game/los.test.ts`

**Interfaces:**
- Consumes: grid helpers, `DIRS`, `DIR_STEP`, `PILLAR_SIZE`, `CELL_SIZE` (M1/M3); `bfsDistances` (tests only)
- Produces:
  - `findPath(grid: Grid, from: Point, to: Point, canEnter?: (x: number, y: number) => boolean, maxExpansions?: number): Point[] | null` — inclusive of both ends; default `canEnter` = plain floor; default cap 3000
  - `hasLineOfSight(grid: Grid, a: { x: number; z: number }, b: { x: number; z: number }): boolean` — walls block; pillars block only inside their 0.8 m box

- [ ] **Step 1: Write the failing test `tests/game/astar.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { findPath } from '../../src/game/astar';
import { generateLevel } from '../../src/world/generator';
import { Cell, createGrid, setCell } from '../../src/world/grid';
import { bfsDistances } from '../../src/world/pathing';

/** 9×5 room with a wall column at x=4 except a gap at y=3. */
function room() {
  const g = createGrid(9, 5);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 7; x++) setCell(g, x, y, Cell.Floor);
  setCell(g, 4, 1, Cell.Wall);
  setCell(g, 4, 2, Cell.Wall);
  return g;
}

describe('findPath', () => {
  it('finds a shortest path around walls', () => {
    const g = room();
    const path = findPath(g, { x: 1, y: 1 }, { x: 7, y: 1 });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 1, y: 1 });
    expect(path![path!.length - 1]).toEqual({ x: 7, y: 1 });
    const d = bfsDistances(g, 1, 1);
    expect(path!.length - 1).toBe(d[1 * 9 + 7]);
    for (let i = 1; i < path!.length; i++) {
      expect(Math.abs(path![i].x - path![i - 1].x) + Math.abs(path![i].y - path![i - 1].y)).toBe(1);
    }
  });

  it('returns [from] when already there, null when blocked or the goal is off-limits', () => {
    const g = room();
    expect(findPath(g, { x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }]);
    setCell(g, 4, 3, Cell.Wall);
    expect(findPath(g, { x: 1, y: 1 }, { x: 7, y: 1 })).toBeNull();
    expect(findPath(room(), { x: 1, y: 1 }, { x: 0, y: 0 })).toBeNull();
  });

  it('respects a passability predicate', () => {
    const leftHalf = (x: number) => x < 4;
    expect(findPath(room(), { x: 1, y: 1 }, { x: 7, y: 1 }, (x, y) => leftHalf(x) && y > 0)).toBeNull();
    expect(findPath(room(), { x: 1, y: 1 }, { x: 3, y: 3 }, (x, y) => leftHalf(x) && y > 0)).not.toBeNull();
  });

  it('gives up (null) instead of stalling when the expansion cap is hit', () => {
    const level = generateLevel(42);
    const t0 = performance.now();
    expect(findPath(level.grid, level.start, level.exit, undefined, 50)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
```

- [ ] **Step 2: Write the failing test `tests/game/los.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { hasLineOfSight } from '../../src/game/los';
import { Cell, createGrid, setCell } from '../../src/world/grid';

/** 9×9 open room (floor x,y ∈ 1..7). World interior spans 2..16 m. */
function room() {
  const g = createGrid(9, 9);
  for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) setCell(g, x, y, Cell.Floor);
  return g;
}

describe('hasLineOfSight', () => {
  it('sees across an open room', () => {
    expect(hasLineOfSight(room(), { x: 3, z: 3 }, { x: 15, z: 15 })).toBe(true);
  });

  it('is blocked by a wall in between', () => {
    const g = room();
    setCell(g, 4, 4, Cell.Wall); // spans 8..10 m
    expect(hasLineOfSight(g, { x: 5, z: 9 }, { x: 13, z: 9 })).toBe(false);
  });

  it('is blocked by a pillar box but not by the empty part of a pillar cell', () => {
    const g = room();
    setCell(g, 4, 4, Cell.Pillar); // box spans 8.6..9.4 m
    expect(hasLineOfSight(g, { x: 5, z: 9 }, { x: 13, z: 9 })).toBe(false);
    expect(hasLineOfSight(g, { x: 5, z: 8.2 }, { x: 13, z: 8.2 })).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/game/astar.test.ts tests/game/los.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `src/game/astar.ts`**

```ts
import { Cell, DIR_STEP, DIRS, type Grid, getCell, inBounds, type Point } from '../world/grid';

/** Minimal binary min-heap of cell indices keyed by f-score. */
class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, key: number): void {
    this.items.push(item);
    this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.items.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}

/**
 * 4-neighbour A* (Manhattan heuristic). Returns the path from → to inclusive, or null when the goal
 * is off-limits, unreachable, or the expansion cap is hit (so a bad goal never stalls a frame).
 */
export function findPath(
  grid: Grid,
  from: Point,
  to: Point,
  canEnter: (x: number, y: number) => boolean = (x, y) => getCell(grid, x, y) === Cell.Floor,
  maxExpansions = 3000,
): Point[] | null {
  if (!canEnter(from.x, from.y) || !canEnter(to.x, to.y)) return null;
  const w = grid.width;
  const start = from.y * w + from.x;
  const goal = to.y * w + to.x;
  if (start === goal) return [{ ...from }];
  const h = (i: number) => {
    const x = i % w;
    return Math.abs(x - to.x) + Math.abs((i - x) / w - to.y);
  };

  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  open.push(start, h(start));
  let expansions = 0;

  while (open.size > 0) {
    const cur = open.pop()!;
    if (cur === goal) {
      const path: Point[] = [];
      for (let c: number | undefined = cur; c !== undefined; c = came.get(c)) {
        const x = c % w;
        path.push({ x, y: (c - x) / w });
      }
      return path.reverse();
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++expansions > maxExpansions) return null;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const d of DIRS) {
      const nx = cx + DIR_STEP[d].x;
      const ny = cy + DIR_STEP[d].y;
      if (!inBounds(grid, nx, ny) || !canEnter(nx, ny)) continue;
      const n = ny * w + nx;
      if (closed.has(n)) continue;
      const ng = g.get(cur)! + 1;
      if (ng < (g.get(n) ?? Infinity)) {
        g.set(n, ng);
        came.set(n, cur);
        open.push(n, ng + h(n));
      }
    }
  }
  return null;
}
```

- [ ] **Step 5: Implement `src/game/los.ts`**

```ts
import { Cell, CELL_SIZE, type Grid, getCell, PILLAR_SIZE, worldToCell } from '../world/grid';

const SAMPLE_STEP = 0.2;
const PILLAR_INSET = (CELL_SIZE - PILLAR_SIZE) / 2;

function blocksAt(grid: Grid, x: number, z: number): boolean {
  const cx = worldToCell(x);
  const cy = worldToCell(z);
  const c = getCell(grid, cx, cy);
  if (c === Cell.Wall) return true;
  if (c !== Cell.Pillar) return false;
  const lx = x - cx * CELL_SIZE;
  const lz = z - cy * CELL_SIZE;
  return lx > PILLAR_INSET && lx < CELL_SIZE - PILLAR_INSET && lz > PILLAR_INSET && lz < CELL_SIZE - PILLAR_INSET;
}

/** True when nothing solid lies between two world points (sampled every 0.2 m). */
export function hasLineOfSight(grid: Grid, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / SAMPLE_STEP);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (blocksAt(grid, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/game/astar.test.ts tests/game/los.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/game/astar.ts src/game/los.ts tests/game/astar.test.ts tests/game/los.test.ts
git commit -m "feat: capped A* pathfinding and grid line of sight"
```

---

### Task 3: The entity brain

**Files:**
- Create: `src/game/entity.ts`
- Test: `tests/game/entity.test.ts`

**Interfaces:**
- Consumes: `findPath` (Task 2), `hasLineOfSight` (Task 2), `NoiseEvent` (Task 1), `Rng` (M1), `Vec2` (M1 collision), grid helpers
- Produces:
  - `type EntityKind = 'smiler' | 'howler'`, `type EntityState = 'roam' | 'investigate' | 'chase' | 'search'`
  - `interface EntityTuning { roamSpeed: number; investigateSpeed: number; chaseSpeed: number; sightCells: number; roamRadius: number; loseSightSec: number; searchSec: number }`
  - `TUNING: Record<EntityKind, EntityTuning>` — Howler `chaseSpeed` 4.5, `loseSightSec` 4
  - `CATCH_DISTANCE = 0.7` (m)
  - `interface Entity { id: number; kind: EntityKind; pos: Vec2; prevPos: Vec2; heading: number; state: EntityState; goal: Point | null; path: Point[]; lastSeen: Vec2 | null; timer: number; repath: number }`
  - `interface EntityWorld { grid: Grid; canEnter: (x: number, y: number) => boolean; rng: Rng; player: Vec2; noises: readonly NoiseEvent[] }`
  - `createEntity(id: number, kind: EntityKind, cell: Point): Entity`
  - `updateEntity(e: Entity, dt: number, w: EntityWorld): void`
  - `caughtPlayer(e: Entity, player: Vec2): boolean`
- Convention: `heading` is a Three.js-style yaw — an object facing −Z rotated by `heading` faces the movement direction (`heading = atan2(−dx, −dz)`).

- [ ] **Step 1: Write the failing test `tests/game/entity.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { CATCH_DISTANCE, caughtPlayer, createEntity, type Entity, type EntityWorld, TUNING, updateEntity } from '../../src/game/entity';
import type { NoiseEvent } from '../../src/game/noise';
import { Cell, CELL_SIZE, cellToWorld, createGrid, getCell, type Grid, setCell, worldToCell } from '../../src/world/grid';

/** 30×30 open room (floor 1..28). */
function open(): Grid {
  const g = createGrid(30, 30);
  for (let y = 1; y <= 28; y++) for (let x = 1; x <= 28; x++) setCell(g, x, y, Cell.Floor);
  return g;
}
const floor = (g: Grid) => (x: number, y: number) => getCell(g, x, y) === Cell.Floor;
const at = (cx: number, cy: number) => ({ x: cellToWorld(cx), z: cellToWorld(cy) });

function world(g: Grid, player: { x: number; z: number }, noises: NoiseEvent[] = [], canEnter = floor(g)): EntityWorld {
  return { grid: g, canEnter, rng: createRng(3), player, noises };
}
function run(e: Entity, w: EntityWorld, seconds: number, dt = 1 / 60) {
  for (let i = 0; i < Math.round(seconds / dt); i++) updateEntity(e, dt, { ...w, noises: i === 0 ? w.noises : [] });
}

describe('updateEntity', () => {
  it('roams when it neither hears nor sees the player', () => {
    const g = open();
    // A wall across the room hides the player.
    for (let x = 1; x <= 28; x++) setCell(g, x, 15, Cell.Wall);
    const e = createEntity(0, 'howler', { x: 5, y: 5 });
    run(e, world(g, at(20, 25)), 5);
    expect(e.state).toBe('roam');
    expect(e.pos).not.toEqual(at(5, 5));
    expect(getCell(g, worldToCell(e.pos.x), worldToCell(e.pos.z))).toBe(Cell.Floor);
  });

  it('investigates a noise it can hear, and ignores one out of earshot', () => {
    const g = open();
    for (let x = 1; x <= 28; x++) setCell(g, x, 15, Cell.Wall);
    const hear = createEntity(0, 'howler', { x: 5, y: 5 });
    updateEntity(hear, 1 / 60, world(g, at(25, 25), [{ ...at(9, 5), radius: 6 }]));
    expect(hear.state).toBe('investigate');
    expect(hear.goal).toEqual({ x: 9, y: 5 });

    const deaf = createEntity(1, 'howler', { x: 5, y: 5 });
    updateEntity(deaf, 1 / 60, world(g, at(25, 25), [{ ...at(20, 5), radius: 6 }]));
    expect(deaf.state).toBe('roam');
  });

  it('chases a player it can see, closing the distance', () => {
    const g = open();
    const e = createEntity(0, 'howler', { x: 5, y: 5 });
    const player = at(15, 5);
    const before = Math.hypot(player.x - e.pos.x, player.z - e.pos.z);
    run(e, world(g, player), 1);
    expect(e.state).toBe('chase');
    expect(Math.hypot(player.x - e.pos.x, player.z - e.pos.z)).toBeLessThan(before - TUNING.howler.chaseSpeed * 0.8);
  });

  it('gives up the chase after losing sight, searches, then roams again', () => {
    const g = open();
    const e = createEntity(0, 'howler', { x: 5, y: 5 });
    run(e, world(g, at(12, 5)), 0.2);
    expect(e.state).toBe('chase');
    // Player vanishes far away behind a wall.
    for (let x = 1; x <= 28; x++) setCell(g, x, 20, Cell.Wall);
    const hidden = world(g, at(25, 26));
    run(e, hidden, TUNING.howler.loseSightSec + 0.2);
    expect(e.state).toBe('search');
    run(e, hidden, TUNING.howler.searchSec + 0.2);
    expect(e.state).toBe('roam');
  });

  it('never lets a Smiler leave its allowed (dark) cells, even while it sees the player', () => {
    const g = open();
    const dark = (x: number, y: number) => floor(g)(x, y) && x <= 10;
    const e = createEntity(0, 'smiler', { x: 5, y: 10 });
    const w = world(g, at(14, 10), [], dark);
    for (let i = 0; i < 600; i++) {
      updateEntity(e, 1 / 60, w);
      expect(worldToCell(e.pos.x)).toBeLessThanOrEqual(10);
    }
    expect(e.state).toBe('chase');
  });

  it('catches only at contact distance', () => {
    const e = createEntity(0, 'howler', { x: 5, y: 5 });
    expect(caughtPlayer(e, { x: e.pos.x + CATCH_DISTANCE * 0.9, z: e.pos.z })).toBe(true);
    expect(caughtPlayer(e, { x: e.pos.x + CELL_SIZE, z: e.pos.z })).toBe(false);
  });

  it('is deterministic for the same world', () => {
    const g = open();
    const a = createEntity(0, 'howler', { x: 5, y: 5 });
    const b = createEntity(0, 'howler', { x: 5, y: 5 });
    run(a, world(g, at(25, 25)), 3);
    run(b, world(g, at(25, 25)), 3);
    expect(a.pos).toEqual(b.pos);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/game/entity.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/game/entity.ts`**

```ts
import type { Rng } from '../core/rng';
import type { Vec2 } from '../player/collision';
import { CELL_SIZE, cellToWorld, type Grid, type Point, worldToCell } from '../world/grid';
import { findPath } from './astar';
import { hasLineOfSight } from './los';
import type { NoiseEvent } from './noise';

export type EntityKind = 'smiler' | 'howler';
export type EntityState = 'roam' | 'investigate' | 'chase' | 'search';

export interface EntityTuning {
  roamSpeed: number;
  investigateSpeed: number;
  chaseSpeed: number;
  /** How far it can see, in cells. */
  sightCells: number;
  /** How far it wanders when roaming, in cells. */
  roamRadius: number;
  loseSightSec: number;
  searchSec: number;
}

export const TUNING: Record<EntityKind, EntityTuning> = {
  smiler: { roamSpeed: 0.8, investigateSpeed: 1.8, chaseSpeed: 3.2, sightCells: 10, roamRadius: 6, loseSightSec: 4, searchSec: 6 },
  howler: { roamSpeed: 1.4, investigateSpeed: 2.6, chaseSpeed: 4.5, sightCells: 20, roamRadius: 20, loseSightSec: 4, searchSec: 8 },
};

/** Metres between centres at which the player is caught. */
export const CATCH_DISTANCE = 0.7;
const REPATH_SEC = 0.5;
const SEARCH_WANDER = 4;
const MAX_PATH_EXPANSIONS = 3000;

export interface Entity {
  id: number;
  kind: EntityKind;
  pos: Vec2;
  prevPos: Vec2;
  heading: number;
  state: EntityState;
  goal: Point | null;
  path: Point[];
  lastSeen: Vec2 | null;
  /** Counts down: sight-loss grace while chasing, remaining search time while searching. */
  timer: number;
  repath: number;
}

export interface EntityWorld {
  grid: Grid;
  canEnter: (x: number, y: number) => boolean;
  rng: Rng;
  player: Vec2;
  noises: readonly NoiseEvent[];
}

export function createEntity(id: number, kind: EntityKind, cell: Point): Entity {
  const pos = { x: cellToWorld(cell.x), z: cellToWorld(cell.y) };
  return { id, kind, pos, prevPos: { ...pos }, heading: 0, state: 'roam', goal: null, path: [], lastSeen: null, timer: 0, repath: 0 };
}

const cellOf = (p: Vec2): Point => ({ x: worldToCell(p.x), y: worldToCell(p.z) });
const sameCell = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

function randomNearby(w: EntityWorld, around: Point, radius: number): Point | null {
  for (let t = 0; t < 30; t++) {
    const p = { x: around.x + w.rng.int(-radius, radius + 1), y: around.y + w.rng.int(-radius, radius + 1) };
    if (w.canEnter(p.x, p.y)) return p;
  }
  return null;
}

function setGoal(e: Entity, goal: Point | null): void {
  e.goal = goal;
  e.path = [];
  e.repath = 0;
}

export function updateEntity(e: Entity, dt: number, w: EntityWorld): void {
  const t = TUNING[e.kind];
  e.prevPos = { ...e.pos };
  const here = cellOf(e.pos);

  // Senses.
  const distCells = Math.hypot(w.player.x - e.pos.x, w.player.z - e.pos.z) / CELL_SIZE;
  const sees = distCells <= t.sightCells && hasLineOfSight(w.grid, e.pos, w.player);
  if (sees) {
    e.lastSeen = { ...w.player };
    if (e.state !== 'chase') e.state = 'chase';
    e.timer = t.loseSightSec;
    const target = cellOf(w.player);
    if (!e.goal || !sameCell(e.goal, target)) e.goal = target;
  } else if (e.state === 'chase') {
    e.timer -= dt;
    if (e.timer <= 0) {
      e.state = 'search';
      e.timer = t.searchSec;
      setGoal(e, e.lastSeen ? cellOf(e.lastSeen) : null);
    }
  }
  if (e.state !== 'chase') {
    for (const n of w.noises) {
      if (n.radius > 0 && Math.hypot(n.x - e.pos.x, n.z - e.pos.z) / CELL_SIZE <= n.radius) {
        e.state = 'investigate';
        setGoal(e, cellOf(n));
      }
    }
  }

  // Goals per state.
  const arrived = e.goal !== null && e.path.length === 0 && sameCell(here, e.goal);
  if (e.state === 'investigate' && (arrived || e.goal === null)) {
    e.state = 'search';
    e.timer = t.searchSec;
    setGoal(e, null);
  }
  if (e.state === 'search') {
    e.timer -= dt;
    if (e.timer <= 0) {
      e.state = 'roam';
      setGoal(e, null);
    } else if (e.goal === null || arrived) {
      setGoal(e, randomNearby(w, e.lastSeen ? cellOf(e.lastSeen) : here, SEARCH_WANDER));
    }
  }
  if (e.state === 'roam' && (e.goal === null || arrived)) setGoal(e, randomNearby(w, here, t.roamRadius));

  // Planning (throttled).
  e.repath -= dt;
  if (e.goal && (e.repath <= 0 || e.path.length === 0) && !sameCell(here, e.goal)) {
    const path = findPath(w.grid, here, e.goal, w.canEnter, MAX_PATH_EXPANSIONS);
    e.path = path ? path.slice(1) : [];
    e.repath = REPATH_SEC;
    if (!path && e.state !== 'chase') setGoal(e, null);
  }

  // Movement along the path.
  const speed = e.state === 'chase' ? t.chaseSpeed : e.state === 'investigate' ? t.investigateSpeed : t.roamSpeed;
  let budget = speed * dt;
  while (budget > 0 && e.path.length > 0) {
    const target = { x: cellToWorld(e.path[0].x), z: cellToWorld(e.path[0].y) };
    const dx = target.x - e.pos.x;
    const dz = target.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) e.heading = Math.atan2(-dx, -dz);
    if (d <= budget) {
      e.pos = target;
      e.path.shift();
      budget -= d;
    } else {
      e.pos = { x: e.pos.x + (dx / d) * budget, z: e.pos.z + (dz / d) * budget };
      budget = 0;
    }
  }
}

export function caughtPlayer(e: Entity, player: Vec2): boolean {
  return Math.hypot(player.x - e.pos.x, player.z - e.pos.z) < CATCH_DISTANCE;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/game/entity.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/game/entity.ts tests/game/entity.test.ts
git commit -m "feat: entity brain — roam, investigate noise, chase on sight, search, catch"
```

---

### Task 4: Director, spawns, and fear

**Files:**
- Create: `src/game/director.ts`, `src/game/spawns.ts`
- Modify: `src/game/sanity.ts`
- Test: `tests/game/director.test.ts`, `tests/game/spawns.test.ts`, `tests/game/sanity.test.ts` (append)

**Interfaces:**
- Consumes: `noiseWeight` (Task 1), `Entity` (Task 3), `bfsDistances`, grid helpers, `Rng`
- Produces (director.ts):
  - `SMILER_PHASE_SEC = 180`, `HOWLER_PHASE_SEC = 480`, `LOUD_THRESHOLD = 2500`
  - `interface Director { time: number; loudness: number; smilersSpawned: boolean; howlerSpawned: boolean; nextPresenceAt: number }`
  - `type DirectorEvent = 'spawnSmilers' | 'spawnHowler' | 'presence'`
  - `createDirector(rng: Rng): Director`; `updateDirector(d: Director, dt: number, footstep: number | null, rng: Rng): DirectorEvent[]`
- Produces (spawns.ts): `MAX_SMILERS = 5`; `spawnSmilerCells(grid: Grid, player: Point, rng: Rng, max?: number): Point[]` (dark floor, ≥ 12 cells from the player, ≥ 20 apart); `spawnHowlerCell(grid: Grid, player: Point, rng: Rng): Point | null` (30–60 path cells away)
- Produces (sanity.ts): `NEAR_ENTITY_CELLS = 8`, `NEAR_ENTITY_DRAIN = 0.8`, `SMILER_SIGHT_DRAIN = 2`; `fearDrain(entities: readonly { pos: { x: number; z: number } }[], player: { x: number; z: number }, seesSmiler: boolean): number`; `jolt(s: Sanity, amount: number): void`; `updateSanity` env gains optional `fear?: number` (extra drain per second)

- [ ] **Step 1: Write the failing test `tests/game/director.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { createDirector, type DirectorEvent, HOWLER_PHASE_SEC, SMILER_PHASE_SEC, updateDirector } from '../../src/game/director';
import { NOISE_RADIUS } from '../../src/game/noise';

function run(seconds: number, footstepEvery: number | null, radius = NOISE_RADIUS.walk) {
  const rng = createRng(1);
  const d = createDirector(rng);
  const events: { t: number; e: DirectorEvent }[] = [];
  const dt = 0.05;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const step = footstepEvery !== null && i % Math.round(footstepEvery / dt) === 0 ? radius : null;
    for (const e of updateDirector(d, dt, step, rng)) events.push({ t: d.time, e });
  }
  return events;
}

describe('updateDirector', () => {
  it('spawns Smilers once at 3 minutes and the Howler once at 8 minutes for a quiet player', () => {
    const events = run(HOWLER_PHASE_SEC + 5, 0.55);
    const smilers = events.filter((x) => x.e === 'spawnSmilers');
    const howler = events.filter((x) => x.e === 'spawnHowler');
    expect(smilers).toHaveLength(1);
    expect(smilers[0].t).toBeCloseTo(SMILER_PHASE_SEC, 0);
    expect(howler).toHaveLength(1);
    expect(howler[0].t).toBeCloseTo(HOWLER_PHASE_SEC, 0);
  });

  it('brings the Howler early for a player who keeps sprinting', () => {
    const howler = run(HOWLER_PHASE_SEC, 0.35, NOISE_RADIUS.sprint).filter((x) => x.e === 'spawnHowler');
    expect(howler).toHaveLength(1);
    expect(howler[0].t).toBeLessThan(200);
  });

  it('fires the Presence every 20–40 seconds from the start', () => {
    const times = run(300, null).filter((x) => x.e === 'presence').map((x) => x.t);
    expect(times.length).toBeGreaterThanOrEqual(7);
    expect(times[0]).toBeGreaterThanOrEqual(20);
    expect(times[0]).toBeLessThanOrEqual(40);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(19.9);
      expect(times[i] - times[i - 1]).toBeLessThanOrEqual(40.1);
    }
  });
});
```

- [ ] **Step 2: Write the failing test `tests/game/spawns.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { MAX_SMILERS, spawnHowlerCell, spawnSmilerCells } from '../../src/game/spawns';
import { generateLevel } from '../../src/world/generator';
import { Cell, getCell, isDark } from '../../src/world/grid';
import { bfsDistances } from '../../src/world/pathing';

const level = generateLevel(42);
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('spawnSmilerCells', () => {
  const cells = spawnSmilerCells(level.grid, level.start, createRng(5));

  it('spawns up to MAX_SMILERS in dark floor cells, far from the player and spread out', () => {
    expect(cells.length).toBeGreaterThanOrEqual(1);
    expect(cells.length).toBeLessThanOrEqual(MAX_SMILERS);
    for (const c of cells) {
      expect(getCell(level.grid, c.x, c.y)).toBe(Cell.Floor);
      expect(isDark(level.grid, c.x, c.y)).toBe(true);
      expect(cheb(c, level.start)).toBeGreaterThanOrEqual(12);
    }
    for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) expect(cheb(cells[a], cells[b])).toBeGreaterThanOrEqual(20);
  });
});

describe('spawnHowlerCell', () => {
  it('spawns 30–60 walking cells away from the player', () => {
    const cell = spawnHowlerCell(level.grid, level.start, createRng(5));
    expect(cell).not.toBeNull();
    const d = bfsDistances(level.grid, level.start.x, level.start.y)[cell!.y * level.grid.width + cell!.x];
    expect(d).toBeGreaterThanOrEqual(30);
    expect(d).toBeLessThanOrEqual(60);
  });
});
```

- [ ] **Step 3: Append failing tests to `tests/game/sanity.test.ts`**

Add `fearDrain, jolt, NEAR_ENTITY_DRAIN, SMILER_SIGHT_DRAIN` to the import, then append:

```ts
describe('fear', () => {
  it('drains near entities and more while a Smiler is in view', () => {
    const player = { x: 10, z: 10 };
    expect(fearDrain([], player, false)).toBe(0);
    expect(fearDrain([{ pos: { x: 12, z: 10 } }], player, false)).toBe(NEAR_ENTITY_DRAIN);
    expect(fearDrain([{ pos: { x: 60, z: 10 } }], player, false)).toBe(0);
    expect(fearDrain([{ pos: { x: 12, z: 10 } }], player, true)).toBe(NEAR_ENTITY_DRAIN + SMILER_SIGHT_DRAIN);
  });

  it('adds fear to the drain, and jolts subtract instantly without going below 0', () => {
    const s = createSanity();
    updateSanity(s, 1, { dark: false, nightVision: false, fear: 2 });
    expect(s.value).toBeCloseTo(SANITY_MAX - 2 + LIGHT_REGEN, 6);
    jolt(s, 3);
    expect(s.value).toBeCloseTo(SANITY_MAX - 5 + LIGHT_REGEN, 6);
    jolt(s, 500);
    expect(s.value).toBe(0);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/game`
Expected: FAIL — `director`/`spawns` modules not found; `fearDrain`/`jolt` not exported.

- [ ] **Step 5: Implement `src/game/director.ts`**

```ts
import type { Rng } from '../core/rng';
import { noiseWeight } from './noise';

export const SMILER_PHASE_SEC = 180;
export const HOWLER_PHASE_SEC = 480;
/** Summed footstep weight (walk = 1, sprint = 9) that summons the Howler early. */
export const LOUD_THRESHOLD = 2500;
const PRESENCE_MIN_SEC = 20;
const PRESENCE_MAX_SEC = 40;

export interface Director {
  time: number;
  loudness: number;
  smilersSpawned: boolean;
  howlerSpawned: boolean;
  nextPresenceAt: number;
}

export type DirectorEvent = 'spawnSmilers' | 'spawnHowler' | 'presence';

export function createDirector(rng: Rng): Director {
  return {
    time: 0,
    loudness: 0,
    smilersSpawned: false,
    howlerSpawned: false,
    nextPresenceAt: rng.range(PRESENCE_MIN_SEC, PRESENCE_MAX_SEC),
  };
}

/** Escalation: Presence from the start, Smilers at 3 min, the Howler at 8 min or when the player is very loud. */
export function updateDirector(d: Director, dt: number, footstep: number | null, rng: Rng): DirectorEvent[] {
  d.time += dt;
  if (footstep !== null) d.loudness += noiseWeight(footstep);
  const events: DirectorEvent[] = [];
  if (!d.smilersSpawned && d.time >= SMILER_PHASE_SEC) {
    d.smilersSpawned = true;
    events.push('spawnSmilers');
  }
  if (!d.howlerSpawned && (d.time >= HOWLER_PHASE_SEC || d.loudness >= LOUD_THRESHOLD)) {
    d.howlerSpawned = true;
    events.push('spawnHowler');
  }
  if (d.time >= d.nextPresenceAt) {
    d.nextPresenceAt = d.time + rng.range(PRESENCE_MIN_SEC, PRESENCE_MAX_SEC);
    events.push('presence');
  }
  return events;
}
```

- [ ] **Step 6: Implement `src/game/spawns.ts`**

```ts
import type { Rng } from '../core/rng';
import { Cell, type Grid, type Point } from '../world/grid';
import { bfsDistances } from '../world/pathing';

export const MAX_SMILERS = 5;
const SMILER_MIN_PLAYER_CELLS = 12;
const SMILER_MIN_SPACING = 20;
const HOWLER_MIN_PATH = 30;
const HOWLER_MAX_PATH = 60;

const cheb = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Up to `max` dark floor cells, well away from the player and from each other. */
export function spawnSmilerCells(grid: Grid, player: Point, rng: Rng, max = MAX_SMILERS): Point[] {
  const candidates: Point[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      if (grid.cells[i] !== Cell.Floor || !grid.dark[i]) continue;
      if (cheb({ x, y }, player) < SMILER_MIN_PLAYER_CELLS) continue;
      candidates.push({ x, y });
    }
  }
  const picked: Point[] = [];
  for (const c of rng.shuffle(candidates)) {
    if (picked.length >= max) break;
    if (picked.every((p) => cheb(p, c) >= SMILER_MIN_SPACING)) picked.push(c);
  }
  return picked;
}

/** A floor cell 30–60 walking cells from the player: close enough to matter, far enough to be fair. */
export function spawnHowlerCell(grid: Grid, player: Point, rng: Rng): Point | null {
  const dist = bfsDistances(grid, player.x, player.y);
  const candidates: Point[] = [];
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] < HOWLER_MIN_PATH || dist[i] > HOWLER_MAX_PATH) continue;
    const x = i % grid.width;
    candidates.push({ x, y: (i - x) / grid.width });
  }
  return candidates.length > 0 ? rng.pick(candidates) : null;
}
```

- [ ] **Step 7: Extend `src/game/sanity.ts`**

After `DISTORTION_START` add:

```ts
/** Entities this close (cells) wear the player down. */
export const NEAR_ENTITY_CELLS = 8;
export const NEAR_ENTITY_DRAIN = 0.8;
/** Extra drain per second while a Smiler is in view. */
export const SMILER_SIGHT_DRAIN = 2;
const CELL_METRES = 2;
```

Replace `updateSanity` with:

```ts
export function updateSanity(s: Sanity, dt: number, env: { dark: boolean; nightVision: boolean; fear?: number }): void {
  const base = env.dark ? -DARK_DRAIN * (env.nightVision ? NIGHT_VISION_DRAIN_FACTOR : 1) : LIGHT_REGEN;
  const delta = base - (env.fear ?? 0);
  s.value = Math.min(SANITY_MAX, Math.max(0, s.value + delta * dt));
}

/** Extra drain per second from nearby entities and a visible Smiler. */
export function fearDrain(
  entities: readonly { pos: { x: number; z: number } }[],
  player: { x: number; z: number },
  seesSmiler: boolean,
): number {
  const near = entities.some((e) => Math.hypot(e.pos.x - player.x, e.pos.z - player.z) / CELL_METRES <= NEAR_ENTITY_CELLS);
  return (near ? NEAR_ENTITY_DRAIN : 0) + (seesSmiler ? SMILER_SIGHT_DRAIN : 0);
}

/** A sudden scare. */
export function jolt(s: Sanity, amount: number): void {
  s.value = Math.max(0, s.value - amount);
}
```

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 9: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/game tests/game
git commit -m "feat: escalation director, fair spawn placement, and fear-driven sanity drain"
```

---

### Task 5: Smiler and Howler visuals

**Files:**
- Create: `src/world/entityViews.ts`

**Interfaces:**
- Consumes: `Entity` (Task 3)
- Produces: `createEntityViews(scene: THREE.Scene): { sync(entities: readonly Entity[], alpha: number, dt: number): void }` — creates a view per entity on first sight, interpolates `prevPos → pos` by `alpha`, faces `heading`, animates the Howler's walk from its movement speed

Rendering glue — verified in the browser in Task 6.

- [ ] **Step 1: Create `src/world/entityViews.ts`**

```ts
import * as THREE from 'three';
import type { Entity } from '../game/entity';

/** Glowing eyes and a too-wide grin on a transparent card that always faces the camera. */
function smilerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#fffbe8';
  ctx.shadowColor = '#fff6c0';
  ctx.shadowBlur = 18;
  for (const x of [84, 172]) {
    ctx.beginPath();
    ctx.ellipse(x, 48, 16, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(38, 92);
  for (let i = 0; i <= 12; i++) {
    const x = 38 + i * 15;
    ctx.lineTo(x, i % 2 === 0 ? 96 + Math.sin(i) * 3 : 114);
  }
  ctx.quadraticCurveTo(128, 150, 38, 92);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface HowlerRig {
  root: THREE.Group;
  legs: [THREE.Group, THREE.Group];
  arms: [THREE.Group, THREE.Group];
  body: THREE.Group;
  phase: number;
}

/** A 2.45 m, too-thin figure built from primitives, hunched to clear the 2.7 m ceiling. */
function createHowler(): HowlerRig {
  const skin = new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 1 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x110000, emissive: 0x662222, emissiveIntensity: 1.5 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 0.2), skin);
  torso.position.y = 1.75;
  torso.rotation.x = 0.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin);
  head.scale.set(1, 1.35, 1);
  head.position.set(0, 2.3, -0.14);
  const eyeGeo = new THREE.SphereGeometry(0.018, 6, 6);
  for (const x of [-0.05, 0.05]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, 2.33, -0.26);
    body.add(eye);
  }
  body.add(torso, head);

  const limb = (radiusTop: number, radiusBottom: number, length: number, pivot: THREE.Vector3) => {
    const g = new THREE.Group();
    g.position.copy(pivot);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 8), skin);
    m.position.y = -length / 2;
    g.add(m);
    body.add(g);
    return g;
  };
  const arms: [THREE.Group, THREE.Group] = [
    limb(0.035, 0.03, 1.25, new THREE.Vector3(-0.22, 2.1, -0.05)),
    limb(0.035, 0.03, 1.25, new THREE.Vector3(0.22, 2.1, -0.05)),
  ];
  const legs: [THREE.Group, THREE.Group] = [
    limb(0.05, 0.035, 1.35, new THREE.Vector3(-0.1, 1.35, 0)),
    limb(0.05, 0.035, 1.35, new THREE.Vector3(0.1, 1.35, 0)),
  ];
  return { root, legs, arms, body, phase: 0 };
}

export function createEntityViews(scene: THREE.Scene) {
  const smilerMaterial = new THREE.SpriteMaterial({
    map: smilerTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const smilers = new Map<number, THREE.Sprite>();
  const howlers = new Map<number, HowlerRig>();

  return {
    sync(entities: readonly Entity[], alpha: number, dt: number): void {
      for (const e of entities) {
        const x = e.prevPos.x + (e.pos.x - e.prevPos.x) * alpha;
        const z = e.prevPos.z + (e.pos.z - e.prevPos.z) * alpha;
        if (e.kind === 'smiler') {
          let s = smilers.get(e.id);
          if (!s) {
            s = new THREE.Sprite(smilerMaterial);
            s.scale.set(0.9, 0.56, 1);
            scene.add(s);
            smilers.set(e.id, s);
          }
          s.position.set(x, 1.55, z);
        } else {
          let h = howlers.get(e.id);
          if (!h) {
            h = createHowler();
            scene.add(h.root);
            howlers.set(e.id, h);
          }
          h.root.position.set(x, 0, z);
          h.root.rotation.y = e.heading;
          const speed = dt > 0 ? Math.hypot(e.pos.x - e.prevPos.x, e.pos.z - e.prevPos.z) * 60 : 0;
          h.phase += speed * dt * 2.2;
          const swing = Math.sin(h.phase) * 0.5 * Math.min(1, speed / 2);
          h.legs[0].rotation.x = swing;
          h.legs[1].rotation.x = -swing;
          h.arms[0].rotation.x = -swing * 0.7;
          h.arms[1].rotation.x = swing * 0.7;
          h.body.position.y = Math.abs(Math.sin(h.phase)) * 0.04;
        }
      }
    },
  };
}
```

Note: `speed` uses the last fixed step's displacement × 60 (the fixed step rate) to get metres per second.

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit && npm run build` — expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/world/entityViews.ts
git commit -m "feat: Smiler billboard face and procedurally animated Howler figure"
```

---

### Task 6: Wiring threats into the game

**Files:**
- Modify: `src/main.ts`, `src/ui/debugHud.ts`

**Interfaces:**
- Consumes: Tasks 1–5

- [ ] **Step 1: Show entities on the debug minimap**

In `src/ui/debugHud.ts`, change the `update` signature to:

```ts
    update(frameDt: number, player: PlayerState, markers: readonly { x: number; z: number }[] = []): void {
```

and, just before the closing `},` of `update`, add:

```ts
      ctx.fillStyle = '#f0f';
      for (const m of markers) ctx.fillRect((m.x / CELL_SIZE) * SCALE - 3, (m.z / CELL_SIZE) * SCALE - 3, 6, 6);
```

- [ ] **Step 2: Add imports to `src/main.ts`**

```ts
import { createDirector, type DirectorEvent, updateDirector } from './game/director';
import { caughtPlayer, createEntity, type Entity, updateEntity } from './game/entity';
import { hasLineOfSight } from './game/los';
import { createFootsteps, type NoiseEvent, stepFootsteps } from './game/noise';
import { spawnHowlerCell, spawnSmilerCells } from './game/spawns';
import { createEntityViews } from './world/entityViews';
```

and extend the existing sanity import to include `fearDrain` and `jolt`, and the grid import to include `Cell`, `CELL_SIZE` and `getCell`.

- [ ] **Step 3: Create the threat state after `const noteReader = …`**

```ts
const footsteps = createFootsteps();
const directorRng = createRng(deriveSeed(seed, 'director'));
const director = createDirector(directorRng);
const entityRng = createRng(deriveSeed(seed, 'entities'));
const entities: Entity[] = [];
const entityViews = createEntityViews(scene);
const anyFloor = (x: number, y: number) => getCell(level.grid, x, y) === Cell.Floor;
/** Smilers live in the dark and never leave it. */
const darkOnly = (x: number, y: number) => anyFloor(x, y) && isDark(level.grid, x, y);
/** Sight distance (cells) within which a visible Smiler frightens the player. */
const SMILER_FEAR_CELLS = 10;
```

- [ ] **Step 4: Handle director events**

After `function endTape(…) { … }` add:

```ts
function onDirectorEvent(event: DirectorEvent): void {
  const here = { x: worldToCell(player.pos.x), y: worldToCell(player.pos.z) };
  if (event === 'spawnSmilers') {
    for (const cell of spawnSmilerCells(level.grid, here, entityRng)) entities.push(createEntity(entities.length, 'smiler', cell));
  } else if (event === 'spawnHowler') {
    const cell = spawnHowlerCell(level.grid, here, entityRng);
    if (cell) entities.push(createEntity(entities.length, 'howler', cell));
  }
}
```

(`'presence'` is handled in Task 7.)

- [ ] **Step 5: Update entities in the fixed-step loop**

Before `const steps = stepper.advance(frameDt);` add:

```ts
  const seesSmiler = entities.some(
    (e) =>
      e.kind === 'smiler' &&
      Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) / CELL_SIZE <= SMILER_FEAR_CELLS &&
      hasLineOfSight(level.grid, player.pos, e.pos),
  );
```

Replace the sanity block inside `if (playing) { … }` in the step loop:

```ts
      if (!params.god) {
        const dark = isDark(level.grid, worldToCell(player.pos.x), worldToCell(player.pos.z));
        updateSanity(sanity, FIXED_DT, { dark, nightVision: camcorder.nightVision });
      }
```

with:

```ts
      const footstep = stepFootsteps(footsteps, FIXED_DT, player.moving, player.gait);
      const noises: NoiseEvent[] = footstep ? [{ x: player.pos.x, z: player.pos.z, radius: footstep }] : [];
      for (const event of updateDirector(director, FIXED_DT, footstep, directorRng)) onDirectorEvent(event);
      for (const e of entities) {
        updateEntity(e, FIXED_DT, {
          grid: level.grid,
          canEnter: e.kind === 'smiler' ? darkOnly : anyFloor,
          rng: entityRng,
          player: player.pos,
          noises,
        });
        if (!params.god && caughtPlayer(e, player.pos)) {
          endTape('die', now);
          break;
        }
      }
      if (phase !== 'playing') break;
      if (!params.god) {
        const dark = isDark(level.grid, worldToCell(player.pos.x), worldToCell(player.pos.z));
        const fear = fearDrain(entities, player.pos, seesSmiler);
        updateSanity(sanity, FIXED_DT, { dark, nightVision: camcorder.nightVision, fear });
      }
```

- [ ] **Step 6: Render entities and markers**

After `props.update(now / 1000);` add:

```ts
  entityViews.sync(entities, a, frameDt);
```

Replace `debugHud?.update(frameDt, player);` with:

```ts
  debugHud?.update(frameDt, player, entities.map((e) => e.pos));
```

- [ ] **Step 7: Type-check, test, build, and verify in the browser**

Run: `npx tsc --noEmit && npm test && npm run build` — expected: success.

Headless (temporary patch, reverted before commit): set `SMILER_PHASE_SEC` to 2 and `HOWLER_PHASE_SEC` to 4 in `director.ts`, force `phase = 'playing'` at startup, spawn the player facing a dark zone, and screenshot after ~5 s with `?debug`: magenta markers appear on the minimap inside dark patches (Smilers) and one elsewhere (Howler); a Smiler's glowing eyes and grin show when looking into the dark (brighter in night vision); the Howler, when in view, is a tall thin hunched silhouette whose legs swing as it walks. No console errors; fps stays ≈ the display rate.

Hands-on with the real timings: after 3 minutes, sprinting near a dark zone draws a Smiler to the noise; being touched ends the tape. After 8 minutes (or much earlier if you sprint a lot) the Howler appears, follows noise, chases on sight, and gives up if you break line of sight for a few seconds. With `?god` nothing can catch you.

- [ ] **Step 8: Commit**

```bash
git add src/main.ts src/ui/debugHud.ts
git commit -m "feat: director spawns Smilers and the Howler; noise, fear and being caught"
```

---

### Task 7: The Presence and the Howler's warning

**Files:**
- Modify: `src/lighting/lightPool.ts`, `src/main.ts`, `README.md`

**Interfaces:**
- Consumes: `jolt` (Task 4); `onDirectorEvent` (Task 6)
- Produces: `lightPool.update(x: number, z: number, timeSec: number, blackout?: { x: number; z: number; radius: number } | null, dim?: boolean): void` — lights within `radius` metres of `blackout` are off; `dim` holds every pooled light at 35 %

- [ ] **Step 1: Extend `src/lighting/lightPool.ts`**

Add after `LIGHT_RANGE`:

```ts
/** Light level while the Howler's warning holds the lights down (steady, not strobing). */
const DIM_LEVEL = 0.35;
```

Change the `update` signature to:

```ts
    update(x: number, z: number, timeSec: number, blackout: { x: number; z: number; radius: number } | null = null, dim = false): void {
```

and replace the `light.intensity = …` assignment with:

```ts
        const out = blackout !== null && Math.hypot(lx - blackout.x, lz - blackout.z) <= blackout.radius;
        light.intensity = out
          ? 0
          : BASE_INTENSITY *
            (dim ? DIM_LEVEL : 1) *
            lightFalloff(Math.hypot(lx - x, lz - z)) *
            flicker(timeSec, cell.y * grid.width + cell.x, seed);
```

- [ ] **Step 2: Wire the Presence and the warning into `src/main.ts`**

After the threat state from Task 6 add:

```ts
/** The Presence: lights die around the player for a while. */
const BLACKOUT_MS = 3000;
const BLACKOUT_RADIUS = 8;
const PRESENCE_GLITCH_MS = 800;
const PRESENCE_JOLT = 3;
const HOWLER_WARNING_MS = 1500;
let blackout: { x: number; z: number; until: number } | null = null;
let glitchUntil = 0;
let dimUntil = 0;
```

In `onDirectorEvent`, change its signature to `function onDirectorEvent(event: DirectorEvent, now: number): void` and add at its end:

```ts
  if (event === 'presence') {
    blackout = { x: player.pos.x, z: player.pos.z, until: now + BLACKOUT_MS };
    glitchUntil = Math.max(glitchUntil, now + PRESENCE_GLITCH_MS);
    if (!params.god) jolt(sanity, PRESENCE_JOLT);
  } else if (event === 'spawnHowler') {
    glitchUntil = Math.max(glitchUntil, now + HOWLER_WARNING_MS);
    dimUntil = now + HOWLER_WARNING_MS;
  }
```

and update its call site in the step loop to `onDirectorEvent(event, now)`.

Replace `lightPool.update(camera.position.x, camera.position.z, now / 1000);` with:

```ts
  const activeBlackout = blackout && now < blackout.until ? { x: blackout.x, z: blackout.z, radius: BLACKOUT_RADIUS } : null;
  lightPool.update(camera.position.x, camera.position.z, now / 1000, activeBlackout, now < dimUntil);
```

In the `vhs.render({ … })` call, replace the `glitch:` line with:

```ts
    glitch: ending || now < glitchUntil ? 1 : glitchAmount(t, glitchSeed, camcorder.battery),
```

- [ ] **Step 3: Describe the threats in `README.md`**

After the **Goal** paragraph add:

```markdown
**Something else is here.** At first it only moves the lights. After a few minutes, grinning things wait in the dark rooms and come for noise — crouch to stay quiet. Linger (or keep sprinting) and something tall starts looking for you. Break its line of sight and it may lose you.
```

- [ ] **Step 4: Type-check, test, build, and verify in the browser**

Run: `npx tsc --noEmit && npm test && npm run build` — expected: success.

Headless (temporary patch, reverted): set the Presence range to 1–2 s and force `phase = 'playing'`; screenshot twice ~0.5 s apart after an event: the lit hall around the camera goes dark for 3 s while panels further away stay lit; the tape glitches for under a second. With `HOWLER_PHASE_SEC` at 2, the whole view dims to a steady ~35 % for 1.5 s with heavy glitching when it spawns. No strobing; no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/lighting/lightPool.ts src/main.ts README.md
git commit -m "feat: the Presence kills nearby lights and jolts sanity; the Howler's arrival dims the lights"
```

---

## Milestone 4 done when

- `npm test` and `npm run build` pass.
- The escalation plays out: Presence blackouts from the start, Smilers in dark zones from 3 min, the Howler from 8 min (earlier if loud).
- Smilers never leave the dark; the Howler chases on sight and can be shaken by breaking line of sight; contact ends the tape; `?god` prevents it.
- Frame rate stays at the display rate with all entities active.
- Next: write the Milestone 5 plan (audio, play-on-desktop, performance, static deploy, trailer GIF).
