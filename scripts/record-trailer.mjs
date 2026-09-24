// Records ?attract footage from the production build into public/trailer.gif (dev tool; needs Chrome + ffmpeg).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ].find((p) => existsSync(p));
if (!CHROME) throw new Error('Chrome not found — set CHROME_PATH');

const FRAMES = 'scripts/.frames';
const PORT = 4173;

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
// Run Vite's CLI with node directly (no shell) so server.kill() really stops it on every OS.
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });
await page.goto(`http://localhost:${PORT}/?attract&seed=42`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1500));
for (let i = 0; i < 70; i++) {
  await page.screenshot({ path: `${FRAMES}/f${String(i).padStart(3, '0')}.png` });
  await new Promise((r) => setTimeout(r, 100));
}
await browser.close();
server.kill();

execFileSync(
  'ffmpeg',
  [
    '-y',
    '-framerate',
    '10',
    '-i',
    `${FRAMES}/f%03d.png`,
    '-vf',
    // Denoise first: per-frame VHS grain defeats GIF compression.
    'hqdn3d=6:4:8:6,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    'public/trailer.gif',
  ],
  { stdio: 'inherit' },
);
rmSync(FRAMES, { recursive: true, force: true });
console.log('wrote public/trailer.gif');
