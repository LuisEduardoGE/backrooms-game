import { describe, expect, it } from 'vitest';
import { placeListener } from '../../src/audio/listener';

describe('placeListener', () => {
  it('uses AudioParams where the browser has them (Chrome, Safari)', () => {
    const p = () => ({ value: 0 });
    const L = { positionX: p(), positionY: p(), positionZ: p(), forwardX: p(), forwardY: p(), forwardZ: p(), upX: p(), upY: p(), upZ: p() };
    placeListener(L as unknown as AudioListener, 3, 1.6, 4, 0);
    expect(L.positionX.value).toBe(3);
    expect(L.positionZ.value).toBe(4);
    expect(L.forwardZ.value).toBeCloseTo(-1, 9);
    expect(L.upY.value).toBe(1);
  });

  it('falls back to setPosition/setOrientation where it does not (Firefox) instead of throwing', () => {
    const calls: string[] = [];
    const L = {
      setPosition: (x: number, y: number, z: number) => calls.push(`pos ${x} ${y} ${z}`),
      setOrientation: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) =>
        calls.push(`ori ${Math.round(fx)} ${fy} ${Math.round(fz)} ${ux} ${uy} ${uz}`),
    };
    expect(() => placeListener(L as unknown as AudioListener, 3, 1.6, 4, 0)).not.toThrow();
    expect(calls).toEqual(['pos 3 1.6 4', 'ori 0 0 -1 0 1 0']);
  });
});
