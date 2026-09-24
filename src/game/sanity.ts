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
/** Entities this close (cells) wear the player down. */
export const NEAR_ENTITY_CELLS = 8;
export const NEAR_ENTITY_DRAIN = 0.8;
/** Extra drain per second while a Smiler is in view. */
export const SMILER_SIGHT_DRAIN = 2;
const CELL_METRES = 2;

/** Hidden 0–100 meter; the player only ever sees its effects. */
export interface Sanity {
  value: number;
}

export function createSanity(): Sanity {
  return { value: SANITY_MAX };
}

export function updateSanity(s: Sanity, dt: number, env: { dark: boolean; nightVision: boolean; fear?: number }): void {
  const base = env.dark ? -DARK_DRAIN * (env.nightVision ? NIGHT_VISION_DRAIN_FACTOR : 1) : LIGHT_REGEN;
  const delta = base - (env.fear ?? 0);
  s.value = Math.min(SANITY_MAX, Math.max(0, s.value + delta * dt));
}

/** Extra drain per second from nearby entities and a visible Smiler. */
export function fearDrain(
  entities: readonly { pos: { x: number; z: number } }[],
  player: { x: number; z: number },
  seesSmiler: boolean,
): number {
  const near = entities.some((e) => Math.hypot(e.pos.x - player.x, e.pos.z - player.z) / CELL_METRES <= NEAR_ENTITY_CELLS);
  return (near ? NEAR_ENTITY_DRAIN : 0) + (seesSmiler ? SMILER_SIGHT_DRAIN : 0);
}

/** A sudden scare. */
export function jolt(s: Sanity, amount: number): void {
  s.value = Math.max(0, s.value - amount);
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
