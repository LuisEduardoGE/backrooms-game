import type { Rng } from '../core/rng';
import type { Gait } from '../player/controller';

/** Metres from a lit panel within which its hum is loudest. */
export const HUM_RANGE = 6;
const HUM_MAX = 0.2;
const HUM_FLOOR = 0.25;

/** Fluorescent hum: loud under a panel, a distant drone elsewhere in the light, silence in the dark. */
export function humLevel(distToLitPanel: number | null, blackout: boolean): number {
  if (blackout || distToLitPanel === null) return 0;
  const near = Math.max(0, 1 - distToLitPanel / HUM_RANGE);
  return HUM_MAX * (HUM_FLOOR + (1 - HUM_FLOOR) * near);
}

const FOOTSTEP: Record<Gait, number> = { crouch: 0.06, walk: 0.3, sprint: 0.55 };

export function footstepLevel(gait: Gait): number {
  return FOOTSTEP[gait];
}

const WHISPER_START = 0.15;
const WHISPER_MAX = 0.3;

/** Whispers creep in as the tape warps (distortion 0..1). */
export function whisperLevel(distortion: number): number {
  if (distortion <= WHISPER_START) return 0;
  return WHISPER_MAX * Math.min(1, (distortion - WHISPER_START) / (1 - WHISPER_START));
}

/** Phantom-footstep chance per audible step: rare while sane, frequent near collapse (spec §6). */
export const ECHO_CHANCE = { sane: 0.05, insane: 0.35 } as const;

export interface Echo {
  delaySec: number;
  x: number;
  z: number;
}

/** The Presence: sometimes a footstep is answered from behind, a moment later — more often as sanity goes. */
export function maybeEcho(
  rng: Rng,
  footstepRadius: number,
  pos: { x: number; z: number },
  yaw: number,
  distortion: number,
): Echo | null {
  if (footstepRadius <= 0) return null;
  const chance = ECHO_CHANCE.sane + (ECHO_CHANCE.insane - ECHO_CHANCE.sane) * Math.min(1, Math.max(0, distortion));
  if (!rng.chance(chance)) return null;
  const dist = rng.range(6, 10);
  const spread = rng.range(-0.5, 0.5);
  // Behind = opposite of forward (−sin yaw, −cos yaw), with a little sideways spread.
  const bx = Math.sin(yaw + spread);
  const bz = Math.cos(yaw + spread);
  return { delaySec: rng.range(0.3, 0.5), x: pos.x + bx * dist, z: pos.z + bz * dist };
}
