import { describe, expect, it } from 'vitest';
import { isDesktopCapable } from '../../src/ui/device';

describe('isDesktopCapable', () => {
  it('lets desktops and touchscreen laptops (which also have a mouse/trackpad) play', () => {
    expect(isDesktopCapable({ anyFinePointer: true, width: 1920 })).toBe(true);
    expect(isDesktopCapable({ anyFinePointer: true, width: 1280 })).toBe(true);
  });

  it('gates phones and tablets without a fine pointer, or tiny windows', () => {
    expect(isDesktopCapable({ anyFinePointer: false, width: 390 })).toBe(false);
    expect(isDesktopCapable({ anyFinePointer: false, width: 1366 })).toBe(false);
    expect(isDesktopCapable({ anyFinePointer: true, width: 500 })).toBe(false);
  });
});
