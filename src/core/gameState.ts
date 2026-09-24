export type Phase = 'title' | 'playing' | 'paused' | 'reading' | 'ended' | 'escaped';
export type PhaseEvent = 'lock' | 'unlock' | 'readNote' | 'closeNote' | 'die' | 'escape';

/**
 * Pointer lock drives play/pause; notes open over play; `ended` (sanity gone) and `escaped`
 * (through the noclip wall) are terminal until the page reloads a tape.
 */
export function nextPhase(phase: Phase, event: PhaseEvent): Phase {
  if (phase === 'ended' || phase === 'escaped') return phase;
  switch (event) {
    case 'lock':
      return 'playing';
    case 'unlock':
      return phase === 'playing' || phase === 'reading' ? 'paused' : phase;
    case 'readNote':
      return phase === 'playing' ? 'reading' : phase;
    case 'closeNote':
      return phase === 'reading' ? 'playing' : phase;
    case 'die':
      return phase === 'playing' || phase === 'reading' ? 'ended' : phase;
    case 'escape':
      return phase === 'playing' ? 'escaped' : phase;
  }
}
