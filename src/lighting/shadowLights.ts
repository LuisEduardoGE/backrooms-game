import * as THREE from 'three';
import { WALL_HEIGHT } from '../world/grid';
import type { Slot } from './shadowSlots';

/** Full intensity of one panel's real light (candela-ish, physically based spot, decay 2). */
const PANEL_CANDELA = 24;
/** A troffer throws light in a wide cone below it; the penumbra softens its edge completely. */
const CONE = Math.PI / 2.3;
const RANGE = 9;
const SHADOW_MAP = 512;

/**
 * The real lights: a fixed pool of downward spotlights with soft shadow maps, parked on the panels
 * nearest the player (see shadowSlots). Walls, columns and the Howler cast real shadows from them,
 * and a flickering tube flickers its own shadows. Fixed count = no shader recompiles.
 */
export function createShadowLights(scene: THREE.Scene, count: number) {
  const lights = Array.from({ length: count }, () => {
    const light = new THREE.SpotLight(0xfff3da, 0, RANGE, CONE, 1, 2);
    light.castShadow = true;
    light.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = RANGE;
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.03;
    light.shadow.radius = 4;
    scene.add(light);
    scene.add(light.target);
    return light;
  });
  return {
    /** `positionOf(id)`: world position (x, z) of a panel by id. */
    update(slots: readonly Slot[], positionOf: (id: number) => { x: number; z: number } | undefined): void {
      slots.forEach((s, i) => {
        const light = lights[i];
        const p = s.id === null ? undefined : positionOf(s.id);
        // Never toggle .visible: a changing light count recompiles every shader (a hitch).
        if (!p || s.intensity <= 0) {
          light.intensity = 0;
          return;
        }
        light.position.set(p.x, WALL_HEIGHT - 0.06, p.z);
        light.target.position.set(p.x, 0, p.z);
        light.target.updateMatrixWorld();
        light.intensity = PANEL_CANDELA * s.intensity;
      });
    },
  };
}
