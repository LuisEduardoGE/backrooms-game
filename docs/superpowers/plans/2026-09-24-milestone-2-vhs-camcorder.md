# Milestone 2 — VHS Camcorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Level 0 look and feel like found footage: a VHS post-processing pass (barrel distortion, chroma bleed, tracking lines, grain, scanlines, vignette), a camcorder on-screen display (blinking ● REC, 1996 timestamp, battery icon), night vision with battery drain and an IR illuminator, and a "▶ PLAY TAPE" title screen plus pause screen.

**Architecture:** As in Milestone 1, every decision is pure, Three.js-free TypeScript with Vitest tests: camcorder battery/night-vision state, tape-glitch schedule, OSD formatting, game phases (title/playing/paused), and key-press edge detection. Rendering glue is thin: Three.js's built-in `EffectComposer` runs `RenderPass → OutputPass → VHS ShaderPass`, with one custom fragment shader driven by four uniforms (`uNightVision`, `uBattery`, `uGlitch`, `uTime`). The OSD and screens are HTML/CSS over the canvas.

**Tech Stack:** TypeScript, Vite, Three.js (`three/addons/postprocessing`), Vitest, Google Fonts VT323.

**Spec:** `docs/superpowers/specs/2026-09-24-level-0-design.md` — implements Milestone 2 of §10 (§6 camcorder battery + night vision, §8 VHS chain, HUD and title/pause screens). Sanity-driven distortion, notes, TAPE ENDS and escape screens are Milestone 3; play-on-desktop is Milestone 5.

## Global Constraints

- Everything from the Milestone 1 plan still applies (strict TS, pure modules Three-free, seeded randomness, 60 fps budget, desktop only, licensed assets in `public/CREDITS.md`).
- Pure modules added here must not import `three`: `src/player/camcorder.ts`, `src/fx/glitch.ts`, `src/ui/osd.ts`, `src/core/gameState.ts`.
- Battery: starts at 100 %; passive drain 0.3 %/s while recording; night vision adds 1.5 %/s; at 0 % night vision is unavailable and the picture is darker and noisier (spec §6).
- Battery and the tape clock only advance while the phase is `playing` (never on the title or pause screens).
- Night-vision toggle key: **N**. Esc releases the mouse, which pauses.
- Timestamp starts at a seeded random moment in 1996 (spec §8).
- Photosensitivity: no full-screen flashing at 3–30 Hz. Glitch bursts are at most one per 2-second slot; the title screen shows a flashing-effects notice.
- Post-processing uses Three.js's own `EffectComposer` add-ons (no extra dependency); the spec's §3 is updated to say so in Task 5.

## Review Focus

1. **Battery reaching 0 % with night vision on** — night vision must switch off and refuse to switch back on; the game keeps running with a dimmer, noisier picture. (Test: Task 1.)
2. **Holding N (key auto-repeat) or pressing N on the title/pause screen** — must toggle exactly once per physical press, and only while playing. (Test: Task 4 for repeat; Task 7 wiring.)
3. **Tab switched away / pause for minutes** — battery and tape clock must not drain while not playing. (Test: Task 4 phase transitions; Task 7 wiring.)
4. **Clicking "resume" within ~1 s of pressing Esc** — browsers refuse to re-lock the pointer; that must not throw an unhandled error, and the next click must work. (Task 7.)
5. **Window resize / high-DPI screens** — the VHS pass must follow the drawing-buffer size so scanlines and grain stay crisp, not stretched. (Task 5.)

---

## File Structure

```
src/
  player/camcorder.ts   battery, night-vision toggle, fade blend          (Task 1)
  fx/glitch.ts          seeded tape-glitch bursts                          (Task 2)
  ui/osd.ts             1996 timestamp, date/time strings, battery bars    (Task 3)
  core/gameState.ts     title / playing / paused transitions               (Task 4)
  core/input.ts         + consumePressed(code) edge detection              (Task 4)
  fx/vhsShader.ts       VHS fragment shader + uniforms                     (Task 5)
  fx/composer.ts        RenderPass → OutputPass → VHS pass                 (Task 5)
  ui/hud.ts             camcorder OSD overlay (DOM)                        (Task 6)
  main.ts, index.html, style.css                                           (Tasks 5–7)
tests/ mirrors the pure modules
```

---

### Task 1: Camcorder battery and night vision

**Files:**
- Create: `src/player/camcorder.ts`
- Test: `tests/player/camcorder.test.ts`

**Interfaces:**
- Produces:
  - `BATTERY_MAX = 100`, `DRAIN_PASSIVE = 0.3`, `DRAIN_NIGHT_VISION = 1.5` (% per second), `NV_FADE_SPEED = 4` (blend units per second), `LOW_BATTERY = 15` (%)
  - `interface Camcorder { battery: number; nightVision: boolean; nvBlend: number }` — `nvBlend` 0..1 eases toward night vision for the shader
  - `createCamcorder(): Camcorder`
  - `toggleNightVision(c: Camcorder): boolean` — returns the new state; refuses to turn on at 0 %
  - `updateCamcorder(c: Camcorder, dt: number): void` — drains battery, forces night vision off at 0 %, eases `nvBlend`

