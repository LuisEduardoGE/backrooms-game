import { describe, expect, it } from 'vitest';
import { findInteractable, INTERACT_RANGE, promptFor } from '../../src/game/interact';
import type { Item } from '../../src/world/items';

// Cell (5,5) has its centre at world (11, 11).
const battery: Item = { id: 0, kind: 'battery', cell: { x: 5, y: 5 }, note: null };
const water: Item = { id: 1, kind: 'almondWater', cell: { x: 5, y: 4 }, note: null }; // centre (11, 9)
const none = new Set<number>();

describe('findInteractable', () => {
  it('finds an item in front of the player within range', () => {
    // Standing 1.2 m south of the battery, looking north (yaw 0 = −z).
    expect(findInteractable([battery], none, { x: 11, z: 12.2 }, 0)).toBe(battery);
  });

  it('ignores items behind the player or out of range', () => {
    expect(findInteractable([battery], none, { x: 11, z: 12.2 }, Math.PI)).toBeNull();
    expect(findInteractable([battery], none, { x: 11, z: 11 + INTERACT_RANGE + 0.1 }, 0)).toBeNull();
  });

  it('allows an item right underfoot whatever the facing', () => {
    expect(findInteractable([battery], none, { x: 11, z: 11.3 }, Math.PI)).toBe(battery);
  });

  it('never offers a taken item', () => {
    expect(findInteractable([battery], new Set([0]), { x: 11, z: 12.2 }, 0)).toBeNull();
  });

  it('prefers the nearest candidate', () => {
    expect(findInteractable([water, battery], none, { x: 11, z: 12.2 }, 0)).toBe(battery);
  });
});

describe('promptFor', () => {
  it('names the action for each kind', () => {
    expect(promptFor('battery')).toBe('[E] TAKE BATTERY');
    expect(promptFor('almondWater')).toBe('[E] DRINK ALMOND WATER');
    expect(promptFor('note')).toBe('[E] READ NOTE');
  });
});
