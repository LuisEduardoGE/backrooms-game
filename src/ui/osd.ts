import { deriveSeed } from '../core/rng';

const MONTHS = ['JAN.', 'FEB.', 'MAR.', 'APR.', 'MAY', 'JUN.', 'JUL.', 'AUG.', 'SEP.', 'OCT.', 'NOV.', 'DEC.'];
const DAYS_IN_1996 = 366;

/** A seeded moment in 1996 when this tape started recording (epoch ms, whole seconds). */
export function tapeStartTime(seed: number): number {
  const fraction = deriveSeed(seed, 'tape') / 4294967296;
  return Date.UTC(1996, 0, 1) + Math.floor(fraction * DAYS_IN_1996 * 86400) * 1000;
}

export function formatOsdDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`;
}

export function formatOsdTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getUTCHours();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h % 12 || 12}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${h < 12 ? 'AM' : 'PM'}`;
}

export function batteryBars(percent: number): number {
  return Math.max(0, Math.min(4, Math.ceil(percent / 25)));
}
