import type { PlayerState } from '../player/controller';
import type { Level } from '../world/generator';
import { Cell, CELL_SIZE, worldToCell } from '../world/grid';

const SCALE = 2; // minimap pixels per cell
const COLORS = { wall: '#1c1c1c', floor: '#c8b25a', dark: '#4a3f1c', pillar: '#666', start: '#3c3', exit: '#e33' };

function drawBaseMap(level: Level): HTMLCanvasElement {
  const { grid, start, exit } = level;
  const canvas = document.createElement('canvas');
  canvas.width = grid.width * SCALE;
  canvas.height = grid.height * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      const c = grid.cells[i];
      ctx.fillStyle =
        c === Cell.Wall ? COLORS.wall : c === Cell.Pillar ? COLORS.pillar : grid.dark[i] ? COLORS.dark : COLORS.floor;
      ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
    }
  }
  ctx.fillStyle = COLORS.start;
  ctx.fillRect((start.x - 1) * SCALE, (start.y - 1) * SCALE, SCALE * 3, SCALE * 3);
  ctx.fillStyle = COLORS.exit;
  ctx.fillRect((exit.x - 1) * SCALE, (exit.y - 1) * SCALE, SCALE * 3, SCALE * 3);
  return canvas;
}

/** `?debug` overlay: fps, seed, player cell, and a top-down minimap with heading. */
export function createDebugHud(level: Level) {
  const base = drawBaseMap(level);
  const root = document.createElement('div');
  root.className = 'debug';
  const info = document.createElement('div');
  const map = document.createElement('canvas');
  map.width = base.width;
  map.height = base.height;
  root.append(info, map);
  document.body.append(root);
  const ctx = map.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  let frames = 0;
  let elapsed = 0;
  let fps = 0;

  return {
    update(frameDt: number, player: PlayerState, markers: readonly { x: number; z: number }[] = []): void {
      frames++;
      elapsed += frameDt;
      if (elapsed >= 0.5) {
        fps = Math.round(frames / elapsed);
        frames = 0;
        elapsed = 0;
      }
      const cx = worldToCell(player.pos.x);
      const cy = worldToCell(player.pos.z);
      info.textContent = `${fps} fps · seed ${level.seed} · cell ${cx},${cy} · ${player.gait}`;

      ctx.drawImage(base, 0, 0);
      const px = (player.pos.x / CELL_SIZE) * SCALE;
      const py = (player.pos.z / CELL_SIZE) * SCALE;
      ctx.fillStyle = '#0af';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0af';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - Math.sin(player.yaw) * 10, py - Math.cos(player.yaw) * 10);
      ctx.stroke();
      ctx.fillStyle = '#f0f';
      for (const m of markers) ctx.fillRect((m.x / CELL_SIZE) * SCALE - 3, (m.z / CELL_SIZE) * SCALE - 3, 6, 6);
    },
  };
}
