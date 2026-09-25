# Backrooms Game — CLAUDE.md

## Vision

A first-person found-footage horror game in the browser, set in **Level 0 of the Backrooms**:
endless mono-yellow rooms, damp carpet, buzzing fluorescent lights — all seen through a
1990s **VHS camcorder**. Follow clues to a noclip exit before an escalating threat
(the Presence → Smilers → the Howler) or your own collapsing sanity ends the tape.

Purpose: a **portfolio showcase** (impressive within 30 seconds of opening the link) and a
**learning project** for 3D/game dev. Desktop browser only (keyboard + mouse).

**Full design spec:** `docs/superpowers/specs/2026-09-24-level-0-design.md` — the source of truth.
Update the spec when a design decision changes.

## Tech stack

- **TypeScript + Vite + Three.js** (plain, no React for the game)
- Three.js **`EffectComposer`** add-ons + one custom VHS `ShaderPass` (no extra dependency)
- **Web Audio API** for ambience and positional audio
- **Vitest** for pure-logic unit tests
- HTML/CSS overlays for HUD and menus

## Architecture rules

- **Pure logic is Three.js-free.** Generation, pathfinding, noise/hearing, entity state
  machines, sanity, battery and the threat director live in plain TS modules and are unit-tested.
  Three.js code only renders state.
- **Everything is deterministic from the run seed** (seeded RNG sub-streams). Retry = same seed.
- World is a finite 200×200 grid (1 cell = 2 m) streamed in 16×16-cell chunks; instanced meshes;
  baked light + contact shadows in vertex colours (no point lights); HDR troffers flicker per instance;
  GTAO + bloom + AgX under a subtle VHS pass; fog hides the load edge. Textures: ambientCG CC0 scans.
- Collision is circle-vs-grid, no physics engine. Entities use A* on the grid.
- Performance budget: **60 fps on a mid-range laptop.**

## Project structure

```
src/
  main.ts      core/    world/    player/    lighting/
  threat/      audio/   fx/       items/     ui/
public/        textures/ models/ audio/ CREDITS.md
tests/
docs/superpowers/specs/   design specs
docs/superpowers/plans/   implementation plans
```

## Commands

```
npm install
npm run dev       # http://localhost:5173 — add ?debug for fps/seed/minimap, ?seed=123 to replay a layout
npm test          # vitest (pure logic only)
npm run build     # tsc type-check + vite production build to dist/
npm run trailer   # re-record public/trailer.gif from ?attract footage (Chrome + ffmpeg)
```

## Conventions

- Assets must be self-made or CC0/properly licensed; record source + license in `public/CREDITS.md`.
- Validate locally in the browser before deploying anywhere.
- Each milestone must end in a playable build.

## Skills

- `find-skills` is installed globally (`~/.claude/skills/find-skills`) — use it to look for
  helpful skills (Three.js, shaders, game dev, audio) before building a subsystem from scratch.
- `superpowers:brainstorming` before new features; `superpowers:writing-plans` before multi-step work.

## Milestones

1. Walkable Backrooms — scaffold, generator + chunks, controller + collision, lighting/fog/textures — done
2. VHS camcorder — post-processing, REC HUD, night vision + battery, title screen — done
3. Escape loop — clues, notes, items, exit, sanity, win/lose screens — done
4. Threats — director, Presence, Smilers, Howler — done
5. Polish & ship — audio, play-on-desktop screen, performance, deploy-ready build, trailer GIF — done

Next: Level 1 (Habitable Zone) — see the escape screen teaser. Each milestone has a plan in `docs/superpowers/plans/`.
