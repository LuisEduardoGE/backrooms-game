import { describe, expect, it } from 'vitest';
import { createInput } from '../../src/core/input';

function key(type: 'keydown' | 'keyup', code: string): Event {
  const e = new Event(type);
  Object.defineProperty(e, 'code', { value: code });
  return e;
}

function repeatKey(code: string): Event {
  const e = key('keydown', code);
  Object.defineProperty(e, 'repeat', { value: true });
  return e;
}

function mouse(dx: number, dy: number): Event {
  const e = new Event('mousemove');
  Object.defineProperties(e, { movementX: { value: dx }, movementY: { value: dy } });
  return e;
}

function setup(locked = true) {
  const target = new EventTarget();
  const input = createInput(target, () => locked);
  return { target, input };
}

describe('createInput', () => {
  it('maps WASD and arrows to forward/right axes', () => {
    const { target, input } = setup();
    target.dispatchEvent(key('keydown', 'KeyW'));
    target.dispatchEvent(key('keydown', 'KeyA'));
    expect(input.moveInput()).toMatchObject({ forward: 1, right: -1 });
    target.dispatchEvent(key('keydown', 'ArrowDown'));
    expect(input.moveInput().forward).toBe(0);
  });

  it('maps Shift to sprint and C to crouch', () => {
    const { target, input } = setup();
    target.dispatchEvent(key('keydown', 'ShiftLeft'));
    target.dispatchEvent(key('keydown', 'KeyC'));
    expect(input.moveInput()).toMatchObject({ sprint: true, crouch: true });
    target.dispatchEvent(key('keyup', 'KeyC'));
    expect(input.moveInput().crouch).toBe(false);
  });

  it('accumulates mouse movement while locked and consumes it once', () => {
    const { target, input } = setup(true);
    target.dispatchEvent(mouse(10, -5));
    target.dispatchEvent(mouse(10, 0));
    const first = input.moveInput(0.01);
    expect(first.lookDX).toBeCloseTo(0.2, 6);
    expect(first.lookDY).toBeCloseTo(-0.05, 6);
    expect(input.moveInput(0.01).lookDX).toBe(0);
  });

  it('ignores mouse movement while unlocked', () => {
    const { target, input } = setup(false);
    target.dispatchEvent(mouse(50, 50));
    expect(input.moveInput().lookDX).toBe(0);
  });

  it('releases held keys when the window loses focus', () => {
    const { target, input } = setup();
    target.dispatchEvent(key('keydown', 'KeyW'));
    target.dispatchEvent(new Event('blur'));
    expect(input.moveInput().forward).toBe(0);
  });

  it('clear() releases keys and pending look', () => {
    const { target, input } = setup();
    target.dispatchEvent(key('keydown', 'KeyD'));
    target.dispatchEvent(mouse(30, 0));
    input.clear();
    expect(input.moveInput()).toMatchObject({ right: 0, lookDX: 0 });
  });

  it('stops listening after dispose()', () => {
    const { target, input } = setup();
    input.dispose();
    target.dispatchEvent(key('keydown', 'KeyW'));
    expect(input.isDown('KeyW')).toBe(false);
  });
});

describe('consumePressed', () => {
  it('reports a press exactly once', () => {
    const { target, input } = setup();
    target.dispatchEvent(key('keydown', 'KeyN'));
    expect(input.consumePressed('KeyN')).toBe(true);
    expect(input.consumePressed('KeyN')).toBe(false);
  });

  it('ignores keyboard auto-repeat while the key is held', () => {
    const { target, input } = setup();
    target.dispatchEvent(key('keydown', 'KeyN'));
    input.consumePressed('KeyN');
    target.dispatchEvent(repeatKey('KeyN'));
    target.dispatchEvent(repeatKey('KeyN'));
    expect(input.consumePressed('KeyN')).toBe(false);
  });

  it('counts a new press after release', () => {
    const { target, input } = setup();
    target.dispatchEvent(key('keydown', 'KeyN'));
    input.consumePressed('KeyN');
    target.dispatchEvent(key('keyup', 'KeyN'));
    target.dispatchEvent(key('keydown', 'KeyN'));
    expect(input.consumePressed('KeyN')).toBe(true);
  });

  it('drops pending presses on clear()', () => {
    const { target, input } = setup();
    target.dispatchEvent(key('keydown', 'KeyN'));
    input.clear();
    expect(input.consumePressed('KeyN')).toBe(false);
  });
});
