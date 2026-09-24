import { describe, expect, it } from 'vitest';
import { NOTES } from '../../src/game/notes';

describe('NOTES', () => {
  it('has enough short, non-empty notes to place 6 per tape', () => {
    expect(NOTES.length).toBeGreaterThanOrEqual(6);
    for (const n of NOTES) {
      expect(n.title.trim().length).toBeGreaterThan(0);
      expect(n.body.trim().length).toBeGreaterThan(0);
      expect(n.body.length).toBeLessThanOrEqual(420);
    }
  });

  it('hints at the arrows and the noclip wall', () => {
    expect(NOTES.filter((n) => /arrow/i.test(n.body)).length).toBeGreaterThanOrEqual(2);
    expect(NOTES.some((n) => /wall/i.test(n.body))).toBe(true);
  });
});
