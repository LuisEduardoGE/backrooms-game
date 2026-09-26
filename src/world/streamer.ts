import * as THREE from 'three';
import { buildChunk, type ChunkPanels, disposeChunk, type LightField } from './chunkMesh';
import { type ChunkKey, chunkKey, chunkOf, chunksAround, LOAD_RADIUS, parseChunkKey, planChunkWork } from './chunks';
import type { Grid } from './grid';
import type { WorldMaterials } from './textures';

/**
 * Keeps chunk meshes loaded within LOAD_RADIUS of the player. When the player changes chunk it
 * unloads at once and queues new chunks nearest-first, building at most one per frame so crossing
 * into a new area never hitches — except the chunk the player stands in, which is built immediately.
 */
/** Chunks around the player (Chebyshev) whose furniture is drawn. */
const FURNITURE_RADIUS = 1;

/** Extra per-chunk objects (furniture), built with the chunk and freed with it. */
export type ChunkExtras = (cx: number, cy: number) => THREE.Object3D[];

export function createChunkStreamer(scene: THREE.Scene, grid: Grid, mats: WorldMaterials, light: LightField, extras: ChunkExtras = () => []) {
  const loaded = new Map<ChunkKey, THREE.Group>();
  let currentChunk: ChunkKey | null = null;
  let queue: ChunkKey[] = [];

  const build = (key: ChunkKey) => {
    if (loaded.has(key)) return;
    const { cx, cy } = parseChunkKey(key);
    const group = buildChunk(grid, cx, cy, mats, light);
    const items = extras(cx, cy);
    if (items.length > 0) {
      // Furniture lives in its own group so it can be hidden away from the player (see update).
      const furniture = new THREE.Group();
      furniture.name = 'furniture';
      furniture.add(...items);
      group.add(furniture);
      group.userData.furniture = furniture;
    }
    scene.add(group);
    loaded.set(key, group);
  };

  return {
    update(cellX: number, cellY: number): void {
      // Furniture is dense (thousands of triangles a piece, drawn again into every shadow map): only
      // the player's chunk and its neighbours show it — beyond that the fog hides it anyway.
      for (const [key, group] of loaded) {
        const f = group.userData.furniture as THREE.Group | undefined;
        if (!f) continue;
        const { cx, cy } = parseChunkKey(key);
        f.visible = Math.max(Math.abs(cx - chunkOf(cellX)), Math.abs(cy - chunkOf(cellY))) <= FURNITURE_RADIUS;
      }
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
    /** Ceiling panels of every loaded chunk (for flicker and blackouts). */
    *panels(): Iterable<ChunkPanels> {
      for (const group of loaded.values()) if (group.userData.panels) yield group.userData.panels as ChunkPanels;
    },
  };
}