- [ ] **Step 1: Write the failing test `tests/player/camcorder.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  BATTERY_MAX, createCamcorder, DRAIN_NIGHT_VISION, DRAIN_PASSIVE, toggleNightVision, updateCamcorder,
} from '../../src/player/camcorder';

function run(c: ReturnType<typeof createCamcorder>, seconds: number, dt = 0.1) {
  for (let t = 0; t < seconds - 1e-9; t += dt) updateCamcorder(c, dt);
  return c;
}

describe('camcorder', () => {
  it('starts full, with night vision off', () => {
    expect(createCamcorder()).toEqual({ battery: BATTERY_MAX, nightVision: false, nvBlend: 0 });
  });

  it('drains slowly while recording', () => {
    const c = run(createCamcorder(), 10);
    expect(c.battery).toBeCloseTo(BATTERY_MAX - DRAIN_PASSIVE * 10, 6);
  });

  it('drains faster with night vision on', () => {
    const c = createCamcorder();
    expect(toggleNightVision(c)).toBe(true);
    run(c, 10);
    expect(c.battery).toBeCloseTo(BATTERY_MAX - (DRAIN_PASSIVE + DRAIN_NIGHT_VISION) * 10, 6);
  });

  it('toggles night vision off again', () => {
    const c = createCamcorder();
    toggleNightVision(c);
    expect(toggleNightVision(c)).toBe(false);
    expect(c.nightVision).toBe(false);
  });

  it('never drops below 0 and forces night vision off when empty', () => {
    const c = createCamcorder();
    toggleNightVision(c);
    run(c, 200);
    expect(c.battery).toBe(0);
    expect(c.nightVision).toBe(false);
  });

  it('refuses to turn night vision on with a dead battery', () => {
    const c = createCamcorder();
    c.battery = 0;
    expect(toggleNightVision(c)).toBe(false);
    expect(c.nightVision).toBe(false);
  });

  it('eases the night-vision blend in and out', () => {
    const c = createCamcorder();
    toggleNightVision(c);
    run(c, 0.1);
    expect(c.nvBlend).toBeCloseTo(0.4, 6);
    run(c, 0.5);
    expect(c.nvBlend).toBe(1);
    toggleNightVision(c);
    run(c, 0.1);
    expect(c.nvBlend).toBeCloseTo(0.6, 6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/player/camcorder.test.ts`
Expected: FAIL — cannot resolve `../../src/player/camcorder`.

- [ ] **Step 3: Implement `src/player/camcorder.ts`**

```ts
export const BATTERY_MAX = 100;
/** Percent per second while recording. */
export const DRAIN_PASSIVE = 0.3;
/** Extra percent per second while night vision is on. */
export const DRAIN_NIGHT_VISION = 1.5;
/** How fast the shader blend eases toward night vision (units per second ≈ 0.25 s fade). */
export const NV_FADE_SPEED = 4;
/** Below this percent the battery icon blinks and the tape glitches more. */
export const LOW_BATTERY = 15;

export interface Camcorder {
  battery: number;
  nightVision: boolean;
  /** 0..1, eased toward `nightVision` for the VHS shader and IR light. */
  nvBlend: number;
}

export function createCamcorder(): Camcorder {
  return { battery: BATTERY_MAX, nightVision: false, nvBlend: 0 };
}

/** Returns the new night-vision state. A dead battery can't power night vision. */
export function toggleNightVision(c: Camcorder): boolean {
  if (!c.nightVision && c.battery <= 0) return false;
  c.nightVision = !c.nightVision;
  return c.nightVision;
}

export function updateCamcorder(c: Camcorder, dt: number): void {
  const drain = DRAIN_PASSIVE + (c.nightVision ? DRAIN_NIGHT_VISION : 0);
  c.battery = Math.max(0, c.battery - drain * dt);
  if (c.battery <= 0) c.nightVision = false;

  const target = c.nightVision ? 1 : 0;
  const step = NV_FADE_SPEED * dt;
  c.nvBlend += Math.max(-step, Math.min(step, target - c.nvBlend));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/player/camcorder.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/player/camcorder.ts tests/player/camcorder.test.ts
git commit -m "feat: camcorder battery drain and night-vision toggle"
```

---

### Task 2: Seeded tape-glitch bursts

**Files:**
- Create: `src/fx/glitch.ts`
- Test: `tests/fx/glitch.test.ts`

**Interfaces:**
- Consumes: `deriveSeed` (M1 `src/core/rng.ts`); `LOW_BATTERY` (Task 1)
- Produces:
  - `GLITCH_SLOT = 2` (seconds), `MAX_BURST = 0.7` (seconds)
  - `glitchAmount(timeSec: number, seed: number, battery: number): number` — 0..1; 0 most of the time on a healthy battery; a smooth burst of at most `MAX_BURST` seconds in roughly 12 % of 2-second slots; with battery below `LOW_BATTERY`, a constant 0.15 floor and bursts in about half the slots

- [ ] **Step 1: Write the failing test `tests/fx/glitch.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { glitchAmount, GLITCH_SLOT, MAX_BURST } from '../../src/fx/glitch';

const SEED = 99;
const DT = 0.01;
const samples = (battery: number, seconds = 400) =>
  Array.from({ length: Math.round(seconds / DT) }, (_, i) => glitchAmount(i * DT, SEED, battery));

describe('glitchAmount', () => {
  it('stays within 0..1', () => {
    for (const v of [...samples(100, 100), ...samples(5, 100)]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic for a seed and time', () => {
    expect(glitchAmount(123.45, SEED, 100)).toBe(glitchAmount(123.45, SEED, 100));
  });

  it('is quiet most of the time on a healthy battery, with occasional bursts', () => {
    const active = samples(100).filter((v) => v > 0).length / samples(100).length;
    expect(active).toBeGreaterThan(0.005);
    expect(active).toBeLessThan(0.1);
  });

  it('keeps each burst short (≤ MAX_BURST) and at most one per slot — no rapid flashing', () => {
    const values = samples(100);
    let run = 0;
    let longest = 0;
    const burstsInSlot = new Map<number, number>();
    for (let i = 0; i < values.length; i++) {
      if (values[i] > 0) {
        if (run === 0) {
          const slot = Math.floor((i * DT) / GLITCH_SLOT);
          burstsInSlot.set(slot, (burstsInSlot.get(slot) ?? 0) + 1);
        }
        run++;
        longest = Math.max(longest, run);
      } else run = 0;
    }
    expect(longest * DT).toBeLessThanOrEqual(MAX_BURST + DT);
    expect(Math.max(...burstsInSlot.values())).toBe(1);
  });

  it('glitches far more on a low battery', () => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(samples(5))).toBeGreaterThan(mean(samples(100)) * 3);
    expect(Math.min(...samples(5, 20))).toBeGreaterThanOrEqual(0.15);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/fx/glitch.test.ts`
