/** Mouse look sensitivity in radians per pixel of (raw, unaccelerated) mouse movement. */
export const DEFAULT_SENSITIVITY = 0.0018;
export const MIN_SENSITIVITY = 0.0006;
export const MAX_SENSITIVITY = 0.006;
const STEP = 1.15;

const clamp = (v: number) => Math.min(MAX_SENSITIVITY, Math.max(MIN_SENSITIVITY, v));

/** `[` / `]` nudge sensitivity down / up by ~15%. */
export function nudgeSensitivity(current: number, dir: 1 | -1): number {
  return clamp(dir > 0 ? current * STEP : current / STEP);
}

/** A saved value from localStorage, or the default for anything missing, junk or out of range. */
export function parseSensitivity(raw: string | null): number {
  const v = raw === null ? NaN : Number(raw);
  return Number.isFinite(v) && v >= MIN_SENSITIVITY && v <= MAX_SENSITIVITY ? v : DEFAULT_SENSITIVITY;
}

export function sensitivityLabel(v: number): string {
  return `MOUSE ${(v * 1000).toFixed(1)}`;
}
