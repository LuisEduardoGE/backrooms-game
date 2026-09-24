import { describe, expect, it } from 'vitest';
import {
  addBattery, BATTERY_MAX, BATTERY_PICKUP, createCamcorder, DRAIN_NIGHT_VISION, DRAIN_PASSIVE, toggleNightVision, updateCamcorder,
} from '../../src/player/camcorder';

function run(c: ReturnType<typeof createCamcorder>, seconds: number, dt = 0.1) {
  for (let t = 0; t < seconds - 1e-9; t += dt) updateCamcorder(c, dt);
  return c;
}

describe('camcorder', () => {
  it('starts full, with night vision off', () => {
    expect(createCamcorder()).toEqual({ battery: BATTERY_MAX, nightVision: false, nvBlend: 0 });
  });

  it('drains slowly while recording', () => {
    const c = run(createCamcorder(), 10);
    expect(c.battery).toBeCloseTo(BATTERY_MAX - DRAIN_PASSIVE * 10, 6);
  });

  it('drains faster with night vision on', () => {
    const c = createCamcorder();
    expect(toggleNightVision(c)).toBe(true);
    run(c, 10);
    expect(c.battery).toBeCloseTo(BATTERY_MAX - (DRAIN_PASSIVE + DRAIN_NIGHT_VISION) * 10, 6);
  });

  it('toggles night vision off again', () => {
    const c = createCamcorder();
    toggleNightVision(c);
    expect(toggleNightVision(c)).toBe(false);
    expect(c.nightVision).toBe(false);
  });

  it('never drops below 0 and forces night vision off when empty', () => {
    const c = createCamcorder();
    toggleNightVision(c);
    run(c, 200);
    expect(c.battery).toBe(0);
    expect(c.nightVision).toBe(false);
  });

  it('refuses to turn night vision on with a dead battery', () => {
    const c = createCamcorder();
    c.battery = 0;
    expect(toggleNightVision(c)).toBe(false);
    expect(c.nightVision).toBe(false);
  });

  it('eases the night-vision blend in and out', () => {
    const c = createCamcorder();
    toggleNightVision(c);
    run(c, 0.1);
    expect(c.nvBlend).toBeCloseTo(0.4, 6);
    run(c, 0.5);
    expect(c.nvBlend).toBe(1);
    toggleNightVision(c);
    run(c, 0.1);
    expect(c.nvBlend).toBeCloseTo(0.6, 6);
  });
});

describe('addBattery', () => {
  it('adds a pickup worth of charge, capped at the max', () => {
    const c = createCamcorder();
    c.battery = 20;
    addBattery(c);
    expect(c.battery).toBe(20 + BATTERY_PICKUP);
    addBattery(c);
    addBattery(c);
    expect(c.battery).toBe(BATTERY_MAX);
  });
});
