/** Target number of visible scanlines — roughly VHS's vertical resolution. */
const TARGET_LINES = 360;

/**
 * Scanline period in drawing-buffer pixels. A whole number ≥ 3 so every line lands on the same
 * pixel pattern: a 2 px sine (or a fractional period) beats against the pixel grid into moiré bands.
 */
export function scanlinePeriod(bufferHeight: number): number {
  return Math.max(3, Math.round(bufferHeight / TARGET_LINES));
}
