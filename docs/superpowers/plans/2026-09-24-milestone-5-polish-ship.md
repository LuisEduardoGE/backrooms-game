# Milestone 5 — Polish & Ship Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tape shippable: a synthesized sound pass (fluorescent hum, carpet footsteps, the Presence's mirrored footsteps, whispers at low sanity, Smiler ringing, the Howler's steps and howl, camcorder clicks, end-of-tape static), fixes for the deferred papercuts from M1–M4, better performance and self-hosted fonts, an attract-mode autopilot that records a trailer GIF, a play-on-desktop gate for phones, and deploy-ready static hosting — without publishing anything.

**Architecture:** Audio is synthesized with the Web Audio API at runtime (no audio files, no licences); pure functions decide levels and when the Presence echoes a footstep, a thin engine owns the node graph. The game code moves behind a dynamic import so phones get a tiny gate page instead of a WebGL load. An autopilot (pure, tested against the real controller and collision) walks the true path for `?attract`, which a small Puppeteer script records into `public/trailer.gif` with ffmpeg.

**Tech Stack:** TypeScript, Vite, Three.js, Web Audio API, Vitest, puppeteer-core (dev only), ffmpeg (dev only).

**Spec:** `docs/superpowers/specs/2026-09-24-level-0-design.md` — implements Milestone 5 of §10 (audio pass, play-on-desktop screen, performance pass, static deploy, trailer GIF) plus §6's whispers/phantom footsteps and §7's warning howl and mirrored footsteps.

## Global Constraints

- Everything from the Milestone 1–4 plans still applies.
- New pure modules must not import `three` or touch Web Audio: `src/audio/mix.ts`, `src/game/autopilot.ts`, `src/ui/device.ts`.
- Audio must start only from a user gesture (the PLAY TAPE click) and is mutable with **M**.
- **Nothing is published by this plan.** No `git push`, no enabling GitHub Pages, no Vercel deploy. Deploy configuration is committed; publishing waits for the user.
- Assets stay self-made or OFL: fonts are self-hosted with their OFL licence text; audio is synthesized; the trailer is recorded from the game itself.
- Photosensitivity: nothing new flashes; the trailer GIF comes from the same footage.
- Rulings where the spec is silent (each cheap to change):
  - Sound design is synthesized, not sampled.
  - The Presence echoes about a quarter of the player's audible footsteps 0.3–0.5 s later from 6–10 m behind them; silent (crouched) steps never echo.
  - The warning howl plays non-positionally (distant-sounding) because the Howler spawns 30–60 cells away, beyond positional audibility.
  - Chunk load radius drops from 3 to 2 (the fog hides everything past ~35 m; radius 2 still keeps ≥ 64 m loaded).
  - The play-on-desktop gate blocks devices with no fine pointer (phones/tablets without a mouse).

## Review Focus

1. **Audio that never starts or blares** — the AudioContext must be created/resumed only on the PLAY TAPE click, survive pause/resume, respect mute, and levels must be bounded (no gain > 1 anywhere). (Tests: Task 2 for levels; Task 3 manual.)
2. **Echo spam** — the Presence must not echo every step or echo silent steps. (Test: Task 2.)
3. **Autopilot getting stuck** — the attract mode must actually reach the exit on real levels. (Test: Task 6.)
4. **Laptops with touchscreens blocked** — the gate must only block devices without any fine pointer. (Test: Task 7.)
5. **Regressions from the papercut fixes** — entity search/planning changes must keep every M4 behaviour test green. (Task 4 runs the full suite.)

---

## File Structure

```
.gitattributes                         LF line endings                           (Task 1)
index.html, public/favicon.svg         favicon                                   (Task 1)
src/audio/mix.ts                       levels + Presence echo decisions          (Task 2)
src/audio/engine.ts                    Web Audio node graph                      (Task 3)
src/game/entity.ts                     throttled failed plans, search centre     (Task 4)
src/world/entityViews.ts               hunched Howler, visible eyes, idle legs   (Task 4)
src/world/chunks.ts                    LOAD_RADIUS 2                             (Task 5)
public/fonts/*                         self-hosted VT323 + Reenie Beanie + OFL   (Task 5)
src/game/autopilot.ts                  path-following steering                   (Task 6)
scripts/record-trailer.mjs, public/trailer.gif                                   (Task 6)
src/ui/device.ts                       desktop capability check                  (Task 7)
src/main.ts → src/app.ts               game code moves behind a dynamic import   (Task 7)
vite.config.ts, .github/workflows/pages.yml, README.md, CLAUDE.md               (Task 8)
```

---

### Task 1: Line endings and favicon

**Files:**
- Create: `.gitattributes`, `public/favicon.svg`
- Modify: `index.html`

- [ ] **Step 1: Create `.gitattributes`**

```
* text=auto eol=lf
*.png binary
*.gif binary
*.woff2 binary
```

- [ ] **Step 2: Renormalize the working tree**

Run: `git add --renormalize . && git status --short | head`
Expected: files previously stored with CRLF show as modified.

