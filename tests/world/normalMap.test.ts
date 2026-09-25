import { describe, expect, it } from 'vitest';
import { heightToNormal } from '../../src/world/normalMap';

const px = (out: Uint8ClampedArray, size: number, x: number, y: number) => Array.from(out.slice((y * size + x) * 4, (y * size + x) * 4 + 4));

describe('heightToNormal', () => {
  it('encodes a flat surface as straight out (128, 128, 255)', () => {
    const out = heightToNormal(new Float32Array(16 * 16).fill(0.5), 16, 4);
    expect(px(out, 16, 5, 5)).toEqual([128, 128, 255, 255]);
  });

  it('tilts the normal away from rising ground (OpenGL convention: +x right, +y = up the image)', () => {
    const size = 16;
    // Height rises to the right: the normal leans left (red < 128).
    const right = heightToNormal(Float32Array.from({ length: size * size }, (_, i) => (i % size) / size), size, 4);
    expect(px(right, size, 8, 8)[0]).toBeLessThan(128);
    expect(px(right, size, 8, 8)[1]).toBe(128);
    // Height rises toward the bottom row (canvas y down = texture v down): the normal leans up (green > 128).
    const down = heightToNormal(Float32Array.from({ length: size * size }, (_, i) => Math.floor(i / size) / size), size, 4);
    expect(px(down, size, 8, 8)[1]).toBeGreaterThan(128);
  });

  it('wraps at the edges so a tiling texture stays seamless', () => {
    const size = 8;
    const h = new Float32Array(size * size);
    h[3 * size + 0] = 1; // a bump on the left edge
    const out = heightToNormal(h, size, 4);
    // Its right-hand slope shows up on the far right column of the same row.
    expect(px(out, size, size - 1, 3)[0]).not.toBe(128);
  });
});
