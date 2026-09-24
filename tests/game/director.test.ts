import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { createDirector, type DirectorEvent, HOWLER_PHASE_SEC, SMILER_PHASE_SEC, updateDirector } from '../../src/game/director';
import { NOISE_RADIUS } from '../../src/game/noise';

function run(seconds: number, footstepEvery: number | null, radius = NOISE_RADIUS.walk) {
  const rng = createRng(1);
  const d = createDirector(rng);
  const events: { t: number; e: DirectorEvent }[] = [];
  const dt = 0.05;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const step = footstepEvery !== null && i % Math.round(footstepEvery / dt) === 0 ? radius : null;
    for (const e of updateDirector(d, dt, step, rng)) events.push({ t: d.time, e });
  }
  return events;
}

describe('updateDirector', () => {
  it('spawns Smilers once at 3 minutes and the Howler once at 8 minutes for a quiet player', () => {
    const events = run(HOWLER_PHASE_SEC + 5, 0.55);
    const smilers = events.filter((x) => x.e === 'spawnSmilers');
    const howler = events.filter((x) => x.e === 'spawnHowler');
    expect(smilers).toHaveLength(1);
    expect(smilers[0].t).toBeCloseTo(SMILER_PHASE_SEC, 0);
    expect(howler).toHaveLength(1);
    expect(howler[0].t).toBeCloseTo(HOWLER_PHASE_SEC, 0);
  });

  it('brings the Howler early for a player who keeps sprinting', () => {
    const howler = run(HOWLER_PHASE_SEC, 0.35, NOISE_RADIUS.sprint).filter((x) => x.e === 'spawnHowler');
    expect(howler).toHaveLength(1);
    expect(howler[0].t).toBeLessThan(200);
  });

  it('fires the Presence every 20–40 seconds from the start', () => {
    const times = run(300, null).filter((x) => x.e === 'presence').map((x) => x.t);
    expect(times.length).toBeGreaterThanOrEqual(7);
    expect(times[0]).toBeGreaterThanOrEqual(20);
    expect(times[0]).toBeLessThanOrEqual(40);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(19.9);
      expect(times[i] - times[i - 1]).toBeLessThanOrEqual(40.1);
    }
  });
});
