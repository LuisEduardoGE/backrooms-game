import * as THREE from 'three';
import type { Rng } from '../core/rng';
import carpetColor from '../assets/textures/Carpet016/Color.jpg';
import carpetNormal from '../assets/textures/Carpet016/NormalGL.jpg';
import carpetRough from '../assets/textures/Carpet016/Roughness.jpg';
import ceilingColor from '../assets/textures/OfficeCeiling001/Color.jpg';
import ceilingNormal from '../assets/textures/OfficeCeiling001/NormalGL.jpg';
import ceilingRough from '../assets/textures/OfficeCeiling001/Roughness.jpg';
import paperColor from '../assets/textures/Wallpaper001C/Color.jpg';
import paperNormal from '../assets/textures/Wallpaper001C/NormalGL.jpg';
import paperRough from '../assets/textures/Wallpaper001C/Roughness.jpg';
import stainedColor from '../assets/textures/Wallpaper002B/Color.jpg';

/**
 * World-space sizes (metres covered by one texture repeat). Every surface's UVs are in metres,
 * so these are the only knobs for pattern scale.
 */
export const TEXTURE_METRES = {
  /** One wallpaper sheet: 3 chevron stripes across, 1.2 m wide. */
  wallpaper: 1.2,
  carpet: 2.5,
  /** OfficeCeiling001 has 6×6 tiles per texture → 2/3 m tiles, exactly 3 per 2 m cell. */
  ceiling: 4,
} as const;

/** Ceiling tile edge (metres) — troffers snap to this grid. */
export const CEILING_TILE = TEXTURE_METRES.ceiling / 6;

const COLOR_SIZE = 2048;

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

/**
 * Level 0 wallpaper: mustard stripes, alternating plain and a fine chevron (zig-zag) band, printed
 * over a photo-scanned paper so it keeps real fibre, streaks and (for the stained variant) water marks.
 */
