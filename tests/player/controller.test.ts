import { describe, expect, it } from 'vitest';
import {
  applyLook, createPlayer, EYE_HEIGHT, MAX_PITCH, type MoveInput, NO_INPUT, SPEED, updatePlayer,
} from '../../src/player/controller';
import { Cell, createGrid, setCell } from '../../src/world/grid';

const open = (() => {
  const g = createGrid(20, 20);
  for (let y = 1; y < 19; y++) for (let x = 1; x < 19; x++) setCell(g, x, y, Cell.Floor);
  return g;
})();

const input = (over: Partial<MoveInput>): MoveInput => ({ ...NO_INPUT, ...over });

function run(p: ReturnType<typeof createPlayer>, i: MoveInput, steps: number, dt = 0.1) {
  for (let s = 0; s < steps; s++) updatePlayer(p, i, dt, open);
  return p;
}

describe('updatePlayer', () => {
  it('moves toward -z when walking forward at yaw 0', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ forward: 1 }), 10);
    expect(p.pos.z).toBeCloseTo(20 - SPEED.walk, 5);
    expect(p.pos.x).toBeCloseTo(20, 5);
  });

  it('moves toward -x when walking forward at yaw π/2', () => {
    const p = run(createPlayer({ x: 20, z: 20 }, Math.PI / 2), input({ forward: 1 }), 10);
    expect(p.pos.x).toBeCloseTo(20 - SPEED.walk, 5);
  });

  it('strafes right toward +x at yaw 0', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ right: 1 }), 10);
    expect(p.pos.x).toBeCloseTo(20 + SPEED.walk, 5);
  });

  it('does not move faster diagonally', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ forward: 1, right: 1 }), 10);
    expect(Math.hypot(p.pos.x - 20, p.pos.z - 20)).toBeCloseTo(SPEED.walk, 5);
  });

  it('sprints faster, and crouch overrides sprint', () => {
    const sprinter = run(createPlayer({ x: 20, z: 20 }), input({ forward: 1, sprint: true }), 4);
    expect(sprinter.gait).toBe('sprint');
    expect(20 - sprinter.pos.z).toBeCloseTo(SPEED.sprint * 0.4, 5);

    const croucher = run(createPlayer({ x: 20, z: 20 }), input({ forward: 1, sprint: true, crouch: true }), 4);
    expect(croucher.gait).toBe('crouch');
    expect(20 - croucher.pos.z).toBeCloseTo(SPEED.crouch * 0.4, 5);
  });

  it('is not sprinting while standing still', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ sprint: true }), 1);
    expect(p.moving).toBe(false);
    expect(p.gait).toBe('walk');
  });

  it('turns right on positive lookDX and clamps pitch', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ lookDX: 0.5, lookDY: 10 }), 1);
    expect(p.yaw).toBeCloseTo(-0.5, 5);
    expect(p.pitch).toBe(-MAX_PITCH);
  });

  it('lowers the eye smoothly when crouching', () => {
    const p = createPlayer({ x: 20, z: 20 });
    updatePlayer(p, input({ crouch: true }), 0.05, open);
    expect(p.eyeHeight).toBeLessThan(EYE_HEIGHT.stand);
    expect(p.eyeHeight).toBeGreaterThan(EYE_HEIGHT.crouch);
    run(p, input({ crouch: true }), 10);
    expect(p.eyeHeight).toBeCloseTo(EYE_HEIGHT.crouch, 5);
  });

  it('is stopped by walls', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ right: 1, sprint: true }), 100);
    expect(p.pos.x).toBeCloseTo(38 - 0.3, 3);
  });

  it('remembers the previous position and eye height for render interpolation', () => {
    const p = createPlayer({ x: 20, z: 20 });
    updatePlayer(p, input({ forward: 1, crouch: true }), 0.1, open);
    expect(p.prevPos).toEqual({ x: 20, z: 20 });
    expect(p.prevEyeHeight).toBe(EYE_HEIGHT.stand);
    const before = { ...p.pos };
    updatePlayer(p, input({ forward: 1 }), 0.1, open);
    expect(p.prevPos).toEqual(before);
  });
});

describe('applyLook', () => {
  it('turns and clamps pitch without moving the player', () => {
    const p = createPlayer({ x: 20, z: 20 });
    applyLook(p, 0.25, -10);
    expect(p.yaw).toBeCloseTo(-0.25, 6);
    expect(p.pitch).toBe(MAX_PITCH);
    expect(p.pos).toEqual({ x: 20, z: 20 });
  });
});
