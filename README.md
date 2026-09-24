# Backrooms Game

![Camcorder footage from Level 0](public/trailer.gif)

A first-person atmospheric horror game set in **Level 0** of the Backrooms, seen through a 90s VHS camcorder. Runs in the browser (desktop, keyboard and mouse).

**Goal:** follow the painted arrows (not all of them tell the truth) to the wall that doesn't sit right, and walk into it. Batteries keep the camcorder's night vision alive; Almond Water steadies your nerves; the dark wears you down. If the tape ends, retry the same tape or start a new one.

**Something else is here.** At first it only moves the lights. After a few minutes, grinning things wait in the dark rooms and come for noise — crouch to stay quiet. Linger (or keep sprinting) and something tall starts looking for you. Break its line of sight and it may lose you.

Level 0 is playable end to end. See [CLAUDE.md](CLAUDE.md) for the architecture and conventions, and [the design spec](docs/superpowers/specs/2026-09-24-level-0-design.md) for the full design.

## Run locally

```
npm install
npm run dev
```

Open http://localhost:5173 and click **▶ PLAY TAPE**. Headphones recommended.

## Controls

WASD move · mouse look · Shift sprint · C crouch · E use · N night vision · M mute · Esc pause.

URL flags: `?seed=123` replay a layout · `?debug` fps/minimap · `?god` no sanity loss or catching · `?attract` demo mode.

## Deploy

`npm run build` produces a static site in `dist/` with relative paths, so it works on any static host or sub-path.

- **GitHub Pages:** in the repo settings enable Pages with source "GitHub Actions", then run the *Deploy to GitHub Pages* workflow manually from the Actions tab. Pages on a private repository needs a paid GitHub plan.
- **Vercel / Netlify:** import the repo; build command `npm run build`, output directory `dist`.
- `npm run trailer` re-records `public/trailer.gif` from `?attract` footage (needs Chrome and ffmpeg).
