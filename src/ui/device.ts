/** Narrower than this and the camcorder OSD and controls don't fit. */
const MIN_WIDTH = 700;

/** Keyboard-and-mouse game: needs some fine pointer (mouse/trackpad) and a desktop-sized window. */
export function isDesktopCapable(env: { anyFinePointer: boolean; width: number }): boolean {
  return env.anyFinePointer && env.width >= MIN_WIDTH;
}
