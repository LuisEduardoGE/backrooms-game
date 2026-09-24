import { describe, expect, it } from 'vitest';
import { nextPhase } from '../../src/core/gameState';

describe('nextPhase', () => {
  it('starts playing when the pointer locks from the title or pause screen', () => {
    expect(nextPhase('title', 'lock')).toBe('playing');
    expect(nextPhase('paused', 'lock')).toBe('playing');
    expect(nextPhase('playing', 'lock')).toBe('playing');
  });

  it('pauses when the pointer unlocks while playing (Esc, tab switch)', () => {
    expect(nextPhase('playing', 'unlock')).toBe('paused');
  });

  it('stays on the title or pause screen when unlocking there', () => {
    expect(nextPhase('title', 'unlock')).toBe('title');
    expect(nextPhase('paused', 'unlock')).toBe('paused');
  });
});
