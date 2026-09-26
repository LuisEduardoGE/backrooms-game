import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { PropPlacement } from '../../src/world/furnishing';
import { placementMatrix } from '../../src/world/propModels';

/** World box of a model (x ∈ ±w/2, y ∈ [0, h], z ∈ ±d/2, as models are normalised) placed by p. */
function worldBox(p: PropPlacement, size: { w: number; h: number; d: number }) {
  const box = new THREE.Box3(new THREE.Vector3(-size.w / 2, 0, -size.d / 2), new THREE.Vector3(size.w / 2, size.h, size.d / 2));
  return box.applyMatrix4(placementMatrix(p, size));
}
const base: PropPlacement = { kind: 'schoolChair', theme: 'stray', room: 0, cell: { x: 2, y: 2 }, x: 5, y: 0, z: 5, yaw: 0.7, tilt: 0, collide: null };
const size = { w: 0.57, h: 1.01, d: 0.68 };

describe('placementMatrix', () => {
  it('stands an upright prop on the floor at its spot', () => {
    const b = worldBox(base, size);
    expect(b.min.y).toBeCloseTo(0, 6);
    expect(b.max.y).toBeCloseTo(size.h, 6);
  });

  it('lays a knocked-over prop on its side: resting on the floor, not sunk in or floating, centred on its spot', () => {
    const b = worldBox({ ...base, tilt: Math.PI / 2 }, size);
    expect(b.min.y).toBeCloseTo(0, 6);
    expect(b.max.y).toBeCloseTo(size.d, 6);
    const c = b.getCenter(new THREE.Vector3());
    expect(c.x).toBeCloseTo(5, 6);
    expect(c.z).toBeCloseTo(5, 6);
  });

  it('stacks on top of what it stands on', () => {
    const b = worldBox({ ...base, y: 0.79 }, size);
    expect(b.min.y).toBeCloseTo(0.79, 6);
  });
});
