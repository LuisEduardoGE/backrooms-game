/**
 * Places the Web Audio listener at the camera. Chrome/Safari expose AudioParams (positionX…);
 * Firefox only has the older setPosition/setOrientation — writing `positionX.value` there throws
 * every frame and freezes rendering.
 */
export function placeListener(L: AudioListener, x: number, y: number, z: number, yaw: number): void {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  if (L.positionX) {
    L.positionX.value = x;
    L.positionY.value = y;
    L.positionZ.value = z;
    L.forwardX.value = fx;
    L.forwardY.value = 0;
    L.forwardZ.value = fz;
    L.upX.value = 0;
    L.upY.value = 1;
    L.upZ.value = 0;
  } else {
    L.setPosition(x, y, z);
    L.setOrientation(fx, 0, fz, 0, 1, 0);
  }
}
