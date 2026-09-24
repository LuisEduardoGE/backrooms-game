export const SANITY_MAX = 100;
/** Per second in a dark zone. */
export const DARK_DRAIN = 1.0;
/** Night vision makes the dark more bearable. */
export const NIGHT_VISION_DRAIN_FACTOR = 0.5;
/** Per second in lit areas. */
export const LIGHT_REGEN = 0.4;
export const ALMOND_WATER = 40;
/** Below this the tape starts to warp. */
export const DISTORTION_START = 60;

/** Hidden 0–100 meter; the player only ever sees its effects. */
export interface Sanity {
  value: number;
}

export function createSanity(): Sanity {
  return { value: SANITY_MAX };
}

export function updateSanity(s: Sanity, dt: number, env: { dark: boolean; nightVision: boolean }): void {
  const delta = env.dark ? -DARK_DRAIN * (env.nightVision ? NIGHT_VISION_DRAIN_FACTOR : 1) : LIGHT_REGEN;
  s.value = Math.min(SANITY_MAX, Math.max(0, s.value + delta * dt));
}

export function drinkAlmondWater(s: Sanity): void {
  s.value = Math.min(SANITY_MAX, s.value + ALMOND_WATER);
}

export function isInsane(s: Sanity): boolean {
  return s.value <= 0;
}

/** VHS distortion strength 0..1: none above DISTORTION_START, accelerating toward 1 at 0. */
export function distortionFromSanity(value: number): number {
  const t = Math.min(1, Math.max(0, (DISTORTION_START - value) / DISTORTION_START));
  return t ** 1.5;
}
