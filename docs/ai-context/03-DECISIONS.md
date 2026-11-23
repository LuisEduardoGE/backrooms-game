# Decisions

Append-only. To change a decision, add a new entry and mark the old one
`Superseded by DEC-nnn` — never edit an accepted entry in place. Only decisions that
constrain future work belong here.

## DEC-001 — Pure logic is Three.js-free and seed-deterministic (2026-09-24)
**Context:** the game must be testable without a GPU and replayable.
**Decision:** generation, pathfinding, hearing, entity state machines, sanity, battery and the
director are plain TS under unit test; all randomness comes from sub-streams of the run seed;
Retry reuses the seed. Source: design spec §4, `CLAUDE.md`.
**Consequences:** never use `Math.random()` for gameplay; new systems need a pure core + tests.

## DEC-002 — No physics engine; circle-vs-grid collision and grid A* (2026-09-24)
**Context:** keep the bundle and complexity small.
**Decision:** player collision is circle-vs-grid; entities path with A* on the grid. Source:
`CLAUDE.md`, spec.
**Consequences:** furniture/props that block movement must be expressed on the grid (`solids`).

## DEC-003 — Desktop browser only (2026-09-24)
**Context:** pointer lock + keyboard controls.
**Decision:** touch/small screens get a "play on desktop" screen; the game bundle is not loaded
there (`src/main.ts`). Source: spec, milestone 5.
**Consequences:** no mobile controls work.

## DEC-004 — Look reference is a "mix" of the 2002 photo and Kane Pixels (2026-09-25)
**Context:** choosing a visual target for Level 0.
**Decision:** wallpaper, colours and bare walls from the original 2002 photo (7.5 cm
chevron/chain bands + dot paper, no white skirting, low brown rail, outlets); dense square 2×2 ft
panels and dark-olive unlit areas from Kane Pixels. Source: `CLAUDE.md`, commit
"Level 0 matched to the references".
**Consequences:** visual changes are checked against these references (and screenshots) first.

## DEC-005 — Assets must be self-made or CC0/properly licensed, credited (2026-09-24)
**Context:** public portfolio piece.
**Decision:** record every third-party asset's source + licence in `public/CREDITS.md`.
Source: `CLAUDE.md` conventions.
**Consequences:** CC BY assets (Yasu's pack) require the credit to ship with the build.

## DEC-006 — Each milestone ends in a playable build; validate locally before deploying (2026-09-24)
**Context:** milestone-driven development.
**Decision:** as stated in `CLAUDE.md` conventions; the Pages workflow is manual-only.
**Consequences:** nothing deploys automatically on push.
