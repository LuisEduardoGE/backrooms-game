import './style.css';
import { isDesktopCapable } from './ui/device';

const desktop = isDesktopCapable({
  anyFinePointer: window.matchMedia('(any-pointer: fine)').matches,
  width: window.innerWidth,
});

if (desktop) {
  // The whole game (Three.js and all) loads only on devices that can play it.
  void import('./app');
} else {
  document.getElementById('overlay')?.setAttribute('hidden', '');
  document.getElementById('desktop-only')?.removeAttribute('hidden');
}
