# Visual Overhaul Implementation Plan

> Executed inline (superpowers:executing-plans) with TDD for pure logic and browser screenshots for rendering.

**Goal:** Make Level 0 look like the references the user chose — image 2's detail (chevron wallpaper, square columns, white baseboards, bright ceiling around panels) with the muted, low-contrast photographic mood of the found-footage photos — under a subtle VHS filter, with soft lighting instead of sharp point-light pools.

**Decisions (user-approved 2026-09-25):** target = "image 2 detail + photo mood"; VHS = subtle; CC0 photo-scanned PBR materials from ambientCG; soft light via baked light + baked contact shadows + GTAO + filmic tone mapping + gentle bloom; point-light pool removed; walls 35 cm with baseboards; 1 m square columns; bigger rooms.

## Tasks

1. **Assets.** Download ambientCG CC0 2K-JPG sets Carpet016, OfficeCeiling001, Wallpaper001C, Wallpaper002B; keep Color (2K, q85) and NormalGL/Roughness (1K) under `src/assets/textures/<id>/`; credit them in `public/CREDITS.md`.
2. **Pure light sampling.** `lightAt(grid, light, wx, wz)` bilinear interpolation of the baked cell light at world points; `contactShadow(grid, wx, wz)` darkening within 0.8 m of walls/columns (baked AO). Tests: continuity across cells, darker in corners than mid-room, 1.0 far from walls.
3. **Geometry constants and layout.** `WALL_THICKNESS` 0.35, `PILLAR_SIZE` 1.0; generator: bigger leaves, more columns at 4-cell spacing. Tests updated to use the constants; all existing guarantees stay green.
4. **Pure wall-face builder.** `wallQuads(grid, cx, cy)` → exposed vertical faces of each chunk's solids with world-space UVs (u = metres along the wall, v = metres up), skipping faces buried against another solid; plus baseboard strips per face. Tests: a straight wall yields two long faces with continuous u; no face inside a neighbouring slab; columns get 4 faces.
5. **Materials.** Chevron/damask wallpaper drawn at 2K and multiplied over Wallpaper001C colour, with its normal/roughness; stained variant with Wallpaper002B; tinted Carpet016 with damp stains; OfficeCeiling001 tiles on a 0.6 m world grid; off-white baseboard; troffer panel emissive.
6. **Chunk meshes.** Merged per-chunk wall geometry (vertex light × contact shadow, darker at the wall base), baseboards, subdivided floor and ceiling (1 m vertex spacing; ceiling brightened around lit panels), recessed 2×4 ft troffers as instanced quads with per-instance colour (so flicker/blackouts dim individual panels), columns with wallpaper and baseboards.
7. **Post-processing and mood.** AgX tone mapping; GTAO (half-res) and UnrealBloom (half-res, high threshold) before OutputPass; VHS pass made subtle (less barrel/tracking/bleed/grain) plus grading (slight desaturation, warm lift, low contrast). Remove the point-light pool; flicker and Presence blackouts drive panel instance colours near the player and a brief exposure dip.
8. **Verify and ship.** fps check with `?debug`, re-record the trailer, docs, fresh final review, merge.
