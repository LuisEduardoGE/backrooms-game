import './style.css';
import { deviceGate } from './ui/device';

const gateScreen = document.getElementById('desktop-only') as HTMLDivElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;
const trailer = gateScreen.querySelector('img') as HTMLImageElement;
const title = gateScreen.querySelector('.title') as HTMLElement;
const hint = gateScreen.querySelector('.hint') as HTMLElement;

let started = false;

function check(): void {
  if (started) return;
  const gate = deviceGate({ anyFinePointer: window.matchMedia('(any-pointer: fine)').matches, width: window.innerWidth });
  if (gate === 'play') {
    started = true;
    gateScreen.hidden = true;
    overlay.hidden = false;
    window.removeEventListener('resize', check);
    // The whole game (Three.js and all) loads only on devices that can play it.
    import('./app').catch(() => {
      title.textContent = 'TAPE WON\'T LOAD';
      hint.textContent = 'Something went wrong loading the game. Try reloading the page.';
      overlay.hidden = true;
      gateScreen.hidden = false;
    });
    return;
  }
  overlay.hidden = true;
  gateScreen.hidden = false;
  if (gate === 'widen') {
    title.textContent = 'WIDEN THE WINDOW';
    hint.textContent = 'This tape needs a wider window. Make the browser window bigger (or zoom out) to play.';
  } else {
    title.textContent = 'PLAY ON DESKTOP';
    hint.textContent = 'This tape needs a keyboard and mouse. Open this link on a computer.';
    // Only the phone screen shows the trailer, so only it downloads it.
    if (!trailer.src) trailer.src = trailer.dataset.src ?? '';
  }
}

window.addEventListener('resize', check);
check();
