# Current State

Last updated: 2026-11-23 — Level 0 complete and merged on local `main`; not pushed, not deployed.

A **snapshot, not a changelog** — rewrite lines that changed; history goes in `sessions/`.
Never hand-write HEAD, ahead/behind or test-file counts (`.claude/hooks/context_facts.py`).
Keep under ~200 lines.

## Working (local `main`)

- **Milestones 1–5 done** (spec §10): walkable seeded map with chunk streaming; VHS camcorder
  (post chain, REC HUD, night vision + battery, title screen); escape loop (clues, decoys, notes,
  batteries, Almond Water, noclip exit, sanity, win/lose screens with Retry / New tape); threats
  (director, Presence, Smilers, Howler); polish (synth audio, desktop gate, perf, deploy-ready
  build, trailer GIF).
- **Feel pass** — momentum, raw mouse, adjustable sensitivity.
- **Visual passes** (all merged): scanned textures (ambientCG, OpenGameArt wallpaper, Yasu
  carpet/ceiling); per-pixel panel-lattice lighting; sparse/irregular lights that really go
  off; real-time soft shadows from the 4 nearest panels; room structures (partitions, blocks,
  colonnades); ceiling damage, vents, damp patches; furnished rooms (14 Poly Haven props);
  segmented walls with doorway headers and arched doorways; outlets at one height ≥1.5 m apart;
  wet-carpet footsteps; Howler stoops under headers.
- `public/trailer.gif` re-recorded after the latest visual changes.
- Every feature branch is merged into `main` (`git branch --no-merged main` is empty).

## In progress / merged but not deployed

- **Not pushed:** `origin/main` (GitHub `LuisEduardoGE/backrooms-game`) still sits at the
  Milestone 1 plan commit (2026-09-24); everything since lives only on local `main`. Confirms
  the prior note.
- No work in progress; last commit 2026-09-27.

## Production

Not deployed (no deploy recorded; the Pages workflow is manual and has never been triggered
against pushed code, since the code is not pushed). Unverified whether Pages is enabled on the repo.

Never verified by a human (per prior notes, unverified): how the synthesized audio sounds,
Firefox, pointer-lock play feel, real fps on a mid-range laptop.

## Tests

| Suite | Command | Result | Date |
|---|---|---|---|
| Vitest (pure logic) | `npm test` | ✅ all passed | 2026-11-23 |
| Type-check + build | `npm run build` | ✅ built; warning: main chunk > 500 kB (KI-002) | 2026-11-23 |
