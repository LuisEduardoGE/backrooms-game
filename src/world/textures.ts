import * as THREE from 'three';
import type { Rng } from '../core/rng';

const SIZE = 256;
/** Bright troffer panel inside a 3×3 drop-ceiling tile layout (canvas pixels). */
const PANEL = { x: SIZE / 3, y: SIZE / 6, w: SIZE / 3, h: (SIZE * 2) / 3 };

function canvasTexture(draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
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
function noise(ctx: CanvasRenderingContext2D, rng: Rng, strength: number): void {
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
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

function drawCarpet(ctx: CanvasRenderingContext2D, rng: Rng): void {
  ctx.fillStyle = '#9a8544';
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 6; i++) {
    const x = rng.range(0, SIZE);
    const y = rng.range(0, SIZE);
    const r = rng.range(20, 70);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(70, 55, 20, 0.25)');
    g.addColorStop(1, 'rgba(70, 55, 20, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  noise(ctx, rng, 0.22);
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
    floor: new THREE.MeshStandardMaterial({ map: canvasTexture((ctx) => drawCarpet(ctx, rng)), roughness: 1 }),
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
