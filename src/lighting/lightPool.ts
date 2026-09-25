import * as THREE from 'three';
import { cellToWorld, type Grid, WALL_HEIGHT } from '../world/grid';
import { flicker, lightFalloff, nearestLitLightsAt } from './lights';

export const POOL_SIZE = 6;
/** Accent only: the baked light does the heavy lifting. */
const BASE_INTENSITY = 5;
const LIGHT_RANGE = 8;
/** Light level while the Howler's warning holds the lights down (steady, not strobing). */
const DIM_LEVEL = 0.35;

/**
 * Only POOL_SIZE real lights exist; each frame they move to the lit panels nearest the player.
 * Every other panel only glows (emissive). Fixed light count = no shader recompiles.
 */
export function createLightPool(scene: THREE.Scene, grid: Grid, seed: number) {
  const lights = Array.from({ length: POOL_SIZE }, () => {
    const light = new THREE.PointLight(0xfff1c8, 0, LIGHT_RANGE, 2);
    scene.add(light);
    return light;
  });

  return {
    /** `x`, `z`: player position in world metres. */
    update(x: number, z: number, timeSec: number, blackout: { x: number; z: number; radius: number } | null = null, dim = false): void {
      const cells = nearestLitLightsAt(grid, x, z, POOL_SIZE);
      lights.forEach((light, i) => {
        const cell = cells[i];
        if (!cell) {
          light.intensity = 0;
          return;
        }
        const lx = cellToWorld(cell.x);
        const lz = cellToWorld(cell.y);
        light.position.set(lx, WALL_HEIGHT - 0.2, lz);
        const out = blackout !== null && Math.hypot(lx - blackout.x, lz - blackout.z) <= blackout.radius;
        light.intensity = out
          ? 0
          : BASE_INTENSITY *
            (dim ? DIM_LEVEL : 1) *
            lightFalloff(Math.hypot(lx - x, lz - z)) *
            flicker(timeSec, cell.y * grid.width + cell.x, seed);
      });
    },
  };
}
