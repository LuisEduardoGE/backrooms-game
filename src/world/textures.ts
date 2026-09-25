import * as THREE from 'three';
import type { Rng } from '../core/rng';
import carpetColor from '../assets/textures/Carpet016/Color.jpg';
import carpetNormal from '../assets/textures/Carpet016/NormalGL.jpg';
import carpetRough from '../assets/textures/Carpet016/Roughness.jpg';
import ceilingColor from '../assets/textures/OfficeCeiling001/Color.jpg';
import ceilingNormal from '../assets/textures/OfficeCeiling001/NormalGL.jpg';
import paperColor from '../assets/textures/Wallpaper001C/Color.jpg';
import paperRough from '../assets/textures/Wallpaper001C/Roughness.jpg';
import stainedColor from '../assets/textures/Wallpaper002B/Color.jpg';
import backroomsColor from '../assets/textures/BackroomsWallpaperOGA/Color.jpg';
import backroomsNormal from '../assets/textures/BackroomsWallpaperOGA/NormalGL.jpg';
import backroomsRough from '../assets/textures/BackroomsWallpaperOGA/Roughness.jpg';
import type { PanelMap } from '../lighting/panelMap';
import { withPanelLights } from '../lighting/panelLights';
import { heightToNormal } from './normalMap';

/**
 * World-space sizes (metres covered by one texture repeat). Every surface's UVs are in metres,
 * so these are the only knobs for pattern scale.
 */
export const TEXTURE_METRES = {
  /** One wallpaper sheet: 0.6 m — the scan's eight chevron columns at the photo's 7.5 cm spacing. */
  wallpaper: 0.6,
  carpet: 2.5,
  /** OfficeCeiling001 has 6×6 tiles per texture → 2/3 m tiles, exactly 3 per 2 m cell. */
  ceiling: 4,
} as const;

/** Ceiling tile edge (metres) — troffers snap to this grid. */
export const CEILING_TILE = TEXTURE_METRES.ceiling / 6;

const COLOR_SIZE = 2048;
/** Per-panel light for the shader-lit surfaces (see withPanelLights). */
const PANEL_INTENSITY = 11;
/**
 * The ceiling's bounce light (virtual sources below it). Kept low: in the references the walls,
 * not the ceiling, are the brightest surfaces, and the ceiling between panels goes dim.
 */
const CEILING_PANEL_INTENSITY = 4;

function finish<T extends THREE.Texture>(tex: T, metres: number, srgb: boolean): T {
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / metres, 1 / metres);
  tex.anisotropy = 8;
  return tex;
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

/** Draws a soft blob, repeated across the edges so the texture tiles seamlessly. */
function wrappedBlob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgba: string, size: number): void {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      const cx = x + ox;
      const cy = y + oy;
      if (cx + r < 0 || cy + r < 0 || cx - r > size || cy - r > size) continue;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, rgba);
      g.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }
}

/** The second paper on some partitions (the photo's left wall): pale yellow with small dots. */
const DOT_PAPER_BASE = '#d6c464';

