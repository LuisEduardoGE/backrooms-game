# Known Issues

Evidence-backed only (command output, `file:line`) — not suspicions. **Delete entries once
fixed**; the fix lives in git history.

## KI-001 — Renderer asks for `PCFSoftShadowMap`, which three r186 removed
**Evidence:** `src/app.ts:81` sets `renderer.shadowMap.type = THREE.PCFSoftShadowMap`;
`node_modules/three/build/three.module.js:9150-9152` warns "PCFSoftShadowMap has been removed.
Using PCFShadowMap instead." (three 0.186.1).
**Impact:** shadows are plain PCF, not soft, and a console warning fires; code reads as if they were soft.
**Workaround / fix idea:** set `PCFShadowMap` (or VSM) explicitly and tune the look.

## KI-002 — Single 869 kB app chunk
**Evidence:** `npm run build` (2026-11-23): `dist/assets/app-*.js 869.01 kB │ gzip: 259.55 kB`
plus Vite's "Some chunks are larger than 500 kB" warning.
**Impact:** slower first load of the game for a portfolio piece meant to impress in 30 s.
**Workaround / fix idea:** split three addons / post-processing into separate chunks.

## KI-003 — `CLAUDE.md` and the spec describe a module layout that no longer exists
**Evidence:** `CLAUDE.md` "Project structure" lists `src/threat/`, `src/items/` and
`public/textures/`, `public/audio/`; none exist — threats/items logic is in `src/game/` and
`src/world/items.ts`, textures in `src/assets/textures/`, audio is synthesized
(`src/audio/engine.ts:3`). `CLAUDE.md` also says "no scene point lights" and "Textures: ambientCG
CC0 scans", but `src/lighting/shadowLights.ts:25` adds real-time SpotLights and
`public/CREDITS.md` lists OpenGameArt and Yasu (CC BY 4.0) textures. Spec §7 says the Howler
uses a Mixamo/Sketchfab model; `src/world/entityViews.ts:50` builds it procedurally.
**Impact:** misleads anyone navigating by the docs.
**Workaround / fix idea:** NS-001 / NS-004.
