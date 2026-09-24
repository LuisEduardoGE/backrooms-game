# Backrooms Game — Level 0 Design Spec

**Date:** 2026-09-24
**Status:** Approved in brainstorming, pending written-spec review

## 1. Intent

- **Purpose:** a portfolio/showcase piece (linkable from GitHub/LinkedIn, impressive within the first 30 seconds) that doubles as a personal project for learning 3D/game development.
- **Audience:** recruiters, developers, and horror fans playing on a desktop browser with keyboard + mouse, ideally with headphones.
- **Success:** a stranger can open the link, click "PLAY TAPE", and within seconds feel they are inside found-footage Backrooms video; a full run (escape or death) takes roughly 5–15 minutes; it holds 60 fps on a mid-range laptop.

## 2. Game summary

The player wakes in **Level 0** of the Backrooms — endless mono-yellow rooms, damp carpet, buzzing fluorescent lights — seen through a **1990s VHS camcorder**. They must follow clues to a **noclip exit** before an escalating threat (the Presence → Smilers → the Howler) or their own collapsing sanity ends the tape.

- **Win:** walk into the glitching noclip wall → fall-through effect → "LEVEL 1" teaser screen.
- **Lose:** caught by an entity, or sanity reaches 0 → hard cut to static, "TAPE ENDS" → Retry (same seed) / New tape (new seed).

## 3. Platform & tech

- **Platform:** desktop browsers only (keyboard + mouse, Pointer Lock). Touch/mobile devices get a "play on desktop" screen with a trailer GIF.
- **Stack:** TypeScript, Vite, Three.js, Three.js `EffectComposer` add-ons (RenderPass → OutputPass → one custom VHS ShaderPass), Web Audio API, Vitest.
- **Style:** realistic VHS — soft fluorescent lighting, fog, VHS post-processing on top. Milestone 1 uses procedurally generated canvas textures (wallpaper, carpet, ceiling tiles); CC0 PBR textures (ambientCG / Poly Haven) may replace them in the polish milestone. All asset sources + licenses recorded in `public/CREDITS.md`.
- **Hosting:** static site (Vercel or GitHub Pages). Validate locally first.

## 4. Architecture

```
src/
  main.ts              bootstrap renderer, scene, game loop
  core/                loop (fixed timestep update, variable render), input, event bus, seeded RNG
  world/
    generator.ts       seeded grid generation (pure TS)
    chunks.ts          chunk streaming of meshes around the player
    meshes.ts          instanced walls / carpet / ceiling / light panels
  player/              controller, collision, noise emitter, camcorder, battery, sanity
  lighting/            fluorescent flicker, blackouts, light pool near player
  threat/              director (escalation), presence, smiler, howler, grid pathfinding (A*)
  audio/               ambience, footsteps, positional entity audio
  fx/                  VHS post-processing chain
  items/               batteries, almond water, notes, exit
  ui/                  HTML/CSS overlays: menus, REC HUD, notes, end screens
```

**Rule:** all decision-making logic — generation, pathfinding, noise/hearing, entity state machines, sanity, battery, director — is pure TypeScript with no Three.js imports, unit-testable under Vitest and deterministic from the run seed. Three.js modules only render state.

**Loop order per fixed update:** input → player (movement, collision, noise) → director → entities → sanity/battery → lighting → audio. Render: scene → VHS composer.

**Seeded randomness:** one seed per run; all gameplay randomness (generation, flicker timing, entity decisions) derives from sub-streams of that seed. Retry reuses the seed.

## 5. World

- **Grid:** finite 200×200 cells (1 cell = 2 m), generated from the seed; feels infinite because only nearby chunks are built. Cell types: `floor`, `wall`, `pillar`, plus a `dark` flag for unpowered areas.
- **Generation steps:**
  1. Recursive partition into rooms of varied shape: small offices, long corridors, large pillared halls.
  2. Connect rooms with doorways (spanning tree), then add extra openings (~20% more connections) to create loops.
  3. Flag ~15% of floor area as dark zones (contiguous regions).
  4. Place start; place exit at straight-line distance ≥140 cells (70% of grid width) from start, and reachable by path. If unreachable, re-roll with a derived seed.
  5. Place clues: wall arrows along the true shortest path (every ~15–25 cells), a few decoy arrows, 5–8 notes, batteries and Almond Water (weighted toward dark-zone edges).
