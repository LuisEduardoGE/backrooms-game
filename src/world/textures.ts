import * as THREE from 'three';
import type { Rng } from '../core/rng';

const SIZE = 256;
/** Bright troffer panel inside a 3×3 drop-ceiling tile layout (canvas pixels). */
const PANEL = { x: SIZE / 3, y: SIZE / 6, w: SIZE / 3, h: (SIZE * 2) / 3 };

function canvasTexture(draw: (ctx: CanvasRenderingContext2D) => void, size = SIZE): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Adds per-pixel luminance noise; `strength` 0..1. */
function noise(ctx: CanvasRenderingContext2D, rng: Rng, strength: number, size = SIZE): void {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * 255 * strength;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function drawWallpaper(ctx: CanvasRenderingContext2D, rng: Rng): void {
  ctx.fillStyle = '#c8b25a';
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let x = 0; x < SIZE; x += 32) {
    ctx.fillStyle = 'rgba(255, 240, 170, 0.18)';
    ctx.fillRect(x, 0, 12, SIZE);
    ctx.fillStyle = 'rgba(120, 95, 30, 0.12)';
    ctx.fillRect(x + 14, 0, 2, SIZE);
  }
  noise(ctx, rng, 0.08);
  // Grime near the floor (canvas bottom = bottom of the wall).
  const g = ctx.createLinearGradient(0, SIZE * 0.8, 0, SIZE);
  g.addColorStop(0, 'rgba(60, 45, 10, 0)');
  g.addColorStop(1, 'rgba(60, 45, 10, 0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, SIZE * 0.8, SIZE, SIZE * 0.2);
}

/** The carpet covers CARPET_METRES (8 m) of floor per repeat, laid in world space. */
const CARPET_SIZE = 512;

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

/** Level 0 carpet: flat mustard-beige, low pile, softly mottled, a few damp patches. */
function drawCarpet(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const S = CARPET_SIZE;
  ctx.fillStyle = '#b39c60';
  ctx.fillRect(0, 0, S, S);
  // Broad, very soft light/dark mottling (worn and matted areas).
  for (let i = 0; i < 26; i++) {
    const light = rng.chance(0.5);
    wrappedBlob(ctx, rng.range(0, S), rng.range(0, S), rng.range(60, 180), light ? 'rgba(200, 180, 110, 0.10)' : 'rgba(90, 75, 35, 0.10)', S);
  }
  // A few damp patches: irregular clusters of darker blobs.
  for (let i = 0; i < 3; i++) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    for (let k = 0; k < 6; k++) wrappedBlob(ctx, x + rng.range(-30, 30), y + rng.range(-30, 30), rng.range(20, 55), 'rgba(70, 58, 25, 0.16)', S);
  }
  // Low-pile fibre grain.
  noise(ctx, rng, 0.16, S);
}

function drawCeilingTiles(ctx: CanvasRenderingContext2D, rng: Rng): void {
  ctx.fillStyle = '#d6cfae';
  ctx.fillRect(0, 0, SIZE, SIZE);
  noise(ctx, rng, 0.1);
  ctx.strokeStyle = 'rgba(90, 80, 50, 0.6)';
  ctx.lineWidth = 3;
  const t = SIZE / 3;
  ctx.beginPath();
  for (let i = 0; i <= 3; i++) {
    ctx.moveTo(i * t, 0);
    ctx.lineTo(i * t, SIZE);
    ctx.moveTo(0, i * t);
    ctx.lineTo(SIZE, i * t);
  }
  ctx.stroke();
}

function drawLightPanel(ctx: CanvasRenderingContext2D, rng: Rng): void {
  drawCeilingTiles(ctx, rng);
  ctx.fillStyle = '#f4efd8';
  ctx.fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  ctx.strokeStyle = 'rgba(120, 110, 80, 0.8)';
  ctx.lineWidth = 4;
  ctx.strokeRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
}

function drawLightEmissive(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#fff';
  ctx.fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
}

export interface WorldMaterials {
  wall: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  lightOn: THREE.MeshStandardMaterial;
  lightOff: THREE.MeshStandardMaterial;
}

export function createWorldMaterials(rng: Rng): WorldMaterials {
  const panel = canvasTexture((ctx) => drawLightPanel(ctx, rng));
  return {
    wall: new THREE.MeshStandardMaterial({ map: canvasTexture((ctx) => drawWallpaper(ctx, rng)), roughness: 0.95 }),
    // Vertex colours carry the baked light (see chunkMesh floorPlane).
    floor: new THREE.MeshStandardMaterial({ map: canvasTexture((ctx) => drawCarpet(ctx, rng), CARPET_SIZE), roughness: 1, vertexColors: true }),
    ceiling: new THREE.MeshStandardMaterial({ map: canvasTexture((ctx) => drawCeilingTiles(ctx, rng)), roughness: 0.9 }),
    lightOn: new THREE.MeshStandardMaterial({
      map: panel,
      emissive: 0xfff3d1,
      emissiveMap: canvasTexture(drawLightEmissive),
      emissiveIntensity: 1.4,
      roughness: 0.6,
    }),
    lightOff: new THREE.MeshStandardMaterial({ map: panel, color: 0x77725f, roughness: 0.6 }),
  };
}
