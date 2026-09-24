/** Narrower than this and the camcorder OSD and controls don't fit. */
const MIN_WIDTH = 700;

export type Gate = 'play' | 'desktop' | 'widen';

/**
 * Keyboard-and-mouse game: devices with no fine pointer (phones, tablets) get the play-on-desktop
 * screen; a real desktop in a narrow (snapped or zoomed) window is asked to widen it instead.
 */
export function deviceGate(env: { anyFinePointer: boolean; width: number }): Gate {
  if (!env.anyFinePointer) return 'desktop';
  return env.width >= MIN_WIDTH ? 'play' : 'widen';
}
