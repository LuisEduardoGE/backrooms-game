import type * as THREE from 'three';
import { buildChunk, disposeChunk, type LightField } from './chunkMesh';
import { type ChunkKey, chunkKey, chunkOf, chunksAround, LOAD_RADIUS, parseChunkKey, planChunkWork } from './chunks';
import type { Grid } from './grid';
import type { WorldMaterials } from './textures';

/**
 * Keeps chunk meshes loaded within LOAD_RADIUS of the player. When the player changes chunk it
 * unloads at once and queues new chunks nearest-first, building at most one per frame so crossing
 * into a new area never hitches — except the chunk the player stands in, which is built immediately.
 */
export function createChunkStreamer(scene: THREE.Scene, grid: Grid, mats: WorldMaterials, light: LightField) {
  const loaded = new Map<ChunkKey, THREE.Group>();
  let currentChunk: ChunkKey | null = null;
  let queue: ChunkKey[] = [];

  const build = (key: ChunkKey) => {
    if (loaded.has(key)) return;
    const { cx, cy } = parseChunkKey(key);
    const group = buildChunk(grid, cx, cy, mats, light);
    scene.add(group);
    loaded.set(key, group);
  };

  return {
    update(cellX: number, cellY: number): void {
      const here = chunkKey(chunkOf(cellX), chunkOf(cellY));
      if (here !== currentChunk) {
        currentChunk = here;
        const wanted = chunksAround(cellX, cellY, LOAD_RADIUS, grid.width, grid.height);
        const plan = planChunkWork(new Set(loaded.keys()), wanted, chunkOf(cellX), chunkOf(cellY));
        for (const key of plan.toUnload) {
          const group = loaded.get(key);
          if (!group) continue;
          scene.remove(group);
          disposeChunk(group);
          loaded.delete(key);
        }
        queue = plan.queue;
        build(here);
      }
      const next = queue.shift();
      if (next) build(next);
    },
    /** Builds everything still queued right now (used once behind the title screen). */
    flush(): void {
      for (const key of queue) build(key);
      queue = [];
    },
    loadedCount: () => loaded.size,
  };
}
