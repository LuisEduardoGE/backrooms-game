# Backrooms Game — CLAUDE.md

## Vision

A first-person, atmospheric horror/exploration game set in **the Backrooms**, starting with
**Level 1 — "Habitable Zone"**: an endless, dimly lit concrete warehouse with exposed
rebar, flickering fluorescent lights, low-hanging fog, puddles on the floor, and scattered
supply crates. It's "safer" than Level 0, but the lights sometimes cut out — and that's
when things move in the dark.

The goal of the first milestone is a **playable vertical slice of Level 1**: walk around,
feel the dread, find supplies, survive a blackout, and find the exit to the next level.

## Level 1 — design pillars

- **Liminal atmosphere first.** Sound, lighting and fog carry the experience more than gameplay mechanics. Buzzing fluorescents, distant machinery hum, dripping water, echoing footsteps.
- **Endless-feeling space.** Procedurally generated chunks of concrete pillars, corridors, open halls and stairwells that stream in around the player. It should feel infinite and disorienting — no two walks identical.
- **Light as a resource.** Flickering lights and periodic blackouts. During a blackout the player relies on a flashlight with limited battery.
- **Supplies.** Crates contain Almond Water (restores sanity), batteries (flashlight), and occasional notes/lore.
- **Sanity, not health bars.** Staying in darkness or near entities drains sanity; low sanity distorts audio/visuals (vignette, chromatic aberration, whispers).
- **Entities are rare and heard before seen.** Keep them mostly off-screen; tension > jump scares.
- **Exit.** Finding a specific door/stairwell (rare spawn) completes the level — the hook for Level 2 later.

## Tech stack (default — change here if we decide otherwise)

- **TypeScript + Vite** — fast dev loop, runs in any browser.
- **Three.js** — 3D rendering (first-person camera, `PointerLockControls`, fog, instanced meshes for pillars/lights).
- **Web Audio API** (or Howler.js) — positional/ambient audio.
- Plain TS game loop + small ECS-style modules; no heavy engine.
- **Vitest** for unit tests of pure logic (chunk generation, sanity system, inventory).

## Project structure (target)

```
src/
  main.ts            # bootstrap: renderer, scene, loop
  core/              # game loop, input, time, events
  world/             # procedural chunk generation + streaming for Level 1
  player/            # controller, flashlight, inventory, sanity
  lighting/          # fluorescent flicker + blackout director
  audio/             # ambience, footsteps, positional sfx
  entities/          # entity AI (later)
  ui/                # HUD, menus, notes overlay
public/
  textures/ models/ audio/
tests/
```

## Commands

(Fill in once the project is scaffolded.)

```
npm install
npm run dev       # local dev server
npm run build     # production build
npm test          # vitest
```

## Conventions

- Keep world generation **deterministic from a seed** so bugs are reproducible.
- Pure logic (generation, sanity, inventory) lives outside Three.js code so it can be unit-tested.
- Performance budget: 60 fps on a mid-range laptop — use instancing, chunk culling, and a small number of real lights (fake the rest with emissive materials).
- Assets must be self-made, CC0, or properly licensed — record source + license in `public/CREDITS.md`.
- Validate locally in the browser before deploying anywhere.

## Skills

- `find-skills` is installed globally (`~/.claude/skills/find-skills`). Use it to discover
  helpful skills (e.g. Three.js, game dev, audio) before building a subsystem from scratch.
- Use `superpowers:brainstorming` before designing new features, and
  `superpowers:writing-plans` before multi-step implementation.

## Roadmap

1. Scaffold Vite + TS + Three.js; first-person movement in a single hand-built room.
2. Procedural chunk generation + streaming for Level 1.
3. Lighting: flickering fluorescents, fog, blackout director, flashlight + battery.
4. Audio ambience + footsteps.
5. Supplies/crates, inventory, Almond Water, sanity system + effects.
6. Exit condition + main menu / death / win screens.
7. (Later) Entities, Level 0 prologue, Level 2.
