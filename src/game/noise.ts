import type { Gait } from '../player/controller';

/** How far (cells) a footstep carries. */
export const NOISE_RADIUS: Record<Gait, number> = { crouch: 0, walk: 6, sprint: 18 };
/** Seconds between footsteps. */
export const STEP_INTERVAL: Record<Gait, number> = { crouch: 0.8, walk: 0.55, sprint: 0.35 };

export interface NoiseEvent {
  /** World metres. */
  x: number;
  z: number;
  /** Cells. */
  radius: number;
}

export interface Footsteps {
  phase: number;
}

export function createFootsteps(): Footsteps {
  return { phase: 0 };
}

/** Advances the step cycle; returns the radius of a footstep that lands this tick, or null. */
export function stepFootsteps(f: Footsteps, dt: number, moving: boolean, gait: Gait): number | null {
  if (!moving) {
    f.phase = 0;
    return null;
  }
  f.phase += dt;
  const interval = STEP_INTERVAL[gait];
  if (f.phase < interval) return null;
  f.phase -= interval;
  return NOISE_RADIUS[gait];
}

/** How much a footstep counts toward summoning the Howler early: a sprint step is 9× a walking one. */
export function noiseWeight(radius: number): number {
  return (radius / NOISE_RADIUS.walk) ** 2;
}
