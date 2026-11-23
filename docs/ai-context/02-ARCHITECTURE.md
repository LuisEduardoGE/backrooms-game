# Architecture

Last updated: 2026-11-23

## Stack

- **TypeScript 7** (`tsc --noEmit` as type-check) + **Vite 8** + **Three.js 0.186** (plain, no
  React). Only runtime dependency: `three`.
- Post-processing from `three/addons` (`src/fx/composer.ts`): scene → GTAO (half-res) →
  UnrealBloom → OutputPass (AgX) → custom VHS `ShaderPass` (`src/fx/vhsShader.ts`) → SMAA.
- **Web Audio API** — every sound is synthesized; no audio files (`src/audio/engine.ts:3`).
- **Vitest 4** (`environment: node`, `tests/**/*.test.ts`, `vite.config.ts`).
- `puppeteer-core` + ffmpeg for the trailer recorder (`scripts/record-trailer.mjs`).
- `vite.config.ts` sets `base: './'` so `dist/` works on any static host or sub-path.

## Components (`src/`)

| Dir | Contents |
|---|---|
| `main.ts` | Device gate; dynamically imports `app.ts` only on desktop-capable devices |
| `app.ts` | Renderer, scene, composer, game loop wiring, screens (≈600 lines) |
| `core/` | fixed-timestep loop (1/60 s, ≤5 steps/frame), input, seeded RNG, game phase machine, mouse sensitivity |
| `world/` | `generator.ts` (pure grid gen), `chunks.ts`/`streamer.ts` (16×16-cell chunks, load radius 3), `chunkMesh.ts`, `solids.ts` (walls 0.35 m, 1.3 m arches), `headers.ts`, `wallFaces.ts`, `dressing.ts`, `furnishing.ts`, `props.ts`/`propModels.ts` (Poly Haven glTF), `clues.ts`, `items.ts`, `exit.ts`, `textures.ts`, `normalMap.ts`, `entityViews.ts` (procedural Howler/Smiler rigs) |
| `lighting/` | `bake.ts` (baked light + contact shadows into vertex colours), `panelLights.ts`/`panelMap.ts` (per-pixel panel lattice, flicker/dead tubes), `shadowLights.ts`/`shadowSlots.ts` (real-time shadow SpotLights on the nearest panels) |
| `game/` | Pure logic: `director.ts`, `entity.ts` (state machine), `astar.ts`, `los.ts`, `noise.ts`, `sanity.ts`, `spawns.ts`, `interact.ts`, `notes.ts`, `autopilot.ts` (`?attract` demo walk) |
| `player/` | `controller.ts` (momentum, crouch), `collision.ts` (circle-vs-grid, radius 0.3 m), `camcorder.ts` (battery, night vision) |
| `audio/` | `engine.ts` (synth), `listener.ts`, `mix.ts` |
| `fx/` | `composer.ts`, `vhsShader.ts`, `glitch.ts`, `scanlines.ts` |
| `ui/` | HUD/OSD, note reader, debug HUD, device gate, URL params |

Assets: `src/assets/textures/` (ambientCG, OpenGameArt Backrooms wallpaper, Yasu carpet/ceiling),
`src/assets/fonts/`, `public/models/` (14 Poly Haven props), `public/fonts/`, `public/trailer.gif`.

**Hard rule:** decision logic (generation, pathfinding, hearing, entity FSMs, sanity, battery,
director) is Three.js-free and unit-tested; Three.js only renders state.

## Data flows

Per fixed update: input → player (move, collide, emit noise) → director → entities → sanity /
battery → lighting → audio. Render: scene → composer. Chunks around the player are
built/streamed from the generated grid; shadow maps update every other frame
(`src/app.ts:559`). No backend, no persistence beyond the URL seed.

## Run, test, deploy

```bash
npm install
npm run dev          # http://localhost:5173  (?debug, ?seed=123, ?god, ?attract)
npm test             # vitest run (pure logic)
npm run build        # tsc --noEmit && vite build → dist/
npm run trailer      # build + record public/trailer.gif (needs Chrome via CHROME_PATH or default path, and ffmpeg)
```

Deploy: `.github/workflows/pages.yml` — **manual only** (`workflow_dispatch`): npm ci → test →
build → GitHub Pages. Pages on a private repo needs a paid plan; Vercel/Netlify with
`npm run build` / `dist` also work (README).
