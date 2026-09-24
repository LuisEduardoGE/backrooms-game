import { describe, expect, it } from 'vitest';
import { parseParams, tapeUrl } from '../../src/ui/params';

describe('parseParams', () => {
  it('defaults to no debug and no seed', () => {
    expect(parseParams('')).toEqual({ debug: false, seed: null, god: false });
  });

  it('enables debug with or without a value', () => {
    expect(parseParams('?debug').debug).toBe(true);
    expect(parseParams('?debug=1').debug).toBe(true);
  });

  it('accepts a valid unsigned 32-bit seed', () => {
    expect(parseParams('?seed=12345').seed).toBe(12345);
    expect(parseParams('?seed=0').seed).toBe(0);
    expect(parseParams('?seed=4294967295').seed).toBe(4294967295);
  });

  it.each(['abc', '-5', '1.5', '99999999999', '4294967296', '', '12a', ' 7'])('rejects seed=%j', (raw) => {
    expect(parseParams(`?seed=${encodeURIComponent(raw)}`).seed).toBeNull();
  });
});

describe('god flag', () => {
  it('is on with ?god', () => {
    expect(parseParams('?debug&god').god).toBe(true);
    expect(parseParams('?debug').god).toBe(false);
  });
});

describe('tapeUrl', () => {
  it('retries the same tape, keeping other flags', () => {
    const url = new URL(tapeUrl('http://localhost:5173/?debug&god&seed=5', 42));
    expect(url.searchParams.get('seed')).toBe('42');
    expect(url.searchParams.has('debug')).toBe(true);
    expect(url.searchParams.has('god')).toBe(true);
  });

  it('starts a new tape by dropping the seed', () => {
    const url = new URL(tapeUrl('http://localhost:5173/?debug&seed=5', null));
    expect(url.searchParams.has('seed')).toBe(false);
    expect(url.searchParams.has('debug')).toBe(true);
  });
});
