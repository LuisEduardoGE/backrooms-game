import { describe, expect, it } from 'vitest';
import {
  applyLook, createPlayer, EYE_HEIGHT, headBob, MAX_PITCH, type MoveInput, NO_INPUT, SPEED, updatePlayer,
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
  /** Direction and steady-state speed after 1 s of input (momentum ramps up in the first ~0.2 s). */
  const speed = (p: ReturnType<typeof createPlayer>) => Math.hypot(p.vel.x, p.vel.z);

  it('moves toward -z when walking forward at yaw 0', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ forward: 1 }), 60, 1 / 60);
    expect(p.pos.z).toBeLessThan(20 - SPEED.walk * 0.8);
    expect(p.pos.x).toBeCloseTo(20, 5);
    expect(speed(p)).toBeCloseTo(SPEED.walk, 5);
  });

  it('moves toward -x when walking forward at yaw π/2', () => {
    const p = run(createPlayer({ x: 20, z: 20 }, Math.PI / 2), input({ forward: 1 }), 60, 1 / 60);
    expect(p.pos.x).toBeLessThan(20 - SPEED.walk * 0.8);
    expect(p.pos.z).toBeCloseTo(20, 5);
  });

  it('strafes right toward +x at yaw 0', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ right: 1 }), 60, 1 / 60);
    expect(p.pos.x).toBeGreaterThan(20 + SPEED.walk * 0.8);
  });

  it('does not move faster diagonally', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ forward: 1, right: 1 }), 60, 1 / 60);
    expect(speed(p)).toBeCloseTo(SPEED.walk, 5);
  });

  it('sprints faster, and crouch overrides sprint', () => {
    const sprinter = run(createPlayer({ x: 20, z: 20 }), input({ forward: 1, sprint: true }), 60, 1 / 60);
    expect(sprinter.gait).toBe('sprint');
    expect(speed(sprinter)).toBeCloseTo(SPEED.sprint, 5);

    const croucher = run(createPlayer({ x: 20, z: 20 }), input({ forward: 1, sprint: true, crouch: true }), 60, 1 / 60);
    expect(croucher.gait).toBe('crouch');
    expect(speed(croucher)).toBeCloseTo(SPEED.crouch, 5);
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
    // Border wall cell 19 spans 38..40: its thin slab's face is at 38.9.
    expect(p.pos.x).toBeCloseTo(38.9 - 0.3, 3);
    expect(p.vel.x).toBe(0);
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

describe('movement feel', () => {
  const speed = (p: ReturnType<typeof createPlayer>) => Math.hypot(p.vel.x, p.vel.z);

  it('jogs rather than glides: sprint 3.6 m/s, walk 2.5 m/s', () => {
    expect(SPEED.sprint).toBeCloseTo(3.6, 9);
    expect(SPEED.walk).toBeCloseTo(2.5, 9);
  });

  it('builds up speed over about a quarter second instead of instantly', () => {
    const p = createPlayer({ x: 20, z: 20 });
    run(p, input({ forward: 1, sprint: true }), 3, 1 / 60); // 0.05 s
    expect(speed(p)).toBeGreaterThan(0);
    expect(speed(p)).toBeLessThan(SPEED.sprint * 0.5);
    run(p, input({ forward: 1, sprint: true }), 15, 1 / 60); // 0.3 s total
    expect(speed(p)).toBeCloseTo(SPEED.sprint, 5);
  });

  it('comes to a stop quickly but not instantly when the keys are released', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ forward: 1, sprint: true }), 60, 1 / 60);
    run(p, NO_INPUT, 3, 1 / 60); // 0.05 s
    expect(speed(p)).toBeGreaterThan(0);
    run(p, NO_INPUT, 9, 1 / 60); // 0.2 s total
    expect(speed(p)).toBe(0);
    expect(p.moving).toBe(false);
  });

  it('loses momentum into a wall instead of pushing on it', () => {
    const p = run(createPlayer({ x: 20, z: 20 }), input({ right: 1, sprint: true }), 400, 1 / 60);
    expect(p.vel.x).toBe(0);
  });
});

describe('headBob', () => {
  it('is still when standing, and bobs harder sprinting than walking', () => {
    const still = run(createPlayer({ x: 20, z: 20 }), NO_INPUT, 60, 1 / 60);
    expect(headBob(still)).toEqual({ y: 0, roll: 0 });

    const peak = (i: MoveInput) => {
      const p = createPlayer({ x: 20, z: 20 });
      let max = 0;
      for (let k = 0; k < 120; k++) {
        updatePlayer(p, i, 1 / 60, open);
        max = Math.max(max, Math.abs(headBob(p).y));
      }
      return max;
    };
    const walk = peak(input({ forward: 1 }));
    const sprint = peak(input({ forward: 1, sprint: true }));
    expect(walk).toBeGreaterThan(0.005);
    expect(sprint).toBeGreaterThan(walk);
    expect(sprint).toBeLessThan(0.08);
  });
});
