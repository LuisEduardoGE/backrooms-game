import type { Grid } from '../world/grid';
import { moveWithCollision, type Vec2 } from './collision';

export type Gait = 'walk' | 'sprint' | 'crouch';

export const SPEED: Record<Gait, number> = { walk: 2.2, sprint: 4.5, crouch: 1.1 };
export const EYE_HEIGHT = { stand: 1.6, crouch: 1.0 } as const;
/** Metres per second the eye moves toward its target height. */
const EYE_LERP_SPEED = 4;
export const MAX_PITCH = 1.45;

export interface MoveInput {
  /** -1..1, positive = forward */
  forward: number;
  /** -1..1, positive = right */
  right: number;
  sprint: boolean;
  crouch: boolean;
  /** Radians this step; positive turns right. */
  lookDX: number;
  /** Radians this step; positive looks down. */
  lookDY: number;
}

export const NO_INPUT: MoveInput = Object.freeze({
  forward: 0, right: 0, sprint: false, crouch: false, lookDX: 0, lookDY: 0,
});

export interface PlayerState {
  pos: Vec2;
  /** Position before the latest fixed step (for render interpolation). */
  prevPos: Vec2;
  yaw: number;
  pitch: number;
  gait: Gait;
  moving: boolean;
  eyeHeight: number;
  prevEyeHeight: number;
}

export function createPlayer(pos: Vec2, yaw = 0): PlayerState {
  return {
    pos: { ...pos },
    prevPos: { ...pos },
    yaw,
    pitch: 0,
    gait: 'walk',
    moving: false,
    eyeHeight: EYE_HEIGHT.stand,
    prevEyeHeight: EYE_HEIGHT.stand,
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Applies mouse look (radians). Called once per rendered frame so looking is never quantised to fixed steps. */
export function applyLook(p: PlayerState, lookDX: number, lookDY: number): void {
  p.yaw -= lookDX;
  p.pitch = clamp(p.pitch - lookDY, -MAX_PITCH, MAX_PITCH);
}

export function updatePlayer(p: PlayerState, input: MoveInput, dt: number, grid: Grid): PlayerState {
  applyLook(p, input.lookDX, input.lookDY);
  p.prevPos = { ...p.pos };
  p.prevEyeHeight = p.eyeHeight;

  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  let mx = input.forward * -sin + input.right * cos;
  let mz = input.forward * -cos + input.right * -sin;
  const len = Math.hypot(mx, mz);
  p.moving = len > 1e-6;
  if (len > 1) {
    mx /= len;
    mz /= len;
  }

  p.gait = input.crouch ? 'crouch' : input.sprint && p.moving ? 'sprint' : 'walk';
  if (p.moving) {
    const speed = SPEED[p.gait];
    p.pos = moveWithCollision(grid, p.pos, mx * speed * dt, mz * speed * dt);
  }

  const target = p.gait === 'crouch' ? EYE_HEIGHT.crouch : EYE_HEIGHT.stand;
  const maxStep = EYE_LERP_SPEED * dt;
  p.eyeHeight += clamp(target - p.eyeHeight, -maxStep, maxStep);
  return p;
}