- [ ] **Step 3: Create `public/favicon.svg`** (a red REC dot on a camcorder-black square)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#111"/><circle cx="16" cy="16" r="8" fill="#ff3b30"/></svg>
```

- [ ] **Step 4: Link it in `index.html`**

After the `<title>` line add:

```html
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
```

- [ ] **Step 5: Verify and commit**

Run: `npm test && npm run build` — expected: all PASS, `✓ built`. Load the dev server: no favicon 404 in the console.

```bash
git add -A
git commit -m "chore: LF line endings and a REC-dot favicon"
```

---

### Task 2: Audio mix decisions

**Files:**
- Create: `src/audio/mix.ts`
- Test: `tests/audio/mix.test.ts`

**Interfaces:**
- Consumes: `Gait` (M1), `Rng` (M1)
- Produces:
  - `HUM_RANGE = 6` (m); `humLevel(distToLitPanel: number | null, blackout: boolean): number` — 0..0.2; 0 in the dark or during a blackout
  - `footstepLevel(gait: Gait): number` — crouch 0.06, walk 0.3, sprint 0.55
  - `whisperLevel(distortion: number): number` — 0 below 0.15, rising to 0.3 at 1
  - `ECHO_CHANCE = 0.25`; `interface Echo { delaySec: number; x: number; z: number }`
  - `maybeEcho(rng: Rng, footstepRadius: number, pos: { x: number; z: number }, yaw: number): Echo | null` — never for silent steps; 0.3–0.5 s later, 6–10 m behind

- [ ] **Step 1: Write the failing test `tests/audio/mix.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { ECHO_CHANCE, footstepLevel, humLevel, maybeEcho, whisperLevel } from '../../src/audio/mix';
import { createRng } from '../../src/core/rng';

describe('humLevel', () => {
  it('is loudest under a panel, fades with distance, and is silent in the dark or a blackout', () => {
    expect(humLevel(0, false)).toBeCloseTo(0.2, 6);
    expect(humLevel(3, false)).toBeLessThan(humLevel(0, false));
    expect(humLevel(3, false)).toBeGreaterThan(0);
    expect(humLevel(null, false)).toBe(0);
    expect(humLevel(0, true)).toBe(0);
    expect(humLevel(50, false)).toBeGreaterThan(0);
  });
});

describe('footstepLevel / whisperLevel', () => {
  it('orders gaits by loudness and keeps every level ≤ 1', () => {
    expect(footstepLevel('crouch')).toBeLessThan(footstepLevel('walk'));
    expect(footstepLevel('walk')).toBeLessThan(footstepLevel('sprint'));
    expect(footstepLevel('sprint')).toBeLessThanOrEqual(1);
  });

  it('whispers only once the tape starts to warp', () => {
    expect(whisperLevel(0)).toBe(0);
    expect(whisperLevel(0.1)).toBe(0);
    expect(whisperLevel(0.5)).toBeGreaterThan(0);
    expect(whisperLevel(1)).toBeCloseTo(0.3, 6);
  });
});

