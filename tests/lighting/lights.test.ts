import { describe, expect, it } from 'vitest';
import {
  flicker, FLICKER_RATE, isFaultyLight, isLightCell, lightFalloff, nearestLitLights, nearestLitLightsAt, panelGlow,
  panelLevel, sceneExposure,
} from '../../src/lighting/lights';
import { Cell, createGrid, setCell } from '../../src/world/grid';

describe('isLightCell', () => {
  const g = createGrid(8, 8);
  for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) setCell(g, x, y, Cell.Floor);
  setCell(g, 4, 4, Cell.Pillar);

  it('hangs a panel over every floor cell (dense 2 m grid, Kane Pixels style)', () => {
    expect(isLightCell(g, 2, 2)).toBe(true);
    expect(isLightCell(g, 3, 2)).toBe(true);
    expect(isLightCell(g, 5, 6)).toBe(true);
  });

  it('skips walls and pillars', () => {
    expect(isLightCell(g, 0, 0)).toBe(false);
    expect(isLightCell(g, 4, 4)).toBe(false);
  });
});

describe('nearestLitLights', () => {
  const g = createGrid(20, 20);
  for (let y = 1; y < 19; y++) for (let x = 1; x < 19; x++) setCell(g, x, y, Cell.Floor);

  it('returns the closest light cells, ties ordered by y then x', () => {
    expect(nearestLitLights(g, 9, 9, 5)).toEqual([
      { x: 9, y: 9 },
      { x: 9, y: 8 },
      { x: 8, y: 9 },
      { x: 10, y: 9 },
      { x: 9, y: 10 },
    ]);
  });

  it('skips lights in dark zones', () => {
    const dark = createGrid(20, 20);
    for (let y = 1; y < 19; y++) for (let x = 1; x < 19; x++) setCell(dark, x, y, Cell.Floor);
    dark.dark[9 * 20 + 9] = 1;
    expect(nearestLitLights(dark, 9, 9, 4)).not.toContainEqual({ x: 9, y: 9 });
  });

  it('respects the count and radius limits', () => {
    expect(nearestLitLights(g, 9, 9, 2)).toHaveLength(2);
    expect(nearestLitLights(g, 9, 9, 50, 1)).toHaveLength(9);
  });
});

describe('flicker', () => {
  const seed = 42;
  const faultyId = Array.from({ length: 500 }, (_, i) => i).find((i) => isFaultyLight(i, seed));
  const healthyId = Array.from({ length: 500 }, (_, i) => i).find((i) => !isFaultyLight(i, seed));

  it('has both faulty and healthy lights', () => {
    expect(faultyId).toBeDefined();
    expect(healthyId).toBeDefined();
  });

  it('keeps healthy lights near full brightness', () => {
    for (let t = 0; t < 10; t += 0.05) {
      const v = flicker(t, healthyId!, seed);
      expect(v).toBeGreaterThanOrEqual(0.96);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('makes faulty lights dip and recover', () => {
    const values = Array.from({ length: 200 }, (_, i) => flicker(i * 0.05, faultyId!, seed));
    expect(values.some((v) => v < 0.6)).toBe(true);
    expect(values.some((v) => v === 1)).toBe(true);
    expect(values.every((v) => v > 0)).toBe(true);
  });

  it('is deterministic', () => {
    expect(flicker(3.21, 7, seed)).toBe(flicker(3.21, 7, seed));
  });
});

describe('flicker safety', () => {
  it('changes brightness at most FLICKER_RATE times per second, and FLICKER_RATE ≤ 5 (flashes stay under 3 Hz)', () => {
    expect(FLICKER_RATE).toBeLessThanOrEqual(5);
    const seed = 42;
    const id = Array.from({ length: 500 }, (_, i) => i).find((i) => isFaultyLight(i, seed))!;
    let changes = 0;
    let prev = flicker(0, id, seed);
    for (let t = 0.01; t < 10; t += 0.01) {
      const v = flicker(t, id, seed);
      if (v !== prev) changes++;
      prev = v;
    }
    expect(changes).toBeLessThanOrEqual(FLICKER_RATE * 10);
  });
});

describe('lightFalloff', () => {
  it('is full near the player and fades to zero before a pooled light can be swapped out', () => {
    expect(lightFalloff(0)).toBe(1);
    expect(lightFalloff(2)).toBe(1);
    expect(lightFalloff(3.5)).toBeCloseTo(0.5, 6);
    expect(lightFalloff(5)).toBe(0);
    expect(lightFalloff(9)).toBe(0);
  });
});

describe('nearestLitLightsAt', () => {
  const g = createGrid(20, 20);
  for (let y = 1; y < 19; y++) for (let x = 1; x < 19; x++) setCell(g, x, y, Cell.Floor);

  it('ranks fixtures by exact world distance', () => {
    // Near the right edge of cell 7: its own panel (x=15 m) is 0.9 m away, cell 8's (x=17 m) 1.1 m.
    expect(nearestLitLightsAt(g, 15.9, 17, 2)).toEqual([{ x: 7, y: 8 }, { x: 8, y: 8 }]);
  });
});

describe('panelGlow', () => {
  it('dims the ceiling panels along with the lights, so a blackout never looks like a rendering bug', () => {
    expect(panelGlow(false, false)).toBe(1);
    expect(panelGlow(false, true)).toBeLessThan(0.5);
    expect(panelGlow(true, false)).toBeLessThan(panelGlow(false, true));
    expect(panelGlow(true, true)).toBe(panelGlow(true, false));
  });
});

describe('panelLevel', () => {
  it('keeps dead (dark-zone) panels dead whatever happens', () => {
    expect(panelLevel(0.06, 3, 7, 1, false, false)).toBe(0.06);
    expect(panelLevel(0.06, 3, 7, 1, true, true)).toBe(0.06);
  });

  it('flickers a lit panel, and dims or kills it with the Howler warning or a blackout', () => {
    const healthy = Array.from({ length: 40 }, (_, i) => i).find((id) => !isFaultyLight(id, 1))!;
    expect(panelLevel(1, 2, healthy, 1, false, false)).toBeCloseTo(flicker(2, healthy, 1), 9);
    expect(panelLevel(1, 2, healthy, 1, false, true)).toBeCloseTo(flicker(2, healthy, 1) * panelGlow(false, true), 9);
    expect(panelLevel(1, 2, healthy, 1, true, false)).toBe(panelGlow(true, false));
  });
});

describe('sceneExposure', () => {
  it('is 1 normally, darker during the Howler warning, darkest in a blackout', () => {
    expect(sceneExposure(false, false, 1)).toBe(1);
    expect(sceneExposure(false, true, 1)).toBeLessThan(0.7);
    expect(sceneExposure(true, false, 1)).toBeLessThan(sceneExposure(false, true, 1));
  });

  it('dips a little when the panel overhead flickers, never to darkness', () => {
    const dip = sceneExposure(false, false, 0.15);
    expect(dip).toBeLessThan(1);
    expect(dip).toBeGreaterThan(0.75);
  });
});