Expected: FAIL — cannot resolve `../../src/fx/glitch`.

- [ ] **Step 3: Implement `src/fx/glitch.ts`**

```ts
import { deriveSeed } from '../core/rng';
import { LOW_BATTERY } from '../player/camcorder';

const U32 = 4294967296;
/** Each slot decides independently whether it contains one burst. */
export const GLITCH_SLOT = 2;
export const MAX_BURST = 0.7;
const MIN_BURST = 0.3;
/** Keeps bursts away from slot edges so two bursts never merge into one long flash. */
const EDGE_GAP = 0.1;
const BURST_CHANCE = 0.12;
const LOW_BATTERY_BURST_CHANCE = 0.5;
const LOW_BATTERY_FLOOR = 0.15;

/** Tape-glitch intensity 0..1 for the VHS shader: rare short bursts, more on a dying battery. */
export function glitchAmount(timeSec: number, seed: number, battery: number): number {
  const low = battery < LOW_BATTERY;
  const floor = low ? LOW_BATTERY_FLOOR : 0;
  const chance = low ? LOW_BATTERY_BURST_CHANCE : BURST_CHANCE;

  const slot = Math.floor(timeSec / GLITCH_SLOT);
  const roll = deriveSeed(seed, `glitch:${slot}`) / U32;
  if (roll >= chance) return floor;

  const shape = deriveSeed(seed, `glitch-shape:${slot}`) / U32;
  const duration = MIN_BURST + (MAX_BURST - MIN_BURST) * shape;
  const room = GLITCH_SLOT - duration - EDGE_GAP * 2;
  const start = slot * GLITCH_SLOT + EDGE_GAP + room * (roll / chance);
  const local = timeSec - start;
  if (local <= 0 || local >= duration) return floor;

  const envelope = Math.sin((local / duration) * Math.PI);
  return Math.max(floor, (0.6 + 0.4 * shape) * envelope);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/fx/glitch.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/fx/glitch.ts tests/fx/glitch.test.ts
git commit -m "feat: seeded tape-glitch bursts, stronger on low battery"
```

---

### Task 3: Camcorder OSD formatting

**Files:**
- Create: `src/ui/osd.ts`
- Test: `tests/ui/osd.test.ts`

**Interfaces:**
- Consumes: `deriveSeed` (M1)
- Produces:
  - `tapeStartTime(seed: number): number` — epoch ms of a seeded moment in 1996 (UTC), whole seconds
  - `formatOsdDate(ms: number): string` — e.g. `SEP. 24 1996` (UTC)
  - `formatOsdTime(ms: number): string` — e.g. `10:42:07 PM` (UTC, 12-hour)
  - `batteryBars(percent: number): number` — 0..4 filled bars

- [ ] **Step 1: Write the failing test `tests/ui/osd.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { batteryBars, formatOsdDate, formatOsdTime, tapeStartTime } from '../../src/ui/osd';

describe('tapeStartTime', () => {
  it('is a deterministic whole-second moment in 1996', () => {
    const t = tapeStartTime(42);
    expect(t).toBe(tapeStartTime(42));
    expect(t).toBeGreaterThanOrEqual(Date.UTC(1996, 0, 1));
    expect(t).toBeLessThan(Date.UTC(1997, 0, 1));
    expect(t % 1000).toBe(0);
    expect(tapeStartTime(43)).not.toBe(t);
  });
});

describe('formatOsdDate / formatOsdTime', () => {
  it('formats like a 90s camcorder', () => {
    const t = Date.UTC(1996, 8, 24, 22, 42, 7);
    expect(formatOsdDate(t)).toBe('SEP. 24 1996');
    expect(formatOsdTime(t)).toBe('10:42:07 PM');
  });

  it('handles midnight, noon, May and single-digit days', () => {
    expect(formatOsdTime(Date.UTC(1996, 0, 5, 0, 0, 0))).toBe('12:00:00 AM');
    expect(formatOsdTime(Date.UTC(1996, 0, 5, 12, 3, 9))).toBe('12:03:09 PM');
    expect(formatOsdDate(Date.UTC(1996, 4, 5))).toBe('MAY 5 1996');
  });
});

describe('batteryBars', () => {
  it('maps percent to 0..4 bars', () => {
    expect(batteryBars(100)).toBe(4);
    expect(batteryBars(76)).toBe(4);
    expect(batteryBars(75)).toBe(3);
    expect(batteryBars(1)).toBe(1);
    expect(batteryBars(0)).toBe(0);
    expect(batteryBars(-5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ui/osd.test.ts`
Expected: FAIL — cannot resolve `../../src/ui/osd`.

- [ ] **Step 3: Implement `src/ui/osd.ts`**

```ts
import { deriveSeed } from '../core/rng';

const MONTHS = ['JAN.', 'FEB.', 'MAR.', 'APR.', 'MAY', 'JUN.', 'JUL.', 'AUG.', 'SEP.', 'OCT.', 'NOV.', 'DEC.'];
const DAYS_IN_1996 = 366;

/** A seeded moment in 1996 when this tape started recording (epoch ms, whole seconds). */
export function tapeStartTime(seed: number): number {
  const fraction = deriveSeed(seed, 'tape') / 4294967296;
  return Date.UTC(1996, 0, 1) + Math.floor(fraction * DAYS_IN_1996 * 86400) * 1000;
}

export function formatOsdDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`;
}

export function formatOsdTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getUTCHours();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h % 12 || 12}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${h < 12 ? 'AM' : 'PM'}`;
}

export function batteryBars(percent: number): number {
  return Math.max(0, Math.min(4, Math.ceil(percent / 25)));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ui/osd.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/ui/osd.ts tests/ui/osd.test.ts
git commit -m "feat: camcorder OSD timestamp and battery-bar formatting"
```

---

### Task 4: Game phases and key-press edges

