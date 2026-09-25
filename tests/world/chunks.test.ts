import { describe, expect, it } from 'vitest';
import { chunkKey, chunkOf, chunksAround, diffChunks, parseChunkKey, planChunkWork } from '../../src/world/chunks';

describe('chunks', () => {
  it('round-trips keys', () => {
    expect(chunkKey(3, 12)).toBe('3,12');
    expect(parseChunkKey('3,12')).toEqual({ cx: 3, cy: 12 });
  });

  it('maps cells to chunks', () => {
    expect(chunkOf(0)).toBe(0);
    expect(chunkOf(15)).toBe(0);
    expect(chunkOf(16)).toBe(1);
    expect(chunkOf(199)).toBe(12);
  });

  it('returns a full square in the middle of the grid', () => {
    const keys = chunksAround(100, 100, 3, 200, 200);
    expect(keys.size).toBe(49);
    expect(keys.has('6,6')).toBe(true);
    expect(keys.has('3,3')).toBe(true);
    expect(keys.has('9,9')).toBe(true);
  });

  it('clips at the grid edges (no negative or out-of-range chunks)', () => {
    expect([...chunksAround(0, 0, 1, 200, 200)].sort()).toEqual(['0,0', '0,1', '1,0', '1,1']);
    expect([...chunksAround(199, 199, 1, 200, 200)].sort()).toEqual(['11,11', '11,12', '12,11', '12,12']);
  });

  it('diffs loaded vs wanted', () => {
    const { toLoad, toUnload } = diffChunks(new Set(['0,0', '0,1']), new Set(['0,1', '1,1']));
    expect(toLoad).toEqual(['1,1']);
    expect(toUnload).toEqual(['0,0']);
  });
});

describe('planChunkWork', () => {
  it('unloads what is no longer wanted and queues missing chunks nearest-first', () => {
    const loaded = new Set(['0,0', '5,5']);
    const wanted = new Set(['0,0', '3,3', '4,3', '2,3', '6,6']);
    const { toUnload, queue } = planChunkWork(loaded, wanted, 4, 3);
    expect(toUnload).toEqual(['5,5']);
    expect(queue[0]).toBe('4,3'); // the chunk the player stands in comes first
    expect(queue).not.toContain('0,0');
    expect(new Set(queue)).toEqual(new Set(['4,3', '3,3', '2,3', '6,6']));
    const dist = (k: string) => {
      const { cx, cy } = parseChunkKey(k);
      return Math.max(Math.abs(cx - 4), Math.abs(cy - 3));
    };
    for (let i = 1; i < queue.length; i++) expect(dist(queue[i])).toBeGreaterThanOrEqual(dist(queue[i - 1]));
  });
});
