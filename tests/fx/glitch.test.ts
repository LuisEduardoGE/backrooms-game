import { describe, expect, it } from 'vitest';
import { glitchAmount, GLITCH_SLOT, MAX_BURST } from '../../src/fx/glitch';

const SEED = 99;
const DT = 0.01;
const samples = (battery: number, seconds = 400) =>
  Array.from({ length: Math.round(seconds / DT) }, (_, i) => glitchAmount(i * DT, SEED, battery));

describe('glitchAmount', () => {
  it('stays within 0..1', () => {
    for (const v of [...samples(100, 100), ...samples(5, 100)]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic for a seed and time', () => {
    expect(glitchAmount(123.45, SEED, 100)).toBe(glitchAmount(123.45, SEED, 100));
  });

  it('is quiet most of the time on a healthy battery, with occasional bursts', () => {
    const active = samples(100).filter((v) => v > 0).length / samples(100).length;
    expect(active).toBeGreaterThan(0.005);
    expect(active).toBeLessThan(0.1);
  });

  it('keeps each burst short (≤ MAX_BURST) and at most one per slot — no rapid flashing', () => {
    const values = samples(100);
    let run = 0;
    let longest = 0;
    const burstsInSlot = new Map<number, number>();
    for (let i = 0; i < values.length; i++) {
      if (values[i] > 0) {
        if (run === 0) {
          const slot = Math.floor((i * DT) / GLITCH_SLOT);
          burstsInSlot.set(slot, (burstsInSlot.get(slot) ?? 0) + 1);
        }
        run++;
        longest = Math.max(longest, run);
      } else run = 0;
    }
    expect(longest * DT).toBeLessThanOrEqual(MAX_BURST + DT);
    expect(Math.max(...burstsInSlot.values())).toBe(1);
  });

  it('glitches far more on a low battery', () => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(samples(5))).toBeGreaterThan(mean(samples(100)) * 3);
    expect(Math.min(...samples(5, 20))).toBeGreaterThanOrEqual(0.15);
  });
});