describe('maybeEcho', () => {
  it('never echoes a silent step', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) expect(maybeEcho(rng, 0, { x: 0, z: 0 }, 0)).toBeNull();
  });

  it('echoes roughly a quarter of audible steps, shortly after, from behind', () => {
    const rng = createRng(2);
    const echoes = Array.from({ length: 2000 }, () => maybeEcho(rng, 6, { x: 10, z: 10 }, 0)).filter((e) => e !== null);
    expect(echoes.length / 2000).toBeGreaterThan(ECHO_CHANCE - 0.05);
    expect(echoes.length / 2000).toBeLessThan(ECHO_CHANCE + 0.05);
    for (const e of echoes) {
      expect(e!.delaySec).toBeGreaterThanOrEqual(0.3);
      expect(e!.delaySec).toBeLessThanOrEqual(0.5);
      const d = Math.hypot(e!.x - 10, e!.z - 10);
      expect(d).toBeGreaterThanOrEqual(6 - 1e-9);
      expect(d).toBeLessThanOrEqual(10 + 1e-9);
      // Facing −z (yaw 0), "behind" is +z.
      expect(e!.z - 10).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/audio/mix.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/audio/mix.ts`**

```ts
import type { Rng } from '../core/rng';
import type { Gait } from '../player/controller';

/** Metres from a lit panel within which its hum is loudest. */
export const HUM_RANGE = 6;
const HUM_MAX = 0.2;
const HUM_FLOOR = 0.25;

/** Fluorescent hum: loud under a panel, a distant drone elsewhere in the light, silence in the dark. */
export function humLevel(distToLitPanel: number | null, blackout: boolean): number {
  if (blackout || distToLitPanel === null) return 0;
  const near = Math.max(0, 1 - distToLitPanel / HUM_RANGE);
  return HUM_MAX * (HUM_FLOOR + (1 - HUM_FLOOR) * near);
}

const FOOTSTEP: Record<Gait, number> = { crouch: 0.06, walk: 0.3, sprint: 0.55 };

export function footstepLevel(gait: Gait): number {
  return FOOTSTEP[gait];
}

const WHISPER_START = 0.15;
const WHISPER_MAX = 0.3;

/** Whispers creep in as the tape warps (distortion 0..1). */
export function whisperLevel(distortion: number): number {
  if (distortion <= WHISPER_START) return 0;
  return WHISPER_MAX * Math.min(1, (distortion - WHISPER_START) / (1 - WHISPER_START));
}

export const ECHO_CHANCE = 0.25;

export interface Echo {
  delaySec: number;
  x: number;
  z: number;
}

/** The Presence: sometimes a footstep is answered from behind, a moment later. */
export function maybeEcho(rng: Rng, footstepRadius: number, pos: { x: number; z: number }, yaw: number): Echo | null {
  if (footstepRadius <= 0) return null;
  if (!rng.chance(ECHO_CHANCE)) return null;
  const dist = rng.range(6, 10);
  const spread = rng.range(-0.5, 0.5);
  // Behind = opposite of forward (−sin yaw, −cos yaw), with a little sideways spread.
  const bx = Math.sin(yaw + spread);
  const bz = Math.cos(yaw + spread);
  return { delaySec: rng.range(0.3, 0.5), x: pos.x + bx * dist, z: pos.z + bz * dist };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/audio/mix.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — expected: no output.

```bash
git add src/audio/mix.ts tests/audio/mix.test.ts
git commit -m "feat: audio mix levels and the Presence's footstep echoes"
```

---

### Task 3: The sound engine

**Files:**
- Create: `src/audio/engine.ts`
- Modify: `src/main.ts`, `index.html`

**Interfaces:**
- Consumes: Task 2; `Gait`
- Produces: `createAudioEngine(debug: boolean): AudioEngine` with
  - `unlock(): void` — create/resume the AudioContext (call from a click)
  - `toggleMute(): boolean`
  - `setFrame(f: { listener: { x: number; z: number; yaw: number }; hum: number; whisper: number; smilers: readonly { id: number; x: number; z: number }[]; howler: { x: number; z: number; moving: boolean } | null; paused: boolean }): void`
  - `footstep(level: number, sprint: boolean): void`, `echoStep(x: number, z: number): void`, `howl(): void`, `click(): void`, `staticBurst(): void`

Web Audio glue — verified in the browser.

- [ ] **Step 1: Create `src/audio/engine.ts`**

```ts
/** Every sound is synthesized here; nothing is loaded. Levels come from src/audio/mix.ts. */
export interface AudioFrame {
  listener: { x: number; z: number; yaw: number };
  hum: number;
  whisper: number;
  smilers: readonly { id: number; x: number; z: number }[];
  howler: { x: number; z: number; moving: boolean } | null;
  paused: boolean;
}

export interface AudioEngine {
  unlock(): void;
  toggleMute(): boolean;
  setFrame(f: AudioFrame): void;
  footstep(level: number, sprint: boolean): void;
  echoStep(x: number, z: number): void;
  howl(): void;
  click(): void;
  staticBurst(): void;
}

const EAR_HEIGHT = 1.6;
const SMOOTH = 0.08;

export function createAudioEngine(debug: boolean): AudioEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let noise: AudioBuffer;
  let humGain: GainNode;
  let whisperGain: GainNode;
  let muted = false;
  let howlerNextStep = 0;
  const smilerVoices = new Map<number, { panner: PannerNode; gain: GainNode }>();

  const panner = (x: number, z: number, ref: number, rolloff: number): PannerNode => {
    const p = ctx!.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'exponential';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.maxDistance = 60;
    p.positionX.value = x;
    p.positionY.value = EAR_HEIGHT;
    p.positionZ.value = z;
    return p;
  };

  const noiseSource = (loop = false): AudioBufferSourceNode => {
    const s = ctx!.createBufferSource();
    s.buffer = noise;
    s.loop = loop;
    return s;
  };

  /** A filtered noise burst: carpet thud, heavy step, or static. */
  const burst = (dest: AudioNode, level: number, cutoff: number, decay: number) => {
    const t = ctx!.currentTime;
    const src = noiseSource();
    const lp = ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(lp).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5, decay + 0.05);
  };

  function build(): void {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(comp).connect(ctx.destination);

    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Fluorescent hum: mains hum + a thin high buzz.
    humGain = ctx.createGain();
    humGain.gain.value = 0;
    humGain.connect(master);
    for (const [freq, level] of [[120, 0.5], [240, 0.2], [360, 0.08]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(humGain);
      o.start();
    }
    const buzz = noiseSource(true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 7000;
    bp.Q.value = 8;
    const buzzGain = ctx.createGain();
    buzzGain.gain.value = 0.15;
    buzz.connect(bp).connect(buzzGain).connect(humGain);
    buzz.start();

    // Whispers: two breathy bands, swaying between the ears.
    whisperGain = ctx.createGain();
    whisperGain.gain.value = 0;
    const sway = ctx.createStereoPanner();
    whisperGain.connect(sway).connect(master);
    const swayLfo = ctx.createOscillator();
    swayLfo.frequency.value = 0.13;
    const swayDepth = ctx.createGain();
    swayDepth.gain.value = 0.8;
    swayLfo.connect(swayDepth).connect(sway.pan);
    swayLfo.start();
    for (const [freq, rate] of [[900, 0.4], [1800, 0.7]] as const) {
      const src = noiseSource(true);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 5;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth).connect(g.gain);
      src.connect(f).connect(g).connect(whisperGain);
      src.start();
      lfo.start();
    }
    if (debug) console.info('[backrooms] audio', ctx.state);
  }

  function smilerVoice(id: number, x: number, z: number) {
    let v = smilerVoices.get(id);
    if (!v) {
      const p = panner(x, z, 2, 1.5);
      const gain = ctx!.createGain();
      gain.gain.value = 0.05;
      const tone = ctx!.createOscillator();
      tone.frequency.value = 2200 + id * 37;
      const trem = ctx!.createOscillator();
      trem.frequency.value = 6;
      const tremDepth = ctx!.createGain();
      tremDepth.gain.value = 0.03;
      trem.connect(tremDepth).connect(gain.gain);
      tone.connect(gain).connect(p).connect(master);
      tone.start();
      trem.start();
      v = { panner: p, gain };
      smilerVoices.set(id, v);
    }
    return v;
  }

  return {
    unlock() {
      if (!ctx) build();
      else void ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
      return muted;
    },
    setFrame(f) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const L = ctx.listener;
      L.positionX.value = f.listener.x;
      L.positionY.value = EAR_HEIGHT;
      L.positionZ.value = f.listener.z;
      L.forwardX.value = -Math.sin(f.listener.yaw);
      L.forwardY.value = 0;
      L.forwardZ.value = -Math.cos(f.listener.yaw);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
      const quiet = f.paused ? 0.25 : 1;
      humGain.gain.setTargetAtTime(Math.min(1, f.hum * quiet), t, SMOOTH);
      whisperGain.gain.setTargetAtTime(f.paused ? 0 : Math.min(1, f.whisper), t, SMOOTH * 4);
      for (const s of f.smilers) {
        const v = smilerVoice(s.id, s.x, s.z);
        v.panner.positionX.setTargetAtTime(s.x, t, SMOOTH);
        v.panner.positionZ.setTargetAtTime(s.z, t, SMOOTH);
      }
      if (f.howler && f.howler.moving && !f.paused && t >= howlerNextStep) {
        howlerNextStep = t + 0.55;
        const p = panner(f.howler.x, f.howler.z, 3, 1.2);
        p.connect(master);
        burst(p, 0.9, 180, 0.35);
      }
    },
    footstep(level, sprint) {
      if (!ctx) return;
      burst(master, Math.min(1, level), sprint ? 800 : 500, sprint ? 0.1 : 0.14);
    },
    echoStep(x, z) {
      if (!ctx) return;
      const p = panner(x, z, 2, 1);
      p.connect(master);
      burst(p, 0.35, 380, 0.16);
    },
    howl() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(190, t);
      o.frequency.exponentialRampToValueAtTime(85, t + 2.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      for (const formant of [650, 1100]) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = formant;
        bp.Q.value = 6;
        o.connect(bp).connect(lp);
      }
      lp.connect(g).connect(master);
      o.start(t);
      o.stop(t + 3);
    },
    click() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 1200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.05);
    },
    staticBurst() {
      if (!ctx) return;
      burst(master, 0.5, 9000, 1.2);
    },
  };
}
```

- [ ] **Step 2: Add a mute hint to the title screen in `index.html`**

Change the title hint line to end with ` · M mute`.

- [ ] **Step 3: Wire audio into `src/main.ts`**

Add imports:

```ts
import { createAudioEngine } from './audio/engine';
import { footstepLevel, humLevel, maybeEcho, whisperLevel } from './audio/mix';
```

and add `nearestLitLightsAt` to the lighting import (`import { nearestLitLightsAt, panelGlow } from './lighting/lights';`).

After `const noteReader = …` add:

```ts
const audio = createAudioEngine(params.debug);
const echoRng = createRng(deriveSeed(seed, 'echoes'));
/** Presence echoes waiting to play (performance.now() ms). */
const pendingEchoes: { at: number; x: number; z: number }[] = [];
```

In the overlay click listener, before the `Promise.resolve(canvas.requestPointerLock())…` line, add:

```ts
  audio.unlock();
```

After the `pointerlockchange` listener, add:

```ts
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') audio.toggleMute();
});
```

In the animation loop, change `if (playing && input.consumePressed('KeyN')) toggleNightVision(camcorder);` to:

```ts
  if (playing && input.consumePressed('KeyN')) {
    toggleNightVision(camcorder);
    audio.click();
  }
```

In the step loop, right after `const noises: NoiseEvent[] = …;` add:

```ts
      if (footstep !== null) {
        audio.footstep(footstepLevel(player.gait), player.gait === 'sprint');
        const echo = maybeEcho(echoRng, footstep, player.pos, player.yaw);
        if (echo) pendingEchoes.push({ at: now + echo.delaySec * 1000, x: echo.x, z: echo.z });
      }
```

In `onDirectorEvent`, in the `spawnHowler` branch, add `audio.howl();`. In `endTape`, add `audio.staticBurst();` as its first line.

Before `const t = now / 1000;` (just above `vhs.render`) add:

```ts
  while (pendingEchoes.length > 0 && pendingEchoes[0].at <= now) {
    const e = pendingEchoes.shift()!;
    audio.echoStep(e.x, e.z);
  }
  const nearestPanel = nearestLitLightsAt(level.grid, player.pos.x, player.pos.z, 1)[0];
  const howler = entities.find((e) => e.kind === 'howler');
  audio.setFrame({
    listener: { x: camera.position.x, z: camera.position.z, yaw: player.yaw },
    hum: humLevel(
      nearestPanel ? Math.hypot(cellToWorld(nearestPanel.x) - player.pos.x, cellToWorld(nearestPanel.y) - player.pos.z) : null,
      activeBlackout !== null,
    ),
    whisper: whisperLevel(distortionFromSanity(sanity.value)),
    smilers: entities.filter((e) => e.kind === 'smiler').map((e) => ({ id: e.id, x: e.pos.x, z: e.pos.z })),
    howler: howler ? { x: howler.pos.x, z: howler.pos.z, moving: howler.pos.x !== howler.prevPos.x || howler.pos.z !== howler.prevPos.z } : null,
    paused: phase !== 'playing',
  });
```

- [ ] **Step 4: Type-check, test, build, verify**

Run: `npx tsc --noEmit && npm test && npm run build` — expected: success.

Browser (`?debug&seed=42`): click the title → the console logs `[backrooms] audio running` (or `suspended` then running); no errors. Hands-on with headphones: a hum under lit panels that fades in dark zones; soft carpet steps (louder sprinting, near-silent crouching); now and then a step answered from behind; whispers creeping in as the picture warps; M mutes. Pausing quiets the hum.

- [ ] **Step 5: Commit**

```bash
git add src/audio/engine.ts src/main.ts index.html
git commit -m "feat: synthesized audio — hum, footsteps, echoes, whispers, Smiler ring, Howler steps and howl"
```

---

### Task 4: Papercuts deferred from M1–M4

**Files:**
- Modify: `src/game/entity.ts`, `src/world/entityViews.ts`, `src/main.ts`
- Test: `tests/game/entity.test.ts` (append)

**Interfaces:**
- Produces: `Entity.searchCentre: Point | null` (where a search wanders); `entityViews.sync(entities, alpha, dt, animate: boolean)`

- [ ] **Step 1: Append failing tests to `tests/game/entity.test.ts`**

At the top of the file add (after the imports) a pass-through mock so calls to `findPath` can be counted (ESM exports can't be spied on directly):

```ts
import { vi } from 'vitest';
import { findPath } from '../../src/game/astar';

vi.mock('../../src/game/astar', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/game/astar')>();
  return { ...mod, findPath: vi.fn(mod.findPath) };
});
```

Append:

```ts
describe('papercuts', () => {
  it('does not re-plan a failed path every step (throttled like successful ones)', () => {
    const g = open();
    // Two dark zones the Smiler can't cross between: x ≤ 5 and x ≥ 10.
    const zone = (x: number, y: number) => floor(g)(x, y) && (x <= 5 || x >= 10);
    const e = createEntity(0, 'smiler', { x: 3, y: 10 });
    vi.mocked(findPath).mockClear();
    const w = world(g, at(12, 10), [], zone, zone); // visible across the gap, unreachable
    for (let i = 0; i < 60; i++) updateEntity(e, 1 / 60, w);
    expect(vi.mocked(findPath).mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('searches around the noise it just investigated, not an old sighting', () => {
    const g = open();
    for (let x = 1; x <= 28; x++) setCell(g, x, 15, Cell.Wall);
    const e = createEntity(0, 'howler', { x: 5, y: 5 });
    e.lastSeen = at(25, 25); // an old sighting far away
    run(e, world(g, at(25, 25), [{ ...at(9, 5), radius: 6 }]), 5);
    expect(e.state).toBe('search');
    for (let i = 0; i < 300; i++) {
      updateEntity(e, 1 / 60, world(g, at(25, 25)));
      if (e.goal) expect(Math.max(Math.abs(e.goal.x - 9), Math.abs(e.goal.y - 5))).toBeLessThanOrEqual(5);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/game/entity.test.ts`
Expected: FAIL — too many `findPath` calls; search goals near the old sighting.

- [ ] **Step 3: Fix `src/game/entity.ts`**

Add `searchCentre: Point | null;` to `Entity` (after `lastSeen`) and `searchCentre: null,` to the object returned by `createEntity`.

In the lost-sight branch (`e.state = 'search'; e.timer = t.searchSec;`), set the centre from the sighting:

```ts
      e.searchCentre = e.lastSeen ? cellOf(e.lastSeen) : here;
```

In the investigate-arrival branch (where `e.state = 'search'` after investigating), before `setGoal(e, null);` add:

```ts
    e.searchCentre = e.goal ?? here;
```

In the search branch replace `setGoal(e, randomNearby(w, e.lastSeen ? cellOf(e.lastSeen) : here, SEARCH_WANDER));` with:

```ts
      setGoal(e, randomNearby(w, e.searchCentre ?? here, SEARCH_WANDER));
```

Replace the planning condition:

```ts
  if (e.goal && (e.repath <= 0 || e.path.length === 0) && !sameCell(here, e.goal)) {
```

with:

```ts
  // Re-plan on the throttle, or at once only when a fresh goal was just set (setGoal zeroes repath).
  if (e.goal && e.repath <= 0 && !sameCell(here, e.goal)) {
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS (every M4 entity test still green).

- [ ] **Step 5: Hunch the Howler, show its eyes, and still its legs when the game isn't running**

In `src/world/entityViews.ts`:
- change `torso.rotation.x = 0.25;` to `torso.rotation.x = -0.25;` (leans forward, toward −Z);
- change the eye position `eye.position.set(x, 2.33, -0.26);` to `eye.position.set(x, 2.33, -0.29);`;
- change `sync(entities: readonly Entity[], alpha: number, dt: number): void {` to `sync(entities: readonly Entity[], alpha: number, dt: number, animate: boolean): void {`;
- change the `speed` line to `const speed = animate && dt > 0 ? Math.hypot(e.pos.x - e.prevPos.x, e.pos.z - e.prevPos.z) * 60 : 0;`.

- [ ] **Step 6: Main-loop papercuts in `src/main.ts`**

- `entityViews.sync(entities, a, frameDt);` → `entityViews.sync(entities, a, frameDt, phase === 'playing');`
- HUD recording during reading and the end glitch: change `recording: playing,` to `recording: playing || phase === 'reading' || (endedAt !== null && !endRevealed),`.
- `endTape` guard: replace its first line `setPhase(event);` with:

```ts
  const before = phase;
  setPhase(event);
  if (phase === before) return;
```

(Keep `audio.staticBurst();` after the guard.)

- Pause-aware Presence/warning timers: in `onDirectorEvent` the `now` argument is passed from the step loop; change that call to `onDirectorEvent(event, recordedSec * 1000)` and compare the timers against the same clock — replace `now < blackout.until`, `now < dimUntil` and `now < glitchUntil` in the render section with `gameMs < …` where `const gameMs = recordedSec * 1000;` is declared just before `const activeBlackout`.

- [ ] **Step 7: Type-check, test, build, and commit**

Run: `npx tsc --noEmit && npm test && npm run build` — expected: success.

```bash
git add src tests
git commit -m "fix: throttle failed plans, search around the right spot, hunched Howler, idle legs, pause-aware timers"
```

---

### Task 5: Performance and self-hosted fonts

**Files:**
- Modify: `src/world/chunks.ts`, `src/style.css`, `index.html`, `public/CREDITS.md`
- Create: `src/assets/fonts/VT323-Regular.woff2`, `src/assets/fonts/ReenieBeanie-Regular.woff2`, `public/fonts/OFL.txt`

- [ ] **Step 1: Lower the chunk load radius**

In `src/world/chunks.ts` change `export const LOAD_RADIUS = 3;` to:

```ts
/** Chunks loaded around the player. Fog hides everything past ~35 m; radius 2 keeps ≥ 64 m loaded. */
export const LOAD_RADIUS = 2;
```

- [ ] **Step 2: Download the fonts (OFL) into `src/assets/fonts/` (bundled and fingerprinted by Vite) and the licence into `public/fonts/`**

Run:

```bash
mkdir -p src/assets/fonts public/fonts
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
for fam in "VT323" "Reenie+Beanie"; do
  url=$(curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=$fam&display=swap" | grep -o 'https://fonts.gstatic.com/[^)]*\.woff2' | tail -1)
  name=$(echo "$fam" | tr -d '+')-Regular.woff2
  curl -s -o "src/assets/fonts/$name" "$url"
done
curl -s -o public/fonts/OFL.txt https://raw.githubusercontent.com/google/fonts/main/ofl/vt323/OFL.txt
ls -la src/assets/fonts public/fonts
```

Expected: `VT323-Regular.woff2` and `ReenieBeanie-Regular.woff2` (each > 10 kB) and `public/fonts/OFL.txt`.

- [ ] **Step 3: Use them**

At the top of `src/style.css` add:

```css
@font-face {
  font-family: 'VT323';
  src: url('./assets/fonts/VT323-Regular.woff2') format('woff2');
  font-display: swap;
}

@font-face {
  font-family: 'Reenie Beanie';
  src: url('./assets/fonts/ReenieBeanie-Regular.woff2') format('woff2');
  font-display: swap;
}
```

In `index.html` delete the two `preconnect` links and the Google Fonts stylesheet link.

In `public/CREDITS.md`, change both font rows' Source to `Self-hosted from Google Fonts (licence: fonts/OFL.txt)`.

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run build` — expected: success. Browser: the OSD and notes still render in VT323 / Reenie Beanie with no requests to `fonts.googleapis.com`; the debug fps counter holds the display rate with entities active (temporarily force the director phases as in M4 to check).

```bash
git add src/world/chunks.ts src/style.css index.html src/assets public/fonts public/CREDITS.md
git commit -m "perf: load radius 2; self-host OFL fonts (no third-party requests)"
```

---

### Task 6: Attract mode and the trailer GIF

**Files:**
- Create: `src/game/autopilot.ts`, `scripts/record-trailer.mjs`, `public/trailer.gif`
- Modify: `src/ui/params.ts`, `src/main.ts`, `package.json`
- Test: `tests/game/autopilot.test.ts`, `tests/ui/params.test.ts` (append)

**Interfaces:**
- Consumes: `MoveInput`, `NO_INPUT`, `updatePlayer`, `createPlayer` (M1); `shortestPath` (M3); `reachedExit` (M3)
- Produces:
  - `interface Autopilot { index: number }`, `createAutopilot(): Autopilot`
  - `autopilotInput(a: Autopilot, pos: { x: number; z: number }, yaw: number, path: readonly Point[], dt: number, finalAim?: { x: number; z: number }): MoveInput` — steers toward a look-ahead waypoint, turning at most 2.5 rad/s; on the last cell it walks at `finalAim` (the noclip wall's face)
  - `GameParams.attract: boolean`

- [ ] **Step 1: Write the failing tests**

`tests/game/autopilot.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { autopilotInput, createAutopilot } from '../../src/game/autopilot';
import { createPlayer, updatePlayer } from '../../src/player/controller';
import { shortestPath } from '../../src/world/clues';
import { reachedExit } from '../../src/world/exit';
import { generateLevel } from '../../src/world/generator';
import { CELL_SIZE, cellToWorld, DIR_STEP } from '../../src/world/grid';

describe('autopilot', () => {
  for (const seed of [42, 7, 1234]) {
    it(`walks the true path to the noclip wall on seed ${seed}`, () => {
      const level = generateLevel(seed);
      const path = shortestPath(level.grid, level.start, level.exit);
      const player = createPlayer({ x: cellToWorld(level.start.x), z: cellToWorld(level.start.y) }, level.startYaw);
      const ap = createAutopilot();
      const face = {
        x: cellToWorld(level.exit.x) + (DIR_STEP[level.exitSide].x * CELL_SIZE) / 2,
        z: cellToWorld(level.exit.y) + (DIR_STEP[level.exitSide].y * CELL_SIZE) / 2,
      };
      const dt = 1 / 60;
      let escaped = false;
      for (let i = 0; i < 60 * 900 && !escaped; i++) {
        updatePlayer(player, autopilotInput(ap, player.pos, player.yaw, path, dt, face), dt, level.grid);
        escaped = reachedExit(level.exit, level.exitSide, player.pos);
      }
      expect(escaped).toBe(true);
    });
  }
});
```

Append to `tests/ui/params.test.ts`:

```ts
describe('attract flag', () => {
  it('is on with ?attract', () => {
    expect(parseParams('?attract').attract).toBe(true);
    expect(parseParams('').attract).toBe(false);
  });
});
```

and update the defaults expectation to `{ debug: false, seed: null, god: false, attract: false }`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/game/autopilot.test.ts tests/ui/params.test.ts`
Expected: FAIL — module not found; `attract` missing.

- [ ] **Step 3: Implement `src/game/autopilot.ts`**

```ts
import { NO_INPUT, type MoveInput } from '../player/controller';
import { cellToWorld, type Point } from '../world/grid';

const LOOK_AHEAD = 2;
const REACHED = 0.9;
const TURN_RATE = 2.5;

export interface Autopilot {
  /** Index of the path cell currently being approached. */
  index: number;
}

export function createAutopilot(): Autopilot {
  return { index: 0 };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Walks a cell path: aims at a look-ahead waypoint, turns smoothly, slows for sharp turns. */
export function autopilotInput(
  a: Autopilot,
  pos: { x: number; z: number },
  yaw: number,
  path: readonly Point[],
  dt: number,
  finalAim?: { x: number; z: number },
): MoveInput {
  if (path.length === 0) return NO_INPUT;
  while (a.index < path.length - 1 && Math.hypot(cellToWorld(path[a.index].x) - pos.x, cellToWorld(path[a.index].y) - pos.z) < REACHED) {
    a.index++;
  }
  const target = path[Math.min(path.length - 1, a.index + LOOK_AHEAD)];
  const final = a.index >= path.length - 1;
  const aim = final && finalAim ? finalAim : { x: cellToWorld(target.x), z: cellToWorld(target.y) };
  const tx = aim.x;
  const tz = aim.z;
  const want = Math.atan2(-(tx - pos.x), -(tz - pos.z));
  const diff = wrap(want - yaw);
  const turn = Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, diff));
  return {
    ...NO_INPUT,
    forward: Math.abs(diff) < 0.6 || final ? 1 : 0.3,
    lookDX: -turn,
  };
}
```

(On the final cell it walks at the noclip wall's face, pressing into it.)

In `src/ui/params.ts` add `attract: boolean;` to `GameParams` (doc comment: `/** Demo/trailer mode: the camera walks the true path by itself. */`) and `attract: params.has('attract')` to the returned object.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all PASS. If a seed fails to reach the exit, inspect where it stalls (corner-cutting into a pillar or wall) and adjust `LOOK_AHEAD`/`REACHED` — do not weaken the test.

- [ ] **Step 5: Wire attract mode into `src/main.ts`**

Add imports `import { autopilotInput, createAutopilot } from './game/autopilot';` and add `DIR_STEP` to the grid import.

After `showPhase();` (the startup call) add:

```ts
// Attract/trailer mode: no pointer lock; the camcorder walks the true path on its own.
const autopilot = params.attract ? createAutopilot() : null;
const exitFace = {
  x: cellToWorld(level.exit.x) + (DIR_STEP[level.exitSide].x * CELL_SIZE) / 2,
  z: cellToWorld(level.exit.y) + (DIR_STEP[level.exitSide].y * CELL_SIZE) / 2,
};
if (autopilot) {
  phase = 'playing';
  showPhase();
}
```

Change the frame input line `const frameInput = playing ? input.moveInput() : NO_INPUT;` to:

```ts
  const frameInput = autopilot && playing
    ? autopilotInput(autopilot, player.pos, player.yaw, truePath, frameDt, exitFace)
    : playing
      ? input.moveInput()
      : NO_INPUT;
```

In attract mode, entities must not end the demo: change both `!params.god` catch/sanity checks to `!params.god && !params.attract`.

- [ ] **Step 6: Record the trailer**

Install the recorder: `npm install -D puppeteer-core`.

Create `scripts/record-trailer.mjs`:

```js
// Records ?attract footage from the production build into public/trailer.gif (dev tool; needs Chrome + ffmpeg).
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FRAMES = 'scripts/.frames';
const PORT = 4173;

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });
await page.goto(`http://localhost:${PORT}/?attract&seed=42`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1500));
for (let i = 0; i < 90; i++) {
  await page.screenshot({ path: `${FRAMES}/f${String(i).padStart(3, '0')}.png` });
  await new Promise((r) => setTimeout(r, 100));
}
await browser.close();
server.kill();

execFileSync('ffmpeg', ['-y', '-framerate', '10', '-i', `${FRAMES}/f%03d.png`, '-vf',
  'scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
  'public/trailer.gif'], { stdio: 'inherit' });
rmSync(FRAMES, { recursive: true, force: true });
console.log('wrote public/trailer.gif');
```

Add to `package.json` scripts: `"trailer": "npm run build && node scripts/record-trailer.mjs"`. Add `scripts/.frames/` to `.gitignore`.

Run: `npm run trailer`
Expected: `wrote public/trailer.gif`; the file is a few MB at most and shows the camcorder walking the yellow halls with the OSD.

- [ ] **Step 7: Commit**

```bash
git add src/game/autopilot.ts src/ui/params.ts src/main.ts tests scripts/record-trailer.mjs package.json package-lock.json .gitignore public/trailer.gif
git commit -m "feat: attract-mode autopilot and a recorded trailer GIF"
```

---

### Task 7: Play-on-desktop gate

**Files:**
- Create: `src/ui/device.ts`
- Move: `src/main.ts` → `src/app.ts`; new `src/main.ts`
- Modify: `index.html`, `src/style.css`
- Test: `tests/ui/device.test.ts`

**Interfaces:**
- Produces: `isDesktopCapable(env: { anyFinePointer: boolean; width: number }): boolean`

- [ ] **Step 1: Write the failing test `tests/ui/device.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { isDesktopCapable } from '../../src/ui/device';

describe('isDesktopCapable', () => {
  it('lets desktops and touchscreen laptops (which also have a mouse/trackpad) play', () => {
    expect(isDesktopCapable({ anyFinePointer: true, width: 1920 })).toBe(true);
    expect(isDesktopCapable({ anyFinePointer: true, width: 1280 })).toBe(true);
  });

  it('gates phones and tablets without a fine pointer, or tiny windows', () => {
    expect(isDesktopCapable({ anyFinePointer: false, width: 390 })).toBe(false);
    expect(isDesktopCapable({ anyFinePointer: false, width: 1366 })).toBe(false);
    expect(isDesktopCapable({ anyFinePointer: true, width: 500 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ui/device.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/ui/device.ts`**

```ts
/** Narrower than this and the camcorder OSD and controls don't fit. */
const MIN_WIDTH = 700;

/** Keyboard-and-mouse game: needs some fine pointer (mouse/trackpad) and a desktop-sized window. */
export function isDesktopCapable(env: { anyFinePointer: boolean; width: number }): boolean {
  return env.anyFinePointer && env.width >= MIN_WIDTH;
}
```

- [ ] **Step 4: Split the entry point**

Run: `git mv src/main.ts src/app.ts`

In `src/app.ts` delete the `import './style.css';` line.

Create `src/main.ts`:

```ts
import './style.css';
import { isDesktopCapable } from './ui/device';

const desktop = isDesktopCapable({
  anyFinePointer: window.matchMedia('(any-pointer: fine)').matches,
  width: window.innerWidth,
});

if (desktop) {
  // The whole game (Three.js and all) loads only on devices that can play it.
  void import('./app');
} else {
  document.getElementById('overlay')?.setAttribute('hidden', '');
  document.getElementById('desktop-only')?.removeAttribute('hidden');
}
```

In `index.html`, after the `#overlay` block add:

```html
    <div id="desktop-only" class="screen" hidden>
      <p class="brand">LEVEL 0</p>
      <img src="/trailer.gif" alt="Camcorder footage walking through endless yellow rooms" width="640" height="360" />
      <p class="title">PLAY ON DESKTOP</p>
      <p class="hint">This tape needs a keyboard and mouse. Open this link on a computer.</p>
    </div>
```

Append to `src/style.css`:

```css
#desktop-only {
  position: fixed;
  inset: 0;
  justify-content: center;
  background: #000;
  color: #f4f4ec;
  font-family: 'VT323', 'Courier New', monospace;
}

#desktop-only[hidden] {
  display: none;
}

#desktop-only img {
  max-width: 100%;
  height: auto;
}
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm test && npm run build` — expected: success; the build now emits a separate chunk for the game (the main entry is small).

Browser: desktop loads the game as before. With the viewport at 390×844 (or `matchMedia` emulating no fine pointer), the page shows the trailer, `PLAY ON DESKTOP` and the hint, and no WebGL canvas is created.

```bash
git add src/main.ts src/app.ts src/ui/device.ts tests/ui/device.test.ts index.html src/style.css
git commit -m "feat: play-on-desktop gate; game code loads only on desktop"
```

---

### Task 8: Deploy-ready static build and docs

**Files:**
- Modify: `vite.config.ts`, `README.md`, `CLAUDE.md`
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Relative asset paths in `vite.config.ts`**

Add `base: './',` to the `defineConfig({ … })` object (so the build works under a GitHub Pages sub-path or any static host).

Change the absolute public-asset URLs in `index.html` to relative so they survive a sub-path: `href="/favicon.svg"` → `href="./favicon.svg"` and `src="/trailer.gif"` → `src="./trailer.gif"` (`src="/src/main.ts"` stays; Vite rewrites it). Fonts are already bundled from `src/assets` (Task 5), so CSS needs no change.

- [ ] **Step 2: Create `.github/workflows/pages.yml`** (committed, not triggered: Pages stays disabled until the user enables it)

```yaml
name: Deploy to GitHub Pages

on:
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

(`workflow_dispatch` only: nothing runs until someone triggers it manually.)

- [ ] **Step 3: Update `README.md`**

Under the title add `![Camcorder footage from Level 0](public/trailer.gif)`. Replace the "Early development" note with a short status line (`Level 0 is playable end to end.`). Add sections:

```markdown
## Controls

WASD move · mouse look · Shift sprint · C crouch · E use · N night vision · M mute · Esc pause.
URL flags: `?seed=123` replay a layout · `?debug` fps/minimap · `?god` no sanity loss or catching · `?attract` demo mode.

## Deploy

`npm run build` produces a static site in `dist/` (relative paths, any static host).
- **GitHub Pages:** enable Pages → "GitHub Actions" in the repo settings, then run the *Deploy to GitHub Pages* workflow manually (Actions tab). Note: Pages on a private repo needs a paid GitHub plan.
- **Vercel / Netlify:** import the repo; build command `npm run build`, output directory `dist`.
- `npm run trailer` re-records `public/trailer.gif` (needs Chrome and ffmpeg).
```

- [ ] **Step 4: Update `CLAUDE.md`**

In the Commands block add `npm run trailer   # re-record public/trailer.gif (Chrome + ffmpeg)`. Replace the Milestones list with the same list suffixed ` — done` for 1–5, and a line `Next: Level 1 (Habitable Zone) — see the escape screen teaser.`

- [ ] **Step 5: Verify and commit**

Run: `npm test && npm run build && npx vite preview --port 4173` (background), open `http://localhost:4173/?seed=42`: the production build plays — fonts load, favicon shows, trailer shows on the gate. Stop the preview server.

```bash
git add vite.config.ts .github/workflows/pages.yml README.md CLAUDE.md index.html
git commit -m "chore: deploy-ready static build (relative paths), manual Pages workflow, docs"
```

---

## Milestone 5 done when

- `npm test` and `npm run build` pass; the production preview plays end to end.
- Headphones reveal the hum, steps, echoes, whispers, Smilers and the Howler; M mutes.
- The deferred papercuts are fixed; fps holds the display rate with all entities active.
- `public/trailer.gif` exists and is shown in the README and on the phone gate.
- Nothing has been pushed or deployed; the user decides where to publish.
