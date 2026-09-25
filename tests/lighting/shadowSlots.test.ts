import { describe, expect, it } from 'vitest';
import { createSlots, type Slot, updateSlots } from '../../src/lighting/shadowSlots';

const FADE = 4; // intensity units per second (1 → 0 in 0.25 s)

function step(slots: Slot[], wanted: { id: number; target: number }[], dt = 1 / 60, n = 1): Slot[] {
  for (let i = 0; i < n; i++) updateSlots(slots, wanted, dt, FADE);
  return slots;
}

describe('shadow light slots', () => {
  it('assigns free slots to the wanted panels and fades them in', () => {
    const slots = createSlots(4);
    step(slots, [{ id: 7, target: 1 }, { id: 9, target: 0.5 }], 1 / 60, 30);
    const byId = new Map(slots.map((s) => [s.id, s]));
    expect(byId.get(7)?.intensity).toBeCloseTo(1, 5);
    expect(byId.get(9)?.intensity).toBeCloseTo(0.5, 5);
    expect(slots.filter((s) => s.id === null)).toHaveLength(2);
  });

  it('never moves a lit slot to another panel: it fades out first (no popping)', () => {
    const slots = createSlots(1);
    step(slots, [{ id: 1, target: 1 }], 1 / 60, 30);
    // Panel 2 becomes the wanted one: slot keeps panel 1 while fading out.
    step(slots, [{ id: 2, target: 1 }], 1 / 60, 1);
    expect(slots[0].id).toBe(1);
    expect(slots[0].intensity).toBeLessThan(1);
    // Once dark it is reassigned and fades in on panel 2 — never jumping in brightness.
    let prev = slots[0].intensity;
    for (let i = 0; i < 60; i++) {
      step(slots, [{ id: 2, target: 1 }]);
      expect(Math.abs(slots[0].intensity - prev)).toBeLessThanOrEqual(FADE / 60 + 1e-9);
      prev = slots[0].intensity;
    }
    expect(slots[0].id).toBe(2);
    expect(slots[0].intensity).toBeCloseTo(1, 5);
  });

  it('follows flicker on an assigned panel immediately (flicker is the panel, not a swap)', () => {
    const slots = createSlots(1);
    step(slots, [{ id: 1, target: 1 }], 1 / 60, 30);
    step(slots, [{ id: 1, target: 0.2 }]);
    expect(slots[0].intensity).toBeCloseTo(0.2, 5);
  });
});
