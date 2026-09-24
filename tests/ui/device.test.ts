import { describe, expect, it } from 'vitest';
import { deviceGate } from '../../src/ui/device';

describe('deviceGate', () => {
  it('lets desktops and touchscreen laptops (which also have a mouse/trackpad) play', () => {
    expect(deviceGate({ anyFinePointer: true, width: 1920 })).toBe('play');
    expect(deviceGate({ anyFinePointer: true, width: 1280 })).toBe('play');
  });

  it('sends phones and tablets without a fine pointer to the play-on-desktop screen', () => {
    expect(deviceGate({ anyFinePointer: false, width: 390 })).toBe('desktop');
    expect(deviceGate({ anyFinePointer: false, width: 1366 })).toBe('desktop');
  });

  it('asks a desktop in a narrow (snapped or zoomed) window to widen it rather than calling it a phone', () => {
    expect(deviceGate({ anyFinePointer: true, width: 500 })).toBe('widen');
  });
});