**Files:**
- Create: `src/core/gameState.ts`
- Modify: `src/core/input.ts`
- Test: `tests/core/gameState.test.ts`, `tests/core/input.test.ts` (append)

**Interfaces:**
- Produces:
  - `type Phase = 'title' | 'playing' | 'paused'`
  - `nextPhase(phase: Phase, event: 'lock' | 'unlock'): Phase` — lock: title/paused → playing; unlock: playing → paused; anything else unchanged
  - `Input.consumePressed(code: string): boolean` — true once per physical key press (auto-repeat ignored); `clear()` also drops pending presses

- [ ] **Step 1: Write the failing test `tests/core/gameState.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { nextPhase } from '../../src/core/gameState';

describe('nextPhase', () => {
  it('starts playing when the pointer locks from the title or pause screen', () => {
    expect(nextPhase('title', 'lock')).toBe('playing');
    expect(nextPhase('paused', 'lock')).toBe('playing');
    expect(nextPhase('playing', 'lock')).toBe('playing');
  });

  it('pauses when the pointer unlocks while playing (Esc, tab switch)', () => {
    expect(nextPhase('playing', 'unlock')).toBe('paused');
  });

  it('stays on the title or pause screen when unlocking there', () => {
    expect(nextPhase('title', 'unlock')).toBe('title');
    expect(nextPhase('paused', 'unlock')).toBe('paused');
  });
});
```

- [ ] **Step 2: Append failing tests to `tests/core/input.test.ts`**

Add this helper below the existing `key` helper:

```ts
function repeatKey(code: string): Event {
  const e = key('keydown', code);
  Object.defineProperty(e, 'repeat', { value: true });
  return e;
}
```

Append:

```ts
describe('consumePressed', () => {
  it('reports a press exactly once', () => {
    const { target, input } = setup();
    target.dispatchEvent(key('keydown', 'KeyN'));
    expect(input.consumePressed('KeyN')).toBe(true);
    expect(input.consumePressed('KeyN')).toBe(false);
  });

  it('ignores keyboard auto-repeat while the key is held', () => {
    const { target, input } = setup();
    target.dispatchEvent(key('keydown', 'KeyN'));
    input.consumePressed('KeyN');
    target.dispatchEvent(repeatKey('KeyN'));
    target.dispatchEvent(repeatKey('KeyN'));
    expect(input.consumePressed('KeyN')).toBe(false);
  });

  it('counts a new press after release', () => {
    const { target, input } = setup();
    target.dispatchEvent(key('keydown', 'KeyN'));
    input.consumePressed('KeyN');
    target.dispatchEvent(key('keyup', 'KeyN'));
    target.dispatchEvent(key('keydown', 'KeyN'));
    expect(input.consumePressed('KeyN')).toBe(true);
  });

  it('drops pending presses on clear()', () => {
    const { target, input } = setup();
    target.dispatchEvent(key('keydown', 'KeyN'));
    input.clear();
    expect(input.consumePressed('KeyN')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/core`
Expected: FAIL — `gameState` module not found; `input.consumePressed is not a function`.

- [ ] **Step 4: Implement `src/core/gameState.ts`**

```ts
export type Phase = 'title' | 'playing' | 'paused';

/** Pointer lock drives the phase: locking starts/resumes play, losing it (Esc, tab switch) pauses. */
export function nextPhase(phase: Phase, event: 'lock' | 'unlock'): Phase {
  if (event === 'lock') return 'playing';
  return phase === 'playing' ? 'paused' : phase;
}
```

- [ ] **Step 5: Add `consumePressed` to `src/core/input.ts`**

In the `Input` interface, after `isDown(code: string): boolean;` add:

```ts
  /** True once per physical press of `code` since the last call (keyboard auto-repeat is ignored). */
  consumePressed(code: string): boolean;
```

After `const down = new Set<string>();` add:

```ts
  const pressed = new Set<string>();
```

In `clear`, after `down.clear();` add:

```ts
    pressed.clear();
```

Replace the `keydown` listener entry with:

```ts
    [
      'keydown',
      (e) => {
        const k = e as KeyboardEvent;
        down.add(k.code);
        if (!k.repeat) pressed.add(k.code);
      },
    ],
```

In the returned object, after `isDown: (code) => down.has(code),` add:

```ts
    consumePressed: (code) => pressed.delete(code),
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/core tests/core
git commit -m "feat: title/playing/paused phases and single-press key detection"
```

---

### Task 5: VHS post-processing pass, night vision, IR illuminator

**Files:**
- Create: `src/fx/vhsShader.ts`, `src/fx/composer.ts`
- Modify: `src/main.ts`, `docs/superpowers/specs/2026-09-24-level-0-design.md` (§3 stack line)

**Interfaces:**
- Consumes: `createCamcorder`, `toggleNightVision`, `updateCamcorder` (Task 1); `glitchAmount` (Task 2); `Input.consumePressed` (Task 4)
- Produces:
  - `VhsShader` — `{ name, uniforms: { tDiffuse, uTime, uResolution, uNightVision, uBattery, uGlitch }, vertexShader, fragmentShader }`
  - `interface VhsParams { time: number; nightVision: number; battery: number; glitch: number }` — `battery` 0..1
  - `createVhsComposer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, width: number, height: number): { setSize(width: number, height: number): void; render(p: VhsParams): void }`

Rendering glue — verified in the browser.

- [ ] **Step 1: Create `src/fx/vhsShader.ts`**

