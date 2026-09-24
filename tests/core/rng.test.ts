import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from '../../src/core/rng';

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const same = Array.from({ length: 20 }, () => a.next() === b.next()).filter(Boolean);
    expect(same.length).toBeLessThan(20);
  });

  it('next() stays in [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() stays in [min, maxExclusive) and hits both ends', () => {
    const r = createRng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(7);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('pick() throws on an empty array', () => {
    expect(() => createRng(1).pick([])).toThrow();
  });

  it('shuffle() returns a permutation of the same items', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = createRng(3).shuffle(items.slice());
    expect(shuffled.slice().sort()).toEqual(items);
  });
});

describe('deriveSeed', () => {
  it('is stable and label-dependent', () => {
    expect(deriveSeed(123, 'layout')).toBe(deriveSeed(123, 'layout'));
    expect(deriveSeed(123, 'layout')).not.toBe(deriveSeed(123, 'textures'));
    expect(deriveSeed(123, 'layout')).not.toBe(deriveSeed(124, 'layout'));
  });

  it('returns an unsigned 32-bit integer', () => {
    const s = deriveSeed(0xffffffff, 'x');
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});
