import type { MoveInput } from '../player/controller';

export const MOUSE_SENSITIVITY = 0.0022;

const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const SPRINT = ['ShiftLeft', 'ShiftRight'];
// Not Ctrl: Ctrl+W closes the browser tab.
const CROUCH = ['KeyC'];

export interface Input {
  isDown(code: string): boolean;
  /** True once per physical press of `code` since the last call (keyboard auto-repeat is ignored). */
  consumePressed(code: string): boolean;
  /** Current movement intent; consumes mouse movement accumulated since the last call. */
  moveInput(sensitivity?: number): MoveInput;
  clear(): void;
  dispose(): void;
}

export function createInput(target: EventTarget, isLocked: () => boolean): Input {
  const down = new Set<string>();
  const pressed = new Set<string>();
  let lookX = 0;
  let lookY = 0;

  const clear = () => {
    down.clear();
    pressed.clear();
    lookX = 0;
    lookY = 0;
  };
  const listeners: Array<[string, (e: Event) => void]> = [
    [
      'keydown',
      (e) => {
        const k = e as KeyboardEvent;
        down.add(k.code);
        if (!k.repeat) pressed.add(k.code);
      },
    ],
    ['keyup', (e) => down.delete((e as KeyboardEvent).code)],
    [
      'mousemove',
      (e) => {
        if (!isLocked()) return;
        lookX += (e as MouseEvent).movementX;
        lookY += (e as MouseEvent).movementY;
      },
    ],
    ['blur', clear],
  ];
  for (const [type, fn] of listeners) target.addEventListener(type, fn);

  const any = (codes: string[]) => codes.some((c) => down.has(c));

  return {
    isDown: (code) => down.has(code),
    consumePressed: (code) => pressed.delete(code),
    moveInput(sensitivity = MOUSE_SENSITIVITY) {
      const input: MoveInput = {
        forward: (any(FORWARD) ? 1 : 0) - (any(BACK) ? 1 : 0),
        right: (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0),
        sprint: any(SPRINT),
        crouch: any(CROUCH),
        lookDX: lookX * sensitivity,
        lookDY: lookY * sensitivity,
      };
      lookX = 0;
      lookY = 0;
      return input;
    },
    clear,
    dispose() {
      for (const [type, fn] of listeners) target.removeEventListener(type, fn);
    },
  };
}
