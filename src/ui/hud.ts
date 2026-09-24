import { LOW_BATTERY } from '../player/camcorder';
import { batteryBars, formatOsdDate, formatOsdTime } from './osd';

export interface HudState {
  recording: boolean;
  /** 0..100 */
  battery: number;
  nightVision: boolean;
  /** Tape clock, epoch ms. */
  clockMs: number;
}

/** Camcorder OSD: ● REC / ▮▮ PAUSE, battery, timestamp, NIGHT VISION. Text only touched when it changes. */
export function createHud(parent: HTMLElement) {
  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div class="osd osd-tl"><span class="osd-rec"><b>●</b> REC</span><span class="osd-pause">▮▮ PAUSE</span></div>
    <div class="osd osd-tr"><span class="osd-battery"><i></i><i></i><i></i><i></i></span></div>
    <div class="osd osd-bl"><div class="osd-time"></div><div class="osd-date"></div></div>
    <div class="osd osd-br"><span class="osd-nv">NIGHT VISION</span></div>
    <div class="osd-prompt" hidden></div>
  `;
  parent.append(root);

  const el = (selector: string): HTMLElement => {
    const found = root.querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`HUD element ${selector} missing`);
    return found;
  };
  const time = el('.osd-time');
  const date = el('.osd-date');
  const battery = el('.osd-battery');
  const bars = Array.from(battery.querySelectorAll('i'));
  const prompt = el('.osd-prompt');
  let lastPrompt: string | null = null;
  let lastTime = '';
  let lastDate = '';

  return {
    setVisible(visible: boolean): void {
      root.hidden = !visible;
    },
    setPrompt(text: string | null): void {
      if (text === lastPrompt) return;
      lastPrompt = text;
      prompt.textContent = text ?? '';
      prompt.hidden = text === null;
    },
    update(s: HudState): void {
      root.classList.toggle('recording', s.recording);
      root.classList.toggle('night-vision', s.nightVision);
      battery.classList.toggle('low', s.battery < LOW_BATTERY);
      const filled = batteryBars(s.battery);
      bars.forEach((bar, i) => bar.classList.toggle('on', i < filled));

      const t = formatOsdTime(s.clockMs);
      if (t !== lastTime) time.textContent = lastTime = t;
      const d = formatOsdDate(s.clockMs);
      if (d !== lastDate) date.textContent = lastDate = d;
    },
  };
}
