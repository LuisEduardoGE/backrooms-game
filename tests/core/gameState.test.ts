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

describe('nextPhase — notes and endings', () => {
  it('opens and closes notes only while playing', () => {
    expect(nextPhase('playing', 'readNote')).toBe('reading');
    expect(nextPhase('reading', 'closeNote')).toBe('playing');
    expect(nextPhase('paused', 'readNote')).toBe('paused');
    expect(nextPhase('title', 'closeNote')).toBe('title');
  });

  it('pauses when the pointer unlocks while reading', () => {
    expect(nextPhase('reading', 'unlock')).toBe('paused');
  });

  it('ends the tape from playing or reading, never from title or pause', () => {
    expect(nextPhase('playing', 'die')).toBe('ended');
    expect(nextPhase('reading', 'die')).toBe('ended');
    expect(nextPhase('paused', 'die')).toBe('paused');
    expect(nextPhase('title', 'die')).toBe('title');
  });

  it('escapes only while playing', () => {
    expect(nextPhase('playing', 'escape')).toBe('escaped');
    expect(nextPhase('paused', 'escape')).toBe('paused');
  });

  it('treats ended and escaped as terminal', () => {
    for (const terminal of ['ended', 'escaped'] as const) {
      for (const event of ['lock', 'unlock', 'readNote', 'closeNote', 'die', 'escape'] as const) {
        expect(nextPhase(terminal, event)).toBe(terminal);
      }
    }
  });
});
