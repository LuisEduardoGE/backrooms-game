import type { Grid } from '../world/grid';
import { type ExtraSolids, moveWithCollision, PLAYER_RADIUS, type Vec2 } from './collision';

export type Gait = 'walk' | 'sprint' | 'crouch';

/** Top speeds (m/s). Sprint is a jog, not a glide. */
export const SPEED: Record<Gait, number> = { walk: 2.5, sprint: 3.6, crouch: 1.2 };
/** m/s² when speeding up (full sprint in ≈ 0.25 s) and when slowing down (stop in ≈ 0.18 s). */
export const ACCEL = 14;
export const DECEL = 20;
export const EYE_HEIGHT = { stand: 1.6, crouch: 1.0 } as const;
/** Metres per second the eye moves toward its target height. */
const EYE_LERP_SPEED = 4;
export const MAX_PITCH = 1.45;
/** Below this speed (m/s) the player counts as standing still. */
const MOVING_EPS = 0.05;
/** Seconds per footstep by gait — matches src/game/noise.ts so the bob lands on the step sounds. */
const STEP_SEC: Record<Gait, number> = { crouch: 0.8, walk: 0.55, sprint: 0.35 };
/** Peak head-bob drop (m) and roll (rad) at each gait's full speed. */
const BOB_DROP: Record<Gait, number> = { crouch: 0.012, walk: 0.022, sprint: 0.045 };
const BOB_ROLL = 0.01;

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
  /** Current velocity (m/s); eases toward the input direction × gait speed. */
  vel: Vec2;
  yaw: number;
  pitch: number;
  gait: Gait;
  moving: boolean;
  eyeHeight: number;
  prevEyeHeight: number;
  /** Head-bob cycle phase (radians; one half-cycle per footstep). */
  bobPhase: number;
  /** 0..1 how strongly the head bobs right now (eases with speed). */
  bobAmount: number;
}

export function createPlayer(pos: Vec2, yaw = 0): PlayerState {
  return {
    pos: { ...pos },
    prevPos: { ...pos },
    vel: { x: 0, z: 0 },
    yaw,
    pitch: 0,
    gait: 'walk',
    moving: false,
    eyeHeight: EYE_HEIGHT.stand,
    prevEyeHeight: EYE_HEIGHT.stand,
    bobPhase: 0,
    bobAmount: 0,
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Applies mouse look (radians). Called once per rendered frame so looking is never quantised to fixed steps. */
export function applyLook(p: PlayerState, lookDX: number, lookDY: number): void {
  p.yaw -= lookDX;
  p.pitch = clamp(p.pitch - lookDY, -MAX_PITCH, MAX_PITCH);
}

export function updatePlayer(p: PlayerState, input: MoveInput, dt: number, grid: Grid, extra?: ExtraSolids): PlayerState {
  applyLook(p, input.lookDX, input.lookDY);
  p.prevPos = { ...p.pos };
  p.prevEyeHeight = p.eyeHeight;

  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  let mx = input.forward * -sin + input.right * cos;
  let mz = input.forward * -cos + input.right * -sin;
  const len = Math.hypot(mx, mz);
  const wantsToMove = len > 1e-6;
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  p.gait = input.crouch ? 'crouch' : input.sprint && wantsToMove ? 'sprint' : 'walk';

  // Momentum: ease the velocity toward the target, faster when slowing down.
  const speed = SPEED[p.gait];
  const tx = mx * speed;
  const tz = mz * speed;
  const dvx = tx - p.vel.x;
  const dvz = tz - p.vel.z;
  const dv = Math.hypot(dvx, dvz);
  if (dv > 0) {
    const rate = Math.hypot(tx, tz) >= Math.hypot(p.vel.x, p.vel.z) ? ACCEL : DECEL;
    const k = Math.min(1, (rate * dt) / dv);
    p.vel = { x: p.vel.x + dvx * k, z: p.vel.z + dvz * k };
  }

  const vSpeed = Math.hypot(p.vel.x, p.vel.z);
  p.moving = vSpeed > MOVING_EPS;
  if (!wantsToMove && !p.moving) p.vel = { x: 0, z: 0 };
  if (p.moving) {
    const want = { x: p.vel.x * dt, z: p.vel.z * dt };
    const next = moveWithCollision(grid, p.pos, want.x, want.z, PLAYER_RADIUS, extra);
    // Blocked on an axis → that part of the momentum is spent on the wall, not stored.
    if (Math.abs(next.x - p.pos.x) < Math.abs(want.x) - 1e-6) p.vel = { x: 0, z: p.vel.z };
    if (Math.abs(next.z - p.pos.z) < Math.abs(want.z) - 1e-6) p.vel = { x: p.vel.x, z: 0 };
    p.pos = next;
  }

  // Head bob: one half-cycle per footstep, strength following actual speed.
  const bobTarget = p.moving ? clamp(vSpeed / SPEED[p.gait], 0, 1) : 0;
  p.bobAmount += clamp(bobTarget - p.bobAmount, -dt * 6, dt * 6);
  if (p.moving) p.bobPhase += (Math.PI / STEP_SEC[p.gait]) * dt * clamp(vSpeed / SPEED[p.gait], 0, 1);

  const target = p.gait === 'crouch' ? EYE_HEIGHT.crouch : EYE_HEIGHT.stand;
  const maxStep = EYE_LERP_SPEED * dt;
  p.eyeHeight += clamp(target - p.eyeHeight, -maxStep, maxStep);
  return p;
}

/** Camcorder-in-hand motion: a small dip on each footstep and a slight sway. Zero when still. */
export function headBob(p: PlayerState): { y: number; roll: number } {
  if (p.bobAmount < 1e-4) return { y: 0, roll: 0 };
  return {
    y: -Math.abs(Math.sin(p.bobPhase)) * BOB_DROP[p.gait] * p.bobAmount,
    roll: Math.sin(p.bobPhase) * BOB_ROLL * p.bobAmount,
  };
}