```ts
import * as THREE from 'three';

/**
 * One full-screen pass that turns the (already sRGB) frame into VHS camcorder footage:
 * barrel distortion → tracking jitter/band → chroma bleed + smear → night vision →
 * dead-battery dimming → grain → scanlines → glitch streaks → vignette.
 */
export const VhsShader = {
  name: 'VhsShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNightVision: { value: 0 },
    uBattery: { value: 1 },
    uGlitch: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uNightVision;
    uniform float uBattery;
    uniform float uGlitch;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    vec2 barrel(vec2 uv, float k) {
      vec2 c = uv - 0.5;
      return 0.5 + c * (1.0 + k * dot(c, c));
    }

    void main() {
      vec2 uv = barrel(vUv, 0.08);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      float t = fract(uTime / 1000.0) * 1000.0;

      // Tracking: per-row jitter plus a slow rolling band; both grow during glitches.
      float row = floor(uv.y * 240.0);
      float jitter = hash(vec2(row, floor(t * 30.0))) - 0.5;
      float bandDist = abs(fract(uv.y - fract(t * 0.07) + 0.5) - 0.5);
      float band = 1.0 - smoothstep(0.0, 0.05, bandDist);
      uv.x += jitter * (0.0015 + uGlitch * 0.03) + band * (0.003 + uGlitch * 0.02);

      // Chroma bleed and horizontal smear (VHS has little colour bandwidth).
      float bleed = 0.0025 + uGlitch * 0.006;
      vec3 col = vec3(
        texture2D(tDiffuse, uv + vec2(bleed, 0.0)).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - vec2(bleed, 0.0)).b
      );
      col = mix(col, texture2D(tDiffuse, uv - vec2(0.004, 0.0)).rgb, 0.25);

      // Night vision: luminance → green phosphor with gain.
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 nv = vec3(0.25, 1.0, 0.35) * pow(clamp(luma * 2.2, 0.0, 1.0), 0.8);
      col = mix(col, nv, uNightVision);

      // Dead battery: the picture sags.
      float power = smoothstep(0.0, 0.05, uBattery);
      col *= mix(0.35, 1.0, power);

      // Grain — heavier in night vision and on a dead battery.
      float grain = 0.06 + uNightVision * 0.10 + (1.0 - power) * 0.15;
      col += (hash(uv * uResolution + fract(t) * 100.0) - 0.5) * grain;

      // Scanlines.
      col *= 0.92 + 0.08 * sin(uv.y * uResolution.y * 3.14159);

      // White streaks during glitch bursts.
      float streak = step(0.995 - uGlitch * 0.02, hash(vec2(floor(uv.y * 120.0), floor(t * 20.0))));
      col = mix(col, vec3(hash(uv + fract(t))), streak * uGlitch);

      // Vignette.
      col *= 1.0 - smoothstep(0.35, 0.85, length(vUv - 0.5));

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
```

- [ ] **Step 2: Create `src/fx/composer.ts`**

```ts
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VhsShader } from './vhsShader';

export interface VhsParams {
  time: number;
  /** 0..1 night-vision blend. */
  nightVision: number;
  /** 0..1 battery charge. */
  battery: number;
  /** 0..1 tape-glitch intensity. */
  glitch: number;
}

/**
 * Scene → OutputPass (linear → sRGB) → VHS pass, so the VHS maths runs on display colours.
 */
export function createVhsComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());
  const vhs = new ShaderPass(VhsShader);
  composer.addPass(vhs);
  const buffer = new THREE.Vector2();

  const setSize = (w: number, h: number) => {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    renderer.getDrawingBufferSize(buffer);
    vhs.uniforms.uResolution.value.copy(buffer);
  };
  setSize(width, height);

  return {
    setSize,
    render(p: VhsParams): void {
      vhs.uniforms.uTime.value = p.time;
      vhs.uniforms.uNightVision.value = p.nightVision;
      vhs.uniforms.uBattery.value = p.battery;
      vhs.uniforms.uGlitch.value = p.glitch;
      composer.render();
    },
  };
}
```

- [ ] **Step 3: Wire the camcorder and VHS pass into `src/main.ts`**

Add imports (keep the list alphabetical by path):

```ts
import { createVhsComposer } from './fx/composer';
import { glitchAmount } from './fx/glitch';
import { createCamcorder, toggleNightVision, updateCamcorder } from './player/camcorder';
```

After `const FOG_COLOR = 0x3b3318;` add:

```ts
/** Peak intensity of the camcorder's infrared illuminator in night vision. */
const IR_INTENSITY = 6;
```

After the `camera.rotation.order = 'YXZ';` line add:

```ts
// The camcorder's infrared illuminator: always in the scene (stable light count), lit only in night vision.
const irLight = new THREE.PointLight(0xffffff, 0, 14, 1.5);
scene.add(irLight);
```

After the `if (params.debug) console.info(...)` line add:

```ts
const camcorder = createCamcorder();
const glitchSeed = deriveSeed(seed, 'glitch');
const vhs = createVhsComposer(renderer, scene, camera, window.innerWidth, window.innerHeight);
```

In the `resize` listener, after `renderer.setSize(window.innerWidth, window.innerHeight);` add:

```ts
  vhs.setSize(window.innerWidth, window.innerHeight);
```

In the animation loop, replace:

```ts
  const frameInput = isLocked() ? input.moveInput() : NO_INPUT;
```

with:

```ts
  const frameInput = isLocked() ? input.moveInput() : NO_INPUT;
  if (isLocked() && input.consumePressed('KeyN')) toggleNightVision(camcorder);
```

and replace:

```ts
  for (let i = 0; i < steps; i++) updatePlayer(player, stepInput, FIXED_DT, level.grid);
```

with:

```ts
  for (let i = 0; i < steps; i++) {
    updatePlayer(player, stepInput, FIXED_DT, level.grid);
    if (isLocked()) updateCamcorder(camcorder, FIXED_DT);
  }
```

Replace the final `renderer.render(scene, camera);` line with:

```ts
  irLight.position.copy(camera.position);
  irLight.intensity = IR_INTENSITY * camcorder.nvBlend;
  const t = now / 1000;
  vhs.render({
    time: t,
    nightVision: camcorder.nvBlend,
    battery: camcorder.battery / 100,
    glitch: glitchAmount(t, glitchSeed, camcorder.battery),
  });
```

- [ ] **Step 4: Update the spec's and CLAUDE.md's stack lines**

