import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SENSITIVITY, MAX_SENSITIVITY, MIN_SENSITIVITY, nudgeSensitivity, parseSensitivity, sensitivityLabel,
} from '../../src/core/sensitivity';

describe('sensitivity', () => {
  it('starts a little lower than before (was 0.0022 rad/px)', () => {
    expect(DEFAULT_SENSITIVITY).toBeLessThan(0.0022);
  });

  it('nudges up and down in ~15% steps, clamped to a sane range', () => {
    expect(nudgeSensitivity(DEFAULT_SENSITIVITY, 1)).toBeCloseTo(DEFAULT_SENSITIVITY * 1.15, 9);
    expect(nudgeSensitivity(DEFAULT_SENSITIVITY, -1)).toBeCloseTo(DEFAULT_SENSITIVITY / 1.15, 9);
    expect(nudgeSensitivity(MAX_SENSITIVITY, 1)).toBe(MAX_SENSITIVITY);
    expect(nudgeSensitivity(MIN_SENSITIVITY, -1)).toBe(MIN_SENSITIVITY);
  });

  it('restores a saved value, ignoring junk or out-of-range values', () => {
    expect(parseSensitivity('0.003')).toBe(0.003);
    expect(parseSensitivity(null)).toBe(DEFAULT_SENSITIVITY);
    expect(parseSensitivity('abc')).toBe(DEFAULT_SENSITIVITY);
    expect(parseSensitivity('5')).toBe(DEFAULT_SENSITIVITY);
    expect(parseSensitivity('-1')).toBe(DEFAULT_SENSITIVITY);
  });

  it('labels the value for the on-screen readout', () => {
    expect(sensitivityLabel(0.0018)).toBe('MOUSE 1.8');
  });
});
