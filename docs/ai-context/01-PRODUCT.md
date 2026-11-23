# Product

## Purpose

A first-person atmospheric horror game in the browser, set in **Level 0 of the Backrooms**
and seen through a 1990s VHS camcorder. The player follows painted arrows (some are decoys) to
a "noclip" wall and walks into it to escape, while an escalating threat and their own sanity
try to end the tape. Goals (per `CLAUDE.md`): a **portfolio showcase** that impresses within
30 seconds, and a **learning project** for 3D/game dev.

## Users

Desktop browser players with keyboard + mouse. Touch/small screens get a "play on desktop"
gate with the trailer GIF instead of the game (`src/main.ts`, `src/ui/device.ts`); the game
bundle is only loaded on devices that can play.

## Game rules (enforced in code)

| Rule | Where |
|---|---|
| Map: finite 200×200 grid, 1 cell = 2 m, walls 2.7 m high | `src/world/generator.ts:50-51`, `src/world/grid.ts:2-3` |
| Exit at ≥ 70% of map width (straight line) from the start | `src/world/generator.ts:59`, `:400-407` |
| Exit triggers within 0.45 m of the noclip wall face | `src/world/exit.ts:5` |
| Clue arrows every 15–25 cells along the true path; 4 decoys | `src/world/clues.ts:17-19` |
| Everything derives from the run seed (mulberry32 + labelled sub-seeds); Retry reuses the seed, New tape drops it | `src/core/rng.ts:1`, `:41`; `src/app.ts:417-419` |
| Battery 100, passive drain 0.3/s, night vision +1.5/s, pickup +35, low at 15 | `src/player/camcorder.ts:1-11` |
| Sanity 100; dark drain 1.0/s (halved with night vision), light regen 0.4/s, Almond Water +40, near-entity (8 cells) drain 0.8, Smiler sighting 2; distortion from 60 | `src/game/sanity.ts:1-15` |
| Noise radius by gait: crouch 0, walk 6, sprint 18 cells | `src/game/noise.ts:4` |
| Threat phases: Presence from start, Smilers at 180 s, Howler at 480 s or earlier once accumulated noise passes 2500 | `src/game/director.ts:4-7` |
| Max 5 Smilers; contact within 0.7 m ends the tape | `src/game/spawns.ts:5`, `src/game/entity.ts:31` |
| Phases: title → playing ⇄ paused/reading → ended or escaped (terminal) | `src/core/gameState.ts:1-20` |
| URL flags: `?seed=N` (≤ 0xffffffff), `?debug`, `?god`, `?attract` | `src/ui/params.ts` |

Controls: WASD, mouse, Shift sprint, C crouch (not Ctrl — Ctrl+W closes the tab), E use,
N night vision, M mute, Esc pause.