/** The dot paper: tiny dots on a diagonal grid about 2 cm apart. */
function drawDotPrint(ctx: CanvasRenderingContext2D, unit: number, ink: string): void {
  const n = 30; // 0.6 m / 30 = 2 cm; divides the sheet, so it tiles
  const s = unit / n;
  ctx.fillStyle = ink;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + (j % 2) * 0.5) * s;
      ctx.beginPath();
      ctx.arc(x, (j + 0.5) * s, unit * 0.0042, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * The dot paper: a photo-scanned paper (real fibre and faint streaks) tinted pale yellow, with the
 * small-dot print of the original photo's second wall.
 */
function dotPaper(paper: HTMLImageElement, wash: number): HTMLCanvasElement {
  const S = COLOR_SIZE;
  const [c, ctx] = canvas(S);
  ctx.drawImage(paper, 0, 0, S, S);
  // Wash the photo toward white: keep its fibre and faint streaks, lose the heavy blotches.
  ctx.fillStyle = `rgba(255, 255, 255, ${wash})`;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = DOT_PAPER_BASE;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  drawDotPrint(ctx, S, 'rgba(96, 92, 52, 0.85)');
  return c;
}

/**
 * The chevron paper with water damage: the scanned Backrooms wallpaper multiplied by a
 * photo-scanned stained paper (washed so only the stains come through).
 */
function stainedPaper(wallpaperImg: HTMLImageElement, stains: HTMLImageElement): HTMLCanvasElement {
  const S = COLOR_SIZE;
  const [c, ctx] = canvas(S);
  ctx.drawImage(wallpaperImg, 0, 0, S, S);
  const [m, mc] = canvas(S);
  mc.drawImage(stains, 0, 0, S, S);
  mc.fillStyle = 'rgba(255, 255, 255, 0.35)';
  mc.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(m, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

const EMBOSS_SIZE = 1024;

/**
 * Printed paper, not vinyl: the relief is the paper's own fibre plus the faintest lift where the
 * ink sits — enough for light to catch the surface, never ridges.
 */
function wallpaperNormal(paper: HTMLImageElement): THREE.DataTexture {
  const S = EMBOSS_SIZE;
  const [, ctx] = canvas(S);
  ctx.drawImage(paper, 0, 0, S, S);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, S, S);
  ctx.globalAlpha = 0.18;
  drawDotPrint(ctx, S, '#fff');
  ctx.globalAlpha = 1;
  const img = ctx.getImageData(0, 0, S, S).data;
  const height = new Float32Array(S * S);
  for (let i = 0; i < height.length; i++) height[i] = img[i * 4 + 1] / 255;
  const tex = new THREE.DataTexture(heightToNormal(height, S, 2), S, S, THREE.RGBAFormat);
  // DataTexture rows run bottom-up; the height rows ran top-down.
  tex.flipY = true;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Carpet016 is a clean beige low-pile; Level 0's is flat khaki, the same family as the walls. */
function carpet(photo: HTMLImageElement, rng: Rng): HTMLCanvasElement {
  const S = COLOR_SIZE;
  const [c, ctx] = canvas(S);
  ctx.drawImage(photo, 0, 0, S, S);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#bcab68';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 18; i++) {
    const light = rng.chance(0.5);
    wrappedBlob(ctx, rng.range(0, S), rng.range(0, S), rng.range(200, 600), light ? 'rgba(210, 200, 130, 0.07)' : 'rgba(80, 70, 30, 0.08)', S);
  }
  return c;
}

/** Ceiling tiles aged to the cream-yellow of the photo (never stark white). */
function ceiling(photo: HTMLImageElement): HTMLCanvasElement {
  const S = COLOR_SIZE;
  const [c, ctx] = canvas(S);
  ctx.drawImage(photo, 0, 0, S, S);
  // Soften the tile edges painted into the scan: the grid should barely show.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#e9dc9c';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

/** A square 2×2 ft panel (Kane Pixels' Level 0): bright prismatic diffuser in a thin frame. */
function troffer(): HTMLCanvasElement {
  const W = 256;
  const [c, ctx] = canvas(W);
  ctx.fillStyle = '#c9c2a4';
  ctx.fillRect(0, 0, W, W);
  const f = 8;
  const g = ctx.createRadialGradient(W / 2, W / 2, W * 0.1, W / 2, W / 2, W * 0.7);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#f1ecd8');
  ctx.fillStyle = g;
  ctx.fillRect(f, f, W - f * 2, W - f * 2);
  ctx.fillStyle = 'rgba(200, 190, 160, 0.16)';
  for (let y = f; y < W - f; y += 6) for (let x = f + ((y / 6) % 2) * 3; x < W - f; x += 6) ctx.fillRect(x, y, 2, 2);
  return c;
}

/** A beige duplex outlet plate with two sockets. */
function outletPlate(): HTMLCanvasElement {
  const W = 128;
  const H = 192;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#e4dcc0';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(90, 80, 50, 0.45)';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, W - 4, H - 4);
  for (const cy of [H * 0.3, H * 0.7]) {
    ctx.fillStyle = '#d6cdb0';
    ctx.beginPath();
    ctx.ellipse(W / 2, cy, W * 0.3, H * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2418';
    ctx.fillRect(W * 0.34, cy - H * 0.05, W * 0.06, H * 0.09);
    ctx.fillRect(W * 0.6, cy - H * 0.05, W * 0.06, H * 0.09);
    ctx.beginPath();
    ctx.arc(W / 2, cy + H * 0.075, W * 0.045, 0, Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = '#8a8066';
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, W * 0.04, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

export interface WorldMaterials {
  /** The chevron-and-chain paper of the original photo (CC0 scan, OpenGameArt). */
  wall: THREE.MeshStandardMaterial;
  /** The small-dot paper on some partitions. */
  wallDots: THREE.MeshStandardMaterial;
  /** The chevron paper printed over water-stained paper. */
  wallStained: THREE.MeshStandardMaterial;
  /** Thin brown bumper rail low on some walls (the photo has no white skirting). */
  rail: THREE.MeshStandardMaterial;
  /** Painted steel of the ceiling grid, barely darker than the tiles. */
  tbar: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  /** Unlit and HDR (colour > 1, so it blooms); per-instance colour dims individual panels. */
  troffer: THREE.MeshBasicMaterial;
  /** Outlet plates (instanced; instance colour carries the baked light). */
  outlet: THREE.MeshStandardMaterial;
}

const images = new THREE.ImageLoader();
const textures = new THREE.TextureLoader();

/**
 * Loads the photo-scanned CC0 maps (ambientCG) and composites the Level 0 look over them.
 * Baked light and contact shadows arrive as vertex colours on every surface.
 */
export async function loadWorldMaterials(rng: Rng, panels: PanelMap): Promise<WorldMaterials> {
  const [paper, stained, carpetImg, ceilingImg, paperR, carpetN, carpetR, ceilN, bgColor, bgNormal, bgRough] = await Promise.all([
    images.loadAsync(paperColor),
    images.loadAsync(stainedColor),
    images.loadAsync(carpetColor),
    images.loadAsync(ceilingColor),
    textures.loadAsync(paperRough),
    textures.loadAsync(carpetNormal),
    textures.loadAsync(carpetRough),
    textures.loadAsync(ceilingNormal),
    images.loadAsync(backroomsColor),
    textures.loadAsync(backroomsNormal),
    textures.loadAsync(backroomsRough),
  ]);
  const W = TEXTURE_METRES.wallpaper;
  const paperRoughMap = finish(paperR, W, false);
  // Every surface is lit per pixel by the ceiling panels (see lighting/panelLights.ts).
  const lit = <T extends THREE.MeshStandardMaterial>(m: T, drop?: number, intensity = PANEL_INTENSITY) => withPanelLights(m, { intensity, drop, panels });
  const bgNormalMap = finish(bgNormal, W, false);
  const bgRoughMap = finish(bgRough, W, false);
  const paperMat = (map: HTMLCanvasElement | HTMLImageElement, normalMap: THREE.Texture, roughnessMap: THREE.Texture) =>
    new THREE.MeshStandardMaterial({
      map: finish(map instanceof HTMLCanvasElement ? new THREE.CanvasTexture(map) : new THREE.Texture(map), W, true),
      normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap,
      roughness: 1,
      vertexColors: true,
    });
  const chevron = paperMat(bgColor, bgNormalMap, bgRoughMap);
  chevron.map!.needsUpdate = true;
  const plate = new THREE.CanvasTexture(outletPlate());
  plate.colorSpace = THREE.SRGBColorSpace;
  return {
    wall: chevron,
    wallDots: paperMat(dotPaper(paper, 0.6), finish(wallpaperNormal(paper), W, false), paperRoughMap),
    wallStained: paperMat(stainedPaper(bgColor, stained), bgNormalMap, bgRoughMap),
    rail: new THREE.MeshStandardMaterial({ color: 0x6f5535, roughness: 0.6, vertexColors: true }),
    tbar: lit(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.6, 0.57, 0.45), roughness: 0.7, vertexColors: true, side: THREE.DoubleSide }), 1.1, CEILING_PANEL_INTENSITY),
    floor: new THREE.MeshStandardMaterial({
      map: finish(new THREE.CanvasTexture(carpet(carpetImg, rng)), TEXTURE_METRES.carpet, true),
      normalMap: finish(carpetN, TEXTURE_METRES.carpet, false),
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughnessMap: finish(carpetR, TEXTURE_METRES.carpet, false),
      roughness: 1,
      vertexColors: true,
    }),
    ceiling: lit(new THREE.MeshStandardMaterial({
      map: finish(new THREE.CanvasTexture(ceiling(ceilingImg)), TEXTURE_METRES.ceiling, true),
      normalMap: finish(ceilN, TEXTURE_METRES.ceiling, false),
      normalScale: new THREE.Vector2(0.5, 0.5),
      // Matte mineral tile: no roughness map (its low values made glints near the panels).
      roughness: 1,
      // Lifted a little (little fill reaches it from above), but kept below the walls between the
      // lights, as in Kane Pixels' footage.
      color: new THREE.Color(0.62, 0.62, 0.58),
      vertexColors: true,
    }), 1.1, CEILING_PANEL_INTENSITY),
    troffer: new THREE.MeshBasicMaterial({
      map: finish(new THREE.CanvasTexture(troffer()), 1, true),
      color: new THREE.Color(2.0, 1.97, 1.85),
      fog: true,
    }),
    outlet: new THREE.MeshStandardMaterial({ map: plate, roughness: 0.45 }),
  };
}
