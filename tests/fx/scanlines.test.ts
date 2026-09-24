import { describe, expect, it } from 'vitest';
import { scanlinePeriod } from '../../src/fx/scanlines';

describe('scanlinePeriod', () => {
  it('is a whole number of pixels, at least 3, so scanlines never alias into moiré bands', () => {
    for (const h of [480, 720, 900, 1080, 1440, 1600, 2160, 2880]) {
      const p = scanlinePeriod(h);
      expect(Number.isInteger(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps roughly a VHS line count (240–400 lines) on common screens', () => {
    for (const h of [720, 1080, 1440, 2160]) {
      const lines = h / scanlinePeriod(h);
      expect(lines).toBeGreaterThanOrEqual(240);
      expect(lines).toBeLessThanOrEqual(400);
    }
  });
});
