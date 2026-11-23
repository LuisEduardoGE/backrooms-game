# Backrooms: Level 0

**Found-footage horror in the browser.** A procedural Level 0 of the Backrooms, seen through a 90s VHS camcorder.

[![Play in browser](https://img.shields.io/badge/%E2%96%B6%20play-in%20browser-e3b341?style=flat-square)](https://luiseduardoge.github.io/backrooms-game/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
![three.js](https://img.shields.io/badge/three.js-r186-black?style=flat-square&logo=three.js)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)

![Camcorder footage from Level 0](public/trailer.gif)

**[Play it now →](https://luiseduardoge.github.io/backrooms-game/)** (desktop, keyboard and mouse; headphones recommended)

## The game

Follow the painted arrows (not all of them tell the truth) to the wall that doesn't sit right, and walk into it. Batteries keep the camcorder's night vision alive; Almond Water steadies your nerves; the dark wears you down. If the tape ends, retry the same tape or start a new one.

**Something else is here.** At first it only moves the lights. After a few minutes, grinning things wait in the dark rooms and come for noise: crouch to stay quiet. Linger (or keep sprinting) and something tall starts looking for you. Break its line of sight and it may lose you.

## Highlights

- **Procedural levels**: every tape is a new seeded layout of rooms, corridors and furniture; `?seed=123` replays one.
- **VHS camcorder look**: post-processing for tape noise, chroma bleed, night vision and an on-screen display.
- **Reference-matched materials**: scanned CC0 / CC BY wallpaper, carpet and ceiling textures, real-time shadows.
- **Escalating threats** driven by noise, line of sight and time spent in the level.
- **Fully static**: builds to plain files with relative paths, so it runs on any static host.

## Controls

| Key | Action |
|---|---|
| WASD / mouse | move / look |
| Shift · C | sprint · crouch |
| E | use |
| N | night vision |
| M · Esc | mute · pause |

URL flags: `?seed=123` replay a layout · `?debug` fps and minimap · `?god` no sanity loss or catching · `?attract` demo mode.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173, then click "PLAY TAPE"
npm test         # vitest suite
npm run build    # static site in dist/
```

## Deploy

`npm run build` produces a static site in `dist/` with relative paths, so it works on any static host or sub-path.

- **GitHub Pages**: enable Pages with source "GitHub Actions", then run the *Deploy to GitHub Pages* workflow from the Actions tab.
- **Vercel / Netlify**: build command `npm run build`, output directory `dist`.
- `npm run trailer` re-records `public/trailer.gif` from `?attract` footage (needs Chrome and ffmpeg).

## License

Code is [MIT](LICENSE). Third-party textures, models and fonts keep their own licenses (CC0, CC BY 4.0, SIL OFL); see [public/CREDITS.md](public/CREDITS.md).
