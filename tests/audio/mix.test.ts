import { describe, expect, it } from 'vitest';
import { ECHO_CHANCE, footstepLevel, footWetness, humLevel, maybeEcho, whisperLevel } from '../../src/audio/mix';
import { createRng } from '../../src/core/rng';

describe('humLevel', () => {
  it('is loudest under a panel, fades with distance, and is silent in the dark or a blackout', () => {
    expect(humLevel(0, false)).toBeCloseTo(0.2, 6);
    expect(humLevel(3, false)).toBeLessThan(humLevel(0, false));
    expect(humLevel(3, false)).toBeGreaterThan(0);
    expect(humLevel(null, false)).toBe(0);
    expect(humLevel(0, true)).toBe(0);
    expect(humLevel(50, false)).toBeGreaterThan(0);
  });
});

describe('footstepLevel / whisperLevel', () => {
  it('orders gaits by loudness and keeps every level ≤ 1', () => {
    expect(footstepLevel('crouch')).toBeLessThan(footstepLevel('walk'));
    expect(footstepLevel('walk')).toBeLessThan(footstepLevel('sprint'));
    expect(footstepLevel('sprint')).toBeLessThanOrEqual(1);
  });

  it('whispers only once the tape starts to warp', () => {
    expect(whisperLevel(0)).toBe(0);
    expect(whisperLevel(0.1)).toBe(0);
    expect(whisperLevel(0.5)).toBeGreaterThan(0);
    expect(whisperLevel(1)).toBeCloseTo(0.3, 6);
  });
});

describe('maybeEcho', () => {
  it('never echoes a silent step', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) expect(maybeEcho(rng, 0, { x: 0, z: 0 }, 0, 1)).toBeNull();
  });

  it('echoes rarely while sane and far more as sanity collapses (spec §6: sanity drives phantom footsteps)', () => {
    const rate = (distortion: number) => {
      const rng = createRng(4);
      return Array.from({ length: 4000 }, () => maybeEcho(rng, 6, { x: 0, z: 0 }, 0, distortion)).filter((e) => e !== null).length / 4000;
    };
    expect(rate(0)).toBeGreaterThan(ECHO_CHANCE.sane - 0.02);
    expect(rate(0)).toBeLessThan(ECHO_CHANCE.sane + 0.02);
    expect(rate(1)).toBeGreaterThan(ECHO_CHANCE.insane - 0.04);
    expect(rate(1)).toBeLessThan(ECHO_CHANCE.insane + 0.04);
  });

  it('places echoes shortly after, from behind', () => {
    const rng = createRng(2);
    const echoes = Array.from({ length: 2000 }, () => maybeEcho(rng, 6, { x: 10, z: 10 }, 0, 1)).filter((e) => e !== null);
    expect(echoes.length).toBeGreaterThan(0);
    for (const e of echoes) {
      expect(e!.delaySec).toBeGreaterThanOrEqual(0.3);
      expect(e!.delaySec).toBeLessThanOrEqual(0.5);
      const d = Math.hypot(e!.x - 10, e!.z - 10);
      expect(d).toBeGreaterThanOrEqual(6 - 1e-9);
      expect(d).toBeLessThanOrEqual(10 + 1e-9);
      // Facing −z (yaw 0), "behind" is +z.
      expect(e!.z - 10).toBeGreaterThan(0);
    }
  });
});

describe('footWetness', () => {
  it('is damp everywhere (moist carpet), wetter in unpowered zones, soaking in a puddle', () => {
    const dry = footWetness(false, false);
    const dark = footWetness(false, true);
    const puddle = footWetness(true, false);
    expect(dry).toBeGreaterThan(0.2);
    expect(dark).toBeGreaterThan(dry);
    expect(puddle).toBeGreaterThan(dark);
    expect(puddle).toBeLessThanOrEqual(1);
    expect(footWetness(true, true)).toBe(puddle);
  });
});
