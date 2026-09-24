import type * as THREE from 'three';
import { buildChunk, disposeChunk } from './chunkMesh';
import { type ChunkKey, chunkKey, chunkOf, chunksAround, diffChunks, LOAD_RADIUS, parseChunkKey } from './chunks';
import type { Grid } from './grid';
import type { WorldMaterials } from './textures';

/** Keeps chunk meshes loaded within LOAD_RADIUS of the player; only re-diffs when the player changes chunk. */
export function createChunkStreamer(scene: THREE.Scene, grid: Grid, mats: WorldMaterials) {
  const loaded = new Map<ChunkKey, THREE.Group>();
  let currentChunk: ChunkKey | null = null;

  return {
    update(cellX: number, cellY: number): void {
      const here = chunkKey(chunkOf(cellX), chunkOf(cellY));
      if (here === currentChunk) return;
      currentChunk = here;

      const wanted = chunksAround(cellX, cellY, LOAD_RADIUS, grid.width, grid.height);
      const { toLoad, toUnload } = diffChunks(new Set(loaded.keys()), wanted);
      for (const key of toUnload) {
        const group = loaded.get(key);
        if (!group) continue;
        scene.remove(group);
        disposeChunk(group);
        loaded.delete(key);
      }
      for (const key of toLoad) {
        const { cx, cy } = parseChunkKey(key);
        const group = buildChunk(grid, cx, cy, mats);
        scene.add(group);
        loaded.set(key, group);
      }
    },
    loadedCount: () => loaded.size,
  };
}
