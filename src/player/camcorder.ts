export const BATTERY_MAX = 100;
/** Percent per second while recording. */
export const DRAIN_PASSIVE = 0.3;
/** Extra percent per second while night vision is on. */
export const DRAIN_NIGHT_VISION = 1.5;
/** How fast the shader blend eases toward night vision (units per second ≈ 0.25 s fade). */
export const NV_FADE_SPEED = 4;
/** Below this percent the battery icon blinks and the tape glitches more. */
export const LOW_BATTERY = 15;

export interface Camcorder {
  battery: number;
  nightVision: boolean;
  /** 0..1, eased toward `nightVision` for the VHS shader and IR light. */
  nvBlend: number;
}

export function createCamcorder(): Camcorder {
  return { battery: BATTERY_MAX, nightVision: false, nvBlend: 0 };
}

/** Returns the new night-vision state. A dead battery can't power night vision. */
export function toggleNightVision(c: Camcorder): boolean {
  if (!c.nightVision && c.battery <= 0) return false;
  c.nightVision = !c.nightVision;
  return c.nightVision;
}

export function updateCamcorder(c: Camcorder, dt: number): void {
  const drain = DRAIN_PASSIVE + (c.nightVision ? DRAIN_NIGHT_VISION : 0);
  c.battery = Math.max(0, c.battery - drain * dt);
  if (c.battery <= 0) c.nightVision = false;

  const target = c.nightVision ? 1 : 0;
  const step = NV_FADE_SPEED * dt;
  c.nvBlend += Math.max(-step, Math.min(step, target - c.nvBlend));
}
