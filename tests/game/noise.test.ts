import { describe, expect, it } from 'vitest';
import { createFootsteps, NOISE_RADIUS, noiseWeight, stepFootsteps } from '../../src/game/noise';
import type { Gait } from '../../src/player/controller';

function steps(gait: Gait, seconds: number, moving = true, dt = 0.05) {
  const f = createFootsteps();
  const out: number[] = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const r = stepFootsteps(f, dt, moving, gait);
    if (r !== null) out.push(r);
  }
  return out;
}

describe('stepFootsteps', () => {
  it('lands walking steps every ~0.55 s at walking loudness', () => {
    expect(steps('walk', 1.2)).toEqual([NOISE_RADIUS.walk, NOISE_RADIUS.walk]);
  });

  it('lands sprint steps faster and louder', () => {
    expect(steps('sprint', 1.1)).toEqual([NOISE_RADIUS.sprint, NOISE_RADIUS.sprint, NOISE_RADIUS.sprint]);
  });

  it('makes crouched steps silent', () => {
    expect(steps('crouch', 2).every((r) => r === 0)).toBe(true);
  });

  it('makes no steps while standing still, and restarts the cycle on stopping', () => {
    expect(steps('walk', 3, false)).toEqual([]);
    const f = createFootsteps();
    stepFootsteps(f, 0.5, true, 'walk');
    stepFootsteps(f, 0.05, false, 'walk');
    expect(stepFootsteps(f, 0.5, true, 'walk')).toBeNull();
  });
});

describe('noiseWeight', () => {
  it('weighs a sprint step 9× a walking step and silence as nothing', () => {
    expect(noiseWeight(NOISE_RADIUS.walk)).toBe(1);
    expect(noiseWeight(NOISE_RADIUS.sprint)).toBe(9);
    expect(noiseWeight(0)).toBe(0);
  });
});
