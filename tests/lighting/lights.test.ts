import { describe, expect, it } from 'vitest';
import {
  flicker, FLICKER_RATE, isFaultyLight, isLightCell, lightFalloff, nearestLitLights, nearestLitLightsAt, panelGlow,
  panelLevel, roomLightFactor, sceneExposure,
} from '../../src/lighting/lights';
import { Cell, createGrid, setCell } from '../../src/world/grid';

describe('isLightCell', () => {
  /** A big open floor, to look at the placement statistically. */
  const big = createGrid(120, 120);
  for (let y = 1; y < 119; y++) for (let x = 1; x < 119; x++) setCell(big, x, y, Cell.Floor);

  it('never puts a panel over a wall or a pillar', () => {
    const g = createGrid(8, 8);
    for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) setCell(g, x, y, Cell.Floor);
    setCell(g, 4, 4, Cell.Pillar);
    expect(isLightCell(g, 0, 0)).toBe(false);
    expect(isLightCell(g, 4, 4)).toBe(false);
  });

  it('is sparse: "inconsistently-placed" panels over roughly a third of the floor', () => {
    let lit = 0;
    for (let y = 1; y < 119; y++) for (let x = 1; x < 119; x++) if (isLightCell(big, x, y)) lit++;
    const frac = lit / (118 * 118);
    expect(frac).toBeGreaterThan(0.2);
    expect(frac).toBeLessThan(0.45);
  });

  it('clusters: some 10×10 areas are well lit and others gloomy (not a uniform sprinkle)', () => {
    const fracs: number[] = [];
    for (let by = 0; by < 11; by++) {
      for (let bx = 0; bx < 11; bx++) {
        let lit = 0;
        for (let y = 1 + by * 10; y < 11 + by * 10; y++) for (let x = 1 + bx * 10; x < 11 + bx * 10; x++) if (isLightCell(big, x, y)) lit++;
        fracs.push(lit / 100);
      }
    }
    expect(Math.max(...fracs)).toBeGreaterThan(0.5);
    expect(Math.min(...fracs)).toBeLessThan(0.15);
  });
});

describe('nearestLitLights', () => {
  const g = createGrid(40, 40);
  for (let y = 1; y < 39; y++) for (let x = 1; x < 39; x++) setCell(g, x, y, Cell.Floor);
  const d = (p: { x: number; y: number }) => Math.hypot(p.x - 19, p.y - 19);

  it('returns lit panels only, nearest first', () => {
    const found = nearestLitLights(g, 19, 19, 6, 12);
    expect(found.length).toBeGreaterThan(0);
    for (const p of found) expect(isLightCell(g, p.x, p.y)).toBe(true);
    for (let i = 1; i < found.length; i++) expect(d(found[i])).toBeGreaterThanOrEqual(d(found[i - 1]));
  });

  it('skips lights in dark zones', () => {
    const dark = createGrid(40, 40);
    for (let y = 1; y < 39; y++) for (let x = 1; x < 39; x++) setCell(dark, x, y, Cell.Floor);
    const first = nearestLitLights(dark, 19, 19, 1, 12)[0];
    dark.dark[first.y * 40 + first.x] = 1;
    expect(nearestLitLights(dark, 19, 19, 4, 12)).not.toContainEqual(first);
  });

  it('respects the count and radius limits', () => {
    expect(nearestLitLights(g, 19, 19, 2, 12)).toHaveLength(2);
    for (const p of nearestLitLights(g, 19, 19, 50, 3)) expect(Math.max(Math.abs(p.x - 19), Math.abs(p.y - 19))).toBeLessThanOrEqual(3);
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
  const g = createGrid(40, 40);
  for (let y = 1; y < 39; y++) for (let x = 1; x < 39; x++) setCell(g, x, y, Cell.Floor);

  it('ranks fixtures by exact world distance', () => {
    const [a, b] = nearestLitLightsAt(g, 38.9, 37.3, 2, 12);
    const dist = (p: { x: number; y: number }) => Math.hypot((p.x + 0.5) * 2 - 38.9, (p.y + 0.5) * 2 - 37.3);
    expect(dist(a)).toBeLessThanOrEqual(dist(b));
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

describe('roomLightFactor', () => {
  it('makes some rooms dim, most normal and some brightly lit', () => {
    const f = Array.from({ length: 400 }, (_, id) => roomLightFactor(id));
    const dim = f.filter((v) => v < 0.6).length / f.length;
    const bright = f.filter((v) => v > 1.2).length / f.length;
    expect(dim).toBeGreaterThan(0.1);
    expect(dim).toBeLessThan(0.35);
    expect(bright).toBeGreaterThan(0.1);
    expect(bright).toBeLessThan(0.35);
  });

  it('leaves spaces with no room (doorways, corridors) at the neutral density', () => {
    expect(roomLightFactor(-1)).toBe(1);
  });
});