function wallpaper(paper: HTMLImageElement, wash: number): HTMLCanvasElement {
  const S = COLOR_SIZE;
  const [c, ctx] = canvas(S);
  ctx.drawImage(paper, 0, 0, S, S);
  // Wash the photo toward white: keep its fibre and faint streaks, lose the heavy blotches.
  ctx.fillStyle = `rgba(255, 255, 255, ${wash})`;
  ctx.fillRect(0, 0, S, S);

  const [p, pc] = canvas(S);
  pc.fillStyle = '#e2cd7a';
  pc.fillRect(0, 0, S, S);
  const stripe = S / 3; // three stripes per sheet
  for (let i = 0; i < 3; i++) {
    const x = i * stripe;
    // Plain band, slightly lighter.
    pc.fillStyle = '#ead889';
    pc.fillRect(x, 0, stripe * 0.42, S);
    // Thin pinstripes framing the chevron band.
    pc.fillStyle = 'rgba(160, 130, 55, 0.7)';
    pc.fillRect(x + stripe * 0.45, 0, 4, S);
    pc.fillRect(x + stripe * 0.97, 0, 4, S);
    // Chevron band: stacked Vs.
    pc.strokeStyle = 'rgba(175, 145, 65, 0.8)';
    pc.lineWidth = 8;
    const bx = x + stripe * 0.5;
    const bw = stripe * 0.44;
    const step = S / 15; // divides the sheet exactly, so the chevrons tile vertically
    pc.beginPath();
    for (let y = -step; y < S + step; y += step) {
      pc.moveTo(bx, y);
      pc.lineTo(bx + bw / 2, y + step * 0.6);
      pc.lineTo(bx + bw, y);
    }
    pc.stroke();
  }
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(p, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

/** Carpet016 is a clean beige low-pile; Level 0's is a dingy mustard with worn mottling. */
function carpet(photo: HTMLImageElement, rng: Rng): HTMLCanvasElement {
  const S = COLOR_SIZE;
  const [c, ctx] = canvas(S);
  ctx.drawImage(photo, 0, 0, S, S);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#d8b862';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 18; i++) {
    const light = rng.chance(0.5);
    wrappedBlob(ctx, rng.range(0, S), rng.range(0, S), rng.range(200, 600), light ? 'rgba(210, 190, 120, 0.08)' : 'rgba(80, 65, 30, 0.08)', S);
  }
  return c;
}

/** Ceiling tile colour, nudged from stark white toward the aged, slightly yellow tiles of Level 0. */
function ceiling(photo: HTMLImageElement): HTMLCanvasElement {
  const S = COLOR_SIZE;
  const [c, ctx] = canvas(S);
  ctx.drawImage(photo, 0, 0, S, S);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#e6dcb8';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

/** A 2×4 ft troffer: bright prismatic diffuser inside an off-white metal frame. */
function troffer(): HTMLCanvasElement {
  const W = 256;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#b8b3a0';
  ctx.fillRect(0, 0, W, H);
  const f = 14;
  const g = ctx.createLinearGradient(f, 0, W - f, 0);
  g.addColorStop(0, '#f2ecd6');
  g.addColorStop(0.5, '#fffdf4');
  g.addColorStop(1, '#f2ecd6');
  ctx.fillStyle = g;
  ctx.fillRect(f, f, W - f * 2, H - f * 2);
  // Prismatic diffuser texture.
  ctx.fillStyle = 'rgba(200, 190, 160, 0.18)';
  for (let y = f; y < H - f; y += 6) for (let x = f + ((y / 6) % 2) * 3; x < W - f; x += 6) ctx.fillRect(x, y, 2, 2);
  return c;
}

export interface WorldMaterials {
  wall: THREE.MeshStandardMaterial;
  /** Same wallpaper printed over water-stained paper. */
  wallStained: THREE.MeshStandardMaterial;
  baseboard: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  /** Unlit and HDR (colour > 1, so it blooms); per-instance colour dims individual panels. */
  troffer: THREE.MeshBasicMaterial;
}

const images = new THREE.ImageLoader();
const textures = new THREE.TextureLoader();

/**
 * Loads the photo-scanned CC0 maps (ambientCG) and composites the Level 0 look over them.
 * Baked light and contact shadows arrive as vertex colours on every surface.
 */
export async function loadWorldMaterials(rng: Rng): Promise<WorldMaterials> {
  const [paper, stained, carpetImg, ceilingImg, paperN, paperR, carpetN, carpetR, ceilN, ceilR] = await Promise.all([
    images.loadAsync(paperColor),
    images.loadAsync(stainedColor),
    images.loadAsync(carpetColor),
    images.loadAsync(ceilingColor),
    textures.loadAsync(paperNormal),
    textures.loadAsync(paperRough),
    textures.loadAsync(carpetNormal),
    textures.loadAsync(carpetRough),
    textures.loadAsync(ceilingNormal),
    textures.loadAsync(ceilingRough),
  ]);
  const W = TEXTURE_METRES.wallpaper;
  const paperNormalMap = finish(paperN, W, false);
  const paperRoughMap = finish(paperR, W, false);
  const wallMat = (img: HTMLImageElement, wash: number) =>
    new THREE.MeshStandardMaterial({
      map: finish(new THREE.CanvasTexture(wallpaper(img, wash)), W, true),
      normalMap: paperNormalMap,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughnessMap: paperRoughMap,
      roughness: 1,
      vertexColors: true,
    });
  return {
    wall: wallMat(paper, 0.55),
    wallStained: wallMat(stained, 0.35),
    baseboard: new THREE.MeshStandardMaterial({ color: 0xd9d0b4, roughness: 0.55, vertexColors: true }),
    floor: new THREE.MeshStandardMaterial({
      map: finish(new THREE.CanvasTexture(carpet(carpetImg, rng)), TEXTURE_METRES.carpet, true),
      normalMap: finish(carpetN, TEXTURE_METRES.carpet, false),
      roughnessMap: finish(carpetR, TEXTURE_METRES.carpet, false),
      roughness: 1,
      vertexColors: true,
    }),
    ceiling: new THREE.MeshStandardMaterial({
      map: finish(new THREE.CanvasTexture(ceiling(ceilingImg)), TEXTURE_METRES.ceiling, true),
      normalMap: finish(ceilN, TEXTURE_METRES.ceiling, false),
      roughnessMap: finish(ceilR, TEXTURE_METRES.ceiling, false),
      roughness: 1,
      vertexColors: true,
    }),
    troffer: new THREE.MeshBasicMaterial({
      map: finish(new THREE.CanvasTexture(troffer()), 1, true),
      color: new THREE.Color(3.2, 3.05, 2.7),
      fog: true,
    }),
  };
}
