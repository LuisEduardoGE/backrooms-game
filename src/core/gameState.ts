export type Phase = 'title' | 'playing' | 'paused';

/** Pointer lock drives the phase: locking starts/resumes play, losing it (Esc, tab switch) pauses. */
export function nextPhase(phase: Phase, event: 'lock' | 'unlock'): Phase {
  if (event === 'lock') return 'playing';
  return phase === 'playing' ? 'paused' : phase;
}
