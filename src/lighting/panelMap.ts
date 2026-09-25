import * as THREE from 'three';
import type { Grid } from '../world/grid';
import { isDark } from '../world/grid';
import { isLightCell } from './lights';

/**
 * Live brightness of every ceiling panel, one byte per grid cell (0 = no panel or a dead one), as a
 * texture the surface shaders read (see panelLights.ts). Flicker, the Howler's warning and
 * Presence blackouts write into it, so when a tube dies the room under it really goes dark —
 * not just the panel.
 */
export function createPanelMap(grid: Grid) {
  const { width, height } = grid;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (isLightCell(grid, x, y) && !isDark(grid, x, y)) data[y * width + x] = 255;
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  let dirty = false;
  return {
    texture,
    width,
    height,
    /** Sets a panel's brightness (0..1) for this frame. */
    set(x: number, y: number, level: number): void {
      const v = Math.max(0, Math.min(255, Math.round(level * 255)));
      const i = y * width + x;
      if (data[i] !== v) {
        data[i] = v;
        dirty = true;
      }
    },
    /** Uploads this frame's changes (once per frame). */
    commit(): void {
      if (!dirty) return;
      texture.needsUpdate = true;
      dirty = false;
    },
  };
}

export type PanelMap = ReturnType<typeof createPanelMap>;
