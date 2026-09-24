import { describe, expect, it } from 'vitest';
import {
  ALMOND_WATER, createSanity, DARK_DRAIN, distortionFromSanity, drinkAlmondWater, fearDrain, isInsane, jolt, LIGHT_REGEN,
  NEAR_ENTITY_DRAIN, SMILER_SIGHT_DRAIN,
  NIGHT_VISION_DRAIN_FACTOR, SANITY_MAX, updateSanity,
} from '../../src/game/sanity';

const run = (s: ReturnType<typeof createSanity>, seconds: number, env: { dark: boolean; nightVision: boolean }) => {
  for (let i = 0; i < seconds * 10; i++) updateSanity(s, 0.1, env);
  return s;
};

describe('sanity', () => {
  it('starts full', () => {
    expect(createSanity().value).toBe(SANITY_MAX);
  });

  it('drains in the dark, slower with night vision', () => {
    expect(run(createSanity(), 10, { dark: true, nightVision: false }).value).toBeCloseTo(SANITY_MAX - DARK_DRAIN * 10, 6);
    expect(run(createSanity(), 10, { dark: true, nightVision: true }).value).toBeCloseTo(
      SANITY_MAX - DARK_DRAIN * NIGHT_VISION_DRAIN_FACTOR * 10,
      6,
    );
  });

  it('recovers slowly in the light, never above the max', () => {
    const s = createSanity();
    s.value = 50;
    run(s, 10, { dark: false, nightVision: false });
    expect(s.value).toBeCloseTo(50 + LIGHT_REGEN * 10, 6);
    run(s, 1000, { dark: false, nightVision: false });
    expect(s.value).toBe(SANITY_MAX);
  });

  it('bottoms out at 0 and reports insanity', () => {
    const s = run(createSanity(), 500, { dark: true, nightVision: false });
    expect(s.value).toBe(0);
    expect(isInsane(s)).toBe(true);
    expect(isInsane(createSanity())).toBe(false);
  });

  it('Almond Water restores 40, capped', () => {
    const s = createSanity();
    s.value = 30;
    drinkAlmondWater(s);
    expect(s.value).toBe(30 + ALMOND_WATER);
    drinkAlmondWater(s);
    drinkAlmondWater(s);
    expect(s.value).toBe(SANITY_MAX);
  });
});

describe('distortionFromSanity', () => {
  it('is 0 while sane, rises steadily, and is 1 at 0', () => {
    expect(distortionFromSanity(100)).toBe(0);
    expect(distortionFromSanity(60)).toBe(0);
    expect(distortionFromSanity(0)).toBe(1);
    const mid = distortionFromSanity(30);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(distortionFromSanity(20)).toBeGreaterThan(mid);
  });
});

describe('fear', () => {
  it('drains near entities and more while a Smiler is in view', () => {
    const player = { x: 10, z: 10 };
    expect(fearDrain([], player, false)).toBe(0);
    expect(fearDrain([{ pos: { x: 12, z: 10 } }], player, false)).toBe(NEAR_ENTITY_DRAIN);
    expect(fearDrain([{ pos: { x: 60, z: 10 } }], player, false)).toBe(0);
    expect(fearDrain([{ pos: { x: 12, z: 10 } }], player, true)).toBe(NEAR_ENTITY_DRAIN + SMILER_SIGHT_DRAIN);
  });

  it('adds fear to the drain, and jolts subtract instantly without going below 0', () => {
    const s = createSanity();
    updateSanity(s, 1, { dark: false, nightVision: false, fear: 2 });
    expect(s.value).toBeCloseTo(SANITY_MAX - 2 + LIGHT_REGEN, 6);
    jolt(s, 3);
    expect(s.value).toBeCloseTo(SANITY_MAX - 5 + LIGHT_REGEN, 6);
    jolt(s, 500);
    expect(s.value).toBe(0);
  });
});