In `docs/superpowers/specs/2026-09-24-level-0-design.md` §3, replace `` `postprocessing` (pmndrs) + custom VHS shader`` with `` Three.js `EffectComposer` add-ons (RenderPass → OutputPass → one custom VHS ShaderPass)``.

In `CLAUDE.md` (Tech stack), replace `` - **`postprocessing`** (pmndrs) + custom shader for the VHS effect chain`` with `` - Three.js **`EffectComposer`** add-ons + one custom VHS `ShaderPass` (no extra dependency)``.

- [ ] **Step 5: Type-check, test, build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors; all tests PASS; `✓ built`.

- [ ] **Step 6: Verify in the browser**

Run `npm run dev` and open `http://localhost:5173/?debug&seed=42`. Expected:
- The image is slightly curved at the edges with dark corners, fine grain, faint scanlines, a slow rolling tracking band, and red/blue fringing on edges.
- Every so often (roughly every 10–20 s) a short tracking glitch: rows shear sideways with a few white streaks — never rapid strobing.
- Click in, press **N**: the picture fades to green night vision within ~¼ s, dark zones become visible, grain increases; press **N** again to fade back. Holding **N** does not strobe.
- Resize the window: scanlines and grain stay crisp.
- No shader compile errors in the console.

To check battery behaviour quickly, in the browser console you can't reach module state; instead temporarily set `DRAIN_PASSIVE` to `30` in `camcorder.ts`, confirm the picture dims and gets noisier after ~3 s and night vision refuses to turn on, then revert the change.

- [ ] **Step 7: Commit**

```bash
git add src/fx src/main.ts docs/superpowers/specs/2026-09-24-level-0-design.md CLAUDE.md
git commit -m "feat: VHS post-processing pass with night vision, battery sag and tape glitches"
```

---

### Task 6: Camcorder on-screen display

**Files:**
- Create: `src/ui/hud.ts`
- Modify: `src/main.ts`, `src/style.css`, `index.html`, `public/CREDITS.md`

**Interfaces:**
- Consumes: `formatOsdDate`, `formatOsdTime`, `batteryBars`, `tapeStartTime` (Task 3); `LOW_BATTERY`, `Camcorder` (Task 1)
- Produces:
  - `interface HudState { recording: boolean; battery: number; nightVision: boolean; clockMs: number }`
  - `createHud(parent: HTMLElement): { setVisible(visible: boolean): void; update(s: HudState): void }`

- [ ] **Step 1: Load the OSD font in `index.html`**

Inside `<head>`, after the `<title>` line, add:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=VT323&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Create `src/ui/hud.ts`**

```ts
import { LOW_BATTERY } from '../player/camcorder';
import { batteryBars, formatOsdDate, formatOsdTime } from './osd';

export interface HudState {
  recording: boolean;
  /** 0..100 */
  battery: number;
  nightVision: boolean;
  /** Tape clock, epoch ms. */
  clockMs: number;
}

/** Camcorder OSD: ● REC / ▮▮ PAUSE, battery, timestamp, NIGHT VISION. Text only touched when it changes. */
export function createHud(parent: HTMLElement) {
  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div class="osd osd-tl"><span class="osd-rec"><b>●</b> REC</span><span class="osd-pause">▮▮ PAUSE</span></div>
    <div class="osd osd-tr"><span class="osd-battery"><i></i><i></i><i></i><i></i></span></div>
    <div class="osd osd-bl"><div class="osd-time"></div><div class="osd-date"></div></div>
    <div class="osd osd-br"><span class="osd-nv">NIGHT VISION</span></div>
  `;
  parent.append(root);

  const el = (selector: string): HTMLElement => {
    const found = root.querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`HUD element ${selector} missing`);
    return found;
  };
  const time = el('.osd-time');
  const date = el('.osd-date');
  const battery = el('.osd-battery');
  const bars = Array.from(battery.querySelectorAll('i'));
  let lastTime = '';
  let lastDate = '';

  return {
    setVisible(visible: boolean): void {
      root.hidden = !visible;
    },
    update(s: HudState): void {
      root.classList.toggle('recording', s.recording);
      root.classList.toggle('night-vision', s.nightVision);
      battery.classList.toggle('low', s.battery < LOW_BATTERY);
      const filled = batteryBars(s.battery);
      bars.forEach((bar, i) => bar.classList.toggle('on', i < filled));

      const t = formatOsdTime(s.clockMs);
      if (t !== lastTime) time.textContent = lastTime = t;
      const d = formatOsdDate(s.clockMs);
      if (d !== lastDate) date.textContent = lastDate = d;
    },
  };
}
```

- [ ] **Step 3: Append OSD styles to `src/style.css`**

```css
#hud {
  position: fixed;
  inset: 0;
  pointer-events: none;
  font-family: 'VT323', 'Courier New', monospace;
  font-size: clamp(18px, 3.2vh, 34px);
  color: #f4f4ec;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.6);
  letter-spacing: 0.06em;
}

#hud[hidden] {
  display: none;
}

.osd {
  position: absolute;
}

.osd-tl { top: 6vh; left: 6vw; }
.osd-tr { top: 6vh; right: 6vw; }
.osd-bl { bottom: 6vh; left: 6vw; }
.osd-br { bottom: 6vh; right: 6vw; }

.osd-rec,
.osd-nv {
  display: none;
}

#hud.recording .osd-rec {
  display: inline;
  animation: osd-blink 1s steps(1) infinite;
}

#hud.recording .osd-pause {
  display: none;
}

#hud.night-vision .osd-nv {
  display: inline;
}

.osd-rec b {
  color: #ff3b30;
  font-weight: normal;
}

.osd-battery {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border: 2px solid currentColor;
  position: relative;
}

.osd-battery::after {
  content: '';
  position: absolute;
  right: -7px;
  top: 30%;
  width: 4px;
  height: 40%;
  background: currentColor;
}

.osd-battery i {
  width: 0.45em;
  height: 0.8em;
  background: transparent;
}

.osd-battery i.on {
  background: currentColor;
}

