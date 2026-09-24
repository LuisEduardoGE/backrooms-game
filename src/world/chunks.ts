export const CHUNK_CELLS = 16;
/** Chunks loaded around the player. Fog hides everything past ~35 m; radius 2 keeps ≥ 64 m loaded. */
export const LOAD_RADIUS = 2;

export type ChunkKey = string;

export function chunkKey(cx: number, cy: number): ChunkKey {
  return `${cx},${cy}`;
}

export function parseChunkKey(key: ChunkKey): { cx: number; cy: number } {
  const [cx, cy] = key.split(',').map(Number);
  return { cx, cy };
}

export function chunkOf(cell: number): number {
  return Math.floor(cell / CHUNK_CELLS);
}

/** Chunks within `radius` (Chebyshev) of the chunk containing the cell, clipped to the grid. */
export function chunksAround(cellX: number, cellY: number, radius: number, gridW: number, gridH: number): Set<ChunkKey> {
  const maxCx = Math.ceil(gridW / CHUNK_CELLS) - 1;
  const maxCy = Math.ceil(gridH / CHUNK_CELLS) - 1;
  const ccx = chunkOf(cellX);
  const ccy = chunkOf(cellY);
  const keys = new Set<ChunkKey>();
  for (let cy = Math.max(0, ccy - radius); cy <= Math.min(maxCy, ccy + radius); cy++) {
    for (let cx = Math.max(0, ccx - radius); cx <= Math.min(maxCx, ccx + radius); cx++) keys.add(chunkKey(cx, cy));
  }
  return keys;
}

export function diffChunks(
  loaded: ReadonlySet<ChunkKey>,
  wanted: ReadonlySet<ChunkKey>,
): { toLoad: ChunkKey[]; toUnload: ChunkKey[] } {
  return {
    toLoad: [...wanted].filter((k) => !loaded.has(k)),
    toUnload: [...loaded].filter((k) => !wanted.has(k)),
  };
}
