import { describe, expect, it } from 'vitest';
import { createFixedStepper, FIXED_DT, MAX_STEPS_PER_FRAME } from '../../src/core/loop';

describe('createFixedStepper', () => {
  it('runs one step per 60 Hz frame', () => {
    const s = createFixedStepper();
    expect(s.advance(FIXED_DT)).toBe(1);
    expect(s.advance(FIXED_DT)).toBe(1);
  });

  it('accumulates short frames (120 Hz display)', () => {
    const s = createFixedStepper();
    expect(s.advance(FIXED_DT / 2)).toBe(0);
    expect(s.advance(FIXED_DT / 2)).toBe(1);
  });

  it('caps catch-up after a long pause and drops the backlog', () => {
    const s = createFixedStepper();
    expect(s.advance(10)).toBe(MAX_STEPS_PER_FRAME);
    expect(s.advance(FIXED_DT / 2)).toBe(0);
  });

  it('ignores negative frame times', () => {
    const s = createFixedStepper();
    expect(s.advance(-1)).toBe(0);
    expect(s.advance(FIXED_DT)).toBe(1);
  });

  it('reports the leftover fraction of a step for render interpolation', () => {
    const s = createFixedStepper();
    s.advance(FIXED_DT * 1.5);
    expect(s.alpha()).toBeCloseTo(0.5, 6);
    s.advance(10);
    expect(s.alpha()).toBe(0);
  });
});
