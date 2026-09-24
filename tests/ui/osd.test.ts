import { describe, expect, it } from 'vitest';
import { batteryBars, formatDuration, formatOsdDate, formatOsdTime, tapeStartTime } from '../../src/ui/osd';

describe('tapeStartTime', () => {
  it('is a deterministic whole-second moment in 1996', () => {
    const t = tapeStartTime(42);
    expect(t).toBe(tapeStartTime(42));
    expect(t).toBeGreaterThanOrEqual(Date.UTC(1996, 0, 1));
    expect(t).toBeLessThan(Date.UTC(1997, 0, 1));
    expect(t % 1000).toBe(0);
    expect(tapeStartTime(43)).not.toBe(t);
  });
});

describe('formatOsdDate / formatOsdTime', () => {
  it('formats like a 90s camcorder', () => {
    const t = Date.UTC(1996, 8, 24, 22, 42, 7);
    expect(formatOsdDate(t)).toBe('SEP. 24 1996');
    expect(formatOsdTime(t)).toBe('10:42:07 PM');
  });

  it('handles midnight, noon, May and single-digit days', () => {
    expect(formatOsdTime(Date.UTC(1996, 0, 5, 0, 0, 0))).toBe('12:00:00 AM');
    expect(formatOsdTime(Date.UTC(1996, 0, 5, 12, 3, 9))).toBe('12:03:09 PM');
    expect(formatOsdDate(Date.UTC(1996, 4, 5))).toBe('MAY 5 1996');
  });
});

describe('batteryBars', () => {
  it('maps percent to 0..4 bars', () => {
    expect(batteryBars(100)).toBe(4);
    expect(batteryBars(76)).toBe(4);
    expect(batteryBars(75)).toBe(3);
    expect(batteryBars(1)).toBe(1);
    expect(batteryBars(0)).toBe(0);
    expect(batteryBars(-5)).toBe(0);
  });
});

describe('formatDuration', () => {
  it('formats recorded time as MM:SS', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65.9)).toBe('01:05');
    expect(formatDuration(3600 + 125)).toBe('62:05');
  });
});
