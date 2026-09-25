/**
 * Height field (0..1, row-major, square, rows top-down like a canvas) → tangent-space normal map
 * RGBA in the OpenGL convention three.js expects (+x = right, +y = up the texture). Central
 * differences with wrap-around, so a tiling height field gives a seamless normal map.
 * `strength` scales the slopes (height units per pixel → surface tilt).
 */
export function heightToNormal(height: Float32Array, size: number, strength: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength;
      // Canvas rows run down, texture v runs up: flip the vertical slope.
      const dy = -(at(x, y + 1) - at(x, y - 1)) * 0.5 * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}
