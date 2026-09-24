import * as THREE from 'three';
import { cellToWorld, type Grid, WALL_HEIGHT } from '../world/grid';
import { flicker, nearestLitLights } from './lights';

export const POOL_SIZE = 6;
const BASE_INTENSITY = 10;
const LIGHT_RANGE = 10;

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
    update(cellX: number, cellY: number, timeSec: number): void {
      const cells = nearestLitLights(grid, cellX, cellY, POOL_SIZE);
      lights.forEach((light, i) => {
        const cell = cells[i];
        if (!cell) {
          light.intensity = 0;
          return;
        }
        light.position.set(cellToWorld(cell.x), WALL_HEIGHT - 0.2, cellToWorld(cell.y));
        light.intensity = BASE_INTENSITY * flicker(timeSec, cell.y * grid.width + cell.x, seed);
      });
    },
  };
}