- **Rendering:** 16×16-cell chunks, loaded within radius 3 chunks, unloaded beyond; instanced meshes per chunk. Emissive ceiling panels everywhere; only 4–6 real point/rect lights pooled around the player. Exponential fog hides the load boundary.
- **Collision:** player is a circle vs. grid walls/pillars (axis-separated resolution). No physics engine.

## 6. Player systems

| Control | Action |
|---|---|
| WASD + mouse | move / look |
| Shift | sprint (fast, loud) |
| C | crouch (slow, silent) — not Ctrl: Ctrl+W would close the browser tab while walking |
| N | toggle night vision |
| E | interact (pick up, read note, drink) |
| Esc | pause |

- **Noise:** each step emits a noise event with radius by gait: crouch 0, walk 1 (≈6 cells), sprint 3 (≈18 cells).
- **Camcorder battery:** starts 100%. Passive drain ~0.3%/s while recording; night vision adds ~1.5%/s. Battery pickup +35% (capped at 100). At 0%: night vision unavailable, image darker/noisier.
- **Sanity (0–100, never shown as a number):** drains in dark zones, near entities, and on sighting a Smiler; regenerates slowly in lit areas; Almond Water +40. Drives VHS distortion intensity, whispers, and phantom footsteps. At 0 → tape ends.

## 7. Threats

**Director** tracks elapsed run time and accumulated player noise to escalate:

| Phase | Trigger | Behaviour |
|---|---|---|
| Presence | from start | Mirrored footsteps, lights die near the player, camcorder glitches, mild sanity drain. Cannot catch the player. |
| Smilers | ≥3 min | Spawn only inside dark zones and never leave them. On hearing noise in range, pathfind to the noise location. Rendered as glowing eyes + grin; clearly visible in night vision. Contact = tape ends. |
| Howler | ≥8 min, or earlier if accumulated noise exceeds a threshold | Exactly one. Warning howl on spawn. Roams the whole map, investigates heard noise, chases on line-of-sight at sprint speed, loses the player after ~4 s without LOS, then searches last-known position. Contact = tape ends. Uses a free rigged model (Mixamo/Sketchfab CC0/CC-BY) with walk/run animations. |

**Entity state machine (pure TS):** `idle/roam → hear(noise) → investigate → see(player) → chase → lostSight(timeout) → search → roam`. Smilers use a subset constrained to dark cells. Pathfinding: A* on the grid, recomputed at a throttled rate.

## 8. VHS effects & UI

- **Post-processing chain:** barrel distortion → chroma bleed → tracking lines/jitter → film grain → night-vision green tint (when active) → sanity distortion (warp, chromatic aberration, frame drops) → vignette. All parameters are uniforms driven by `sanity`, `battery`, `glitch`, `nightVision`.
- **HUD (HTML/CSS overlay):** blinking `● REC`, timestamp starting at a random 1996 date/time, battery icon, `NIGHT VISION` label.
- **Screens:** title ("PLAY TAPE"), pause, note reader (scanned paper), TAPE ENDS (static + Retry / New tape), escape (fall-through + "LEVEL 1" teaser), play-on-desktop (touch devices).
- **Debug mode (`?debug`):** fps counter, seed input, top-down minimap, god mode.

## 9. Testing

- **Vitest (pure logic):** same seed ⇒ identical grid; exit always reachable and ≥ required distance; clue arrows lie on the true path; A* correctness; noise radius/hearing; entity state transitions; sanity and battery drain/regeneration; director phase timing and noise-triggered early Howler.
- **Manual browser checks** at the end of each milestone, using debug mode; performance target 60 fps on a mid-range laptop.

## 10. Milestones

1. **Walkable Backrooms** — Vite + TS + Three.js scaffold, generator + chunk streaming, player controller + collision, lighting, fog, textures.
2. **VHS camcorder** — post-processing chain, REC HUD, night vision + battery, title screen.
3. **Escape loop** — clues, notes, items, exit, sanity, win/lose screens.
4. **Threats** — director, Presence, Smilers, Howler.
5. **Polish & ship** — audio pass, play-on-desktop screen, performance pass, static deploy, README trailer GIF.

Each milestone ends in a playable build.

## 11. Out of scope (for now)

Mobile/touch controls, gamepad support, save/checkpoints, multiplayer, levels beyond the Level 1 teaser screen.