.osd-battery.low {
  color: #ff3b30;
  animation: osd-blink 1s steps(1) infinite;
}

@keyframes osd-blink {
  50% {
    visibility: hidden;
  }
}
```

Move the debug HUD so it doesn't cover the battery icon — in the existing `.debug` rule replace `top: 8px;` and `right: 8px;` with:

```css
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
```

- [ ] **Step 4: Wire the HUD into `src/main.ts`**

Add imports:

```ts
import { createHud } from './ui/hud';
import { tapeStartTime } from './ui/osd';
```

After `const vhs = createVhsComposer(...)` add:

```ts
const hud = createHud(document.body);
const tapeStart = tapeStartTime(seed);
/** Seconds of footage recorded; only advances while recording. */
let recordedSec = 0;
```

In the fixed-step loop, replace:

```ts
    if (isLocked()) updateCamcorder(camcorder, FIXED_DT);
```

with:

```ts
    if (isLocked()) {
      updateCamcorder(camcorder, FIXED_DT);
      recordedSec += FIXED_DT;
    }
```

Before the `irLight.position.copy(camera.position);` line add:

```ts
  hud.update({
    recording: isLocked(),
    battery: camcorder.battery,
    nightVision: camcorder.nightVision,
    clockMs: tapeStart + recordedSec * 1000,
  });
```

- [ ] **Step 5: Credit the font in `public/CREDITS.md`**

Append the row:

```markdown
| VT323 font (camcorder OSD) | Google Fonts — Peter Hull | SIL Open Font License 1.1 |
```

- [ ] **Step 6: Type-check, test, build, and verify in the browser**

Run: `npx tsc --noEmit && npm test && npm run build` — expected: success.

Open `http://localhost:5173/?debug&seed=42`. Expected:
- Top-left: `▮▮ PAUSE` before clicking in; after clicking in, a blinking `● REC` with a red dot.
- Top-right: a 4-bar battery icon, all bars filled.
- Bottom-left: a 1996 time and date in a blocky VT323 font; the seconds tick only while clicked in.
- Pressing N shows `NIGHT VISION` bottom-right.
- The debug HUD sits at the bottom centre and covers nothing.

- [ ] **Step 7: Commit**

```bash
git add src/ui/hud.ts src/main.ts src/style.css index.html public/CREDITS.md
git commit -m "feat: camcorder OSD with REC, 1996 timestamp, battery and night-vision label"
```

---

### Task 7: Title and pause screens, phase wiring

**Files:**
- Modify: `index.html`, `src/style.css`, `src/main.ts`, `README.md`

**Interfaces:**
- Consumes: `nextPhase`, `Phase` (Task 4); everything wired in Tasks 5–6

- [ ] **Step 1: Replace the overlay in `index.html`**

Replace the whole `<div id="overlay">…</div>` block with:

```html
    <div id="overlay">
      <div id="title-screen" class="screen">
        <p class="brand">LEVEL 0</p>
        <p class="title">▶ PLAY TAPE</p>
        <p class="hint">WASD move · Mouse look · Shift sprint · C crouch · N night vision · Esc pause</p>
        <p class="warning">⚠ Contains flickering lights and flashing effects.</p>
      </div>
      <div id="pause-screen" class="screen" hidden>
        <p class="title">▮▮ PAUSE</p>
        <p class="hint">Click to resume</p>
      </div>
    </div>
```

- [ ] **Step 2: Restyle the overlay in `src/style.css`**

Replace the existing `#overlay`, `#overlay[hidden]`, `#overlay .title` and `#overlay .hint` rules with:

```css
#overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  color: #f4f4ec;
  font-family: 'VT323', 'Courier New', monospace;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.6);
  cursor: pointer;
  user-select: none;
}

#overlay[hidden],
.screen[hidden] {
  display: none;
}

.screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  text-align: center;
  padding: 0 1rem;
}

.screen p {
  margin: 0;
}

.screen .brand {
  font-size: 1.4rem;
  letter-spacing: 0.5em;
  opacity: 0.7;
}

.screen .title {
  font-size: clamp(2.5rem, 8vw, 5rem);
  letter-spacing: 0.15em;
}

.screen .hint {
  font-size: 1.2rem;
  opacity: 0.75;
}

.screen .warning {
  margin-top: 1.5rem;
  font-size: 1.05rem;
  opacity: 0.6;
}
```

- [ ] **Step 3: Replace `src/main.ts` with the phase-driven version**

```ts
import './style.css';
import * as THREE from 'three';
import { nextPhase, type Phase } from './core/gameState';
import { createInput } from './core/input';
import { createFixedStepper, FIXED_DT } from './core/loop';
import { createRng, deriveSeed } from './core/rng';
import { createVhsComposer } from './fx/composer';
import { glitchAmount } from './fx/glitch';
import { createLightPool } from './lighting/lightPool';
import { createCamcorder, toggleNightVision, updateCamcorder } from './player/camcorder';
import { applyLook, createPlayer, NO_INPUT, updatePlayer } from './player/controller';
import { createDebugHud } from './ui/debugHud';
import { createHud } from './ui/hud';
import { tapeStartTime } from './ui/osd';
import { parseParams } from './ui/params';
import { generateLevel } from './world/generator';
import { cellToWorld, worldToCell } from './world/grid';
import { createChunkStreamer } from './world/streamer';
import { createWorldMaterials } from './world/textures';

const FOG_COLOR = 0x3b3318;
/** Peak intensity of the camcorder's infrared illuminator in night vision. */
const IR_INTENSITY = 6;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;
const titleScreen = document.getElementById('title-screen') as HTMLDivElement;
const pauseScreen = document.getElementById('pause-screen') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ canvas, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.06);
scene.add(new THREE.HemisphereLight(0xfff2c4, 0x4a3f1c, 0.3));

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ';
// The camcorder's infrared illuminator: always in the scene (stable light count), lit only in night vision.
const irLight = new THREE.PointLight(0xffffff, 0, 14, 1.5);
scene.add(irLight);

const params = parseParams(window.location.search);
const seed = params.seed ?? Math.floor(Math.random() * 0xffffffff) >>> 0;
const level = generateLevel(seed);
const materials = createWorldMaterials(createRng(deriveSeed(seed, 'textures')));
const streamer = createChunkStreamer(scene, level.grid, materials);
const lightPool = createLightPool(scene, level.grid, deriveSeed(seed, 'lights'));
const player = createPlayer({ x: cellToWorld(level.start.x), z: cellToWorld(level.start.y) }, level.startYaw);
const debugHud = params.debug ? createDebugHud(level) : null;
if (params.debug) console.info(`[backrooms] seed ${seed} — reload with ?debug&seed=${seed} to replay`);

const camcorder = createCamcorder();
const glitchSeed = deriveSeed(seed, 'glitch');
const vhs = createVhsComposer(renderer, scene, camera, window.innerWidth, window.innerHeight);
const hud = createHud(document.body);
const tapeStart = tapeStartTime(seed);
/** Seconds of footage recorded; only advances while playing. */
let recordedSec = 0;

let phase: Phase = 'title';
const isLocked = () => document.pointerLockElement === canvas;
const input = createInput(window, isLocked);

function showPhase(): void {
  overlay.hidden = phase === 'playing';
  titleScreen.hidden = phase !== 'title';
  pauseScreen.hidden = phase !== 'paused';
  hud.setVisible(phase !== 'title');
}
showPhase();

overlay.addEventListener('click', () => {
  // Browsers refuse to re-lock for ~1 s after Esc; swallow that rejection — the next click works.
  Promise.resolve(canvas.requestPointerLock()).catch(() => undefined);
});
document.addEventListener('pointerlockchange', () => {
  phase = nextPhase(phase, isLocked() ? 'lock' : 'unlock');
  input.clear();
  showPhase();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  vhs.setSize(window.innerWidth, window.innerHeight);
});

const stepper = createFixedStepper();
let last = performance.now();

renderer.setAnimationLoop((now: number) => {
  const frameDt = (now - last) / 1000;
  last = now;
  const playing = phase === 'playing';

  // Look is applied every rendered frame; movement runs in fixed steps and is interpolated below.
  const frameInput = playing ? input.moveInput() : NO_INPUT;
  if (playing && input.consumePressed('KeyN')) toggleNightVision(camcorder);
  applyLook(player, frameInput.lookDX, frameInput.lookDY);
  const stepInput = { ...frameInput, lookDX: 0, lookDY: 0 };
  const steps = stepper.advance(frameDt);
  for (let i = 0; i < steps; i++) {
    // Steps keep running when not playing (with no input) so interpolation settles instead of drifting.
    updatePlayer(player, stepInput, FIXED_DT, level.grid);
    if (playing) {
      updateCamcorder(camcorder, FIXED_DT);
      recordedSec += FIXED_DT;
    }
  }

  const a = stepper.alpha();
  camera.position.set(
    player.prevPos.x + (player.pos.x - player.prevPos.x) * a,
    player.prevEyeHeight + (player.eyeHeight - player.prevEyeHeight) * a,
    player.prevPos.z + (player.pos.z - player.prevPos.z) * a,
  );
  camera.rotation.set(player.pitch, player.yaw, 0);
  const cellX = worldToCell(player.pos.x);
  const cellY = worldToCell(player.pos.z);
  streamer.update(cellX, cellY);
  lightPool.update(camera.position.x, camera.position.z, now / 1000);
  irLight.position.copy(camera.position);
  irLight.intensity = IR_INTENSITY * camcorder.nvBlend;

  hud.update({
    recording: playing,
    battery: camcorder.battery,
    nightVision: camcorder.nightVision,
    clockMs: tapeStart + recordedSec * 1000,
  });
  debugHud?.update(frameDt, player);

  const t = now / 1000;
  vhs.render({
    time: t,
    nightVision: camcorder.nvBlend,
    battery: camcorder.battery / 100,
    glitch: glitchAmount(t, glitchSeed, camcorder.battery),
  });
});
```

- [ ] **Step 4: Update the controls line in `README.md`**

Replace `Controls: WASD move · mouse look · Shift sprint · C crouch · Esc release.` with:

```markdown
Controls: WASD move · mouse look · Shift sprint · C crouch · N night vision · Esc pause.
```

- [ ] **Step 5: Type-check, test, build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors; all tests PASS; `✓ built`.

- [ ] **Step 6: Verify in the browser**

Open `http://localhost:5173/?debug&seed=42`. Expected:
- Title screen: `LEVEL 0`, a large `▶ PLAY TAPE`, the controls line (including N and Esc), and the flashing-effects notice; the VHS scene is visible behind it; no OSD yet.
- Click: the title disappears, `● REC` blinks, the clock ticks, WASD/mouse work, N toggles night vision.
- Esc: `▮▮ PAUSE` screen appears, OSD shows `▮▮ PAUSE`, the clock and battery stop.
- Clicking immediately after Esc may do nothing (browser rule) but shows no console error; clicking again a second later resumes.
- Pressing N on the pause screen does nothing; after resuming, night vision is unchanged.
- No console errors.

- [ ] **Step 7: Commit**

```bash
git add index.html src/style.css src/main.ts README.md
git commit -m "feat: PLAY TAPE title screen and pause screen driven by pointer lock"
```

---

## Milestone 2 done when

- `npm test` and `npm run build` pass.
- Loading the page shows the `▶ PLAY TAPE` title over live VHS footage; playing shows the camcorder OSD; Esc pauses and freezes the tape clock and battery.
- Night vision fades in/out on N, drains the battery faster, reveals dark zones, and is refused once the battery is dead.
- Tape glitches appear occasionally and never strobe; the picture sags and gets noisier on a dead battery.
- Next: write the Milestone 3 plan (escape loop: clues, notes, items incl. battery pickups, exit, sanity, TAPE ENDS / escape screens).
