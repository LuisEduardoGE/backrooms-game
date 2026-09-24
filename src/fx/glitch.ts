import { deriveSeed } from '../core/rng';
import { LOW_BATTERY } from '../player/camcorder';

const U32 = 4294967296;
/** Each slot decides independently whether it contains one burst. */
export const GLITCH_SLOT = 2;
export const MAX_BURST = 0.7;
const MIN_BURST = 0.3;
/** Keeps bursts away from slot edges so two bursts never merge into one long flash. */
const EDGE_GAP = 0.1;
const BURST_CHANCE = 0.12;
const LOW_BATTERY_BURST_CHANCE = 0.5;
const LOW_BATTERY_FLOOR = 0.15;

/** Tape-glitch intensity 0..1 for the VHS shader: rare short bursts, more on a dying battery. */
export function glitchAmount(timeSec: number, seed: number, battery: number): number {
  const low = battery < LOW_BATTERY;
  const floor = low ? LOW_BATTERY_FLOOR : 0;
  const chance = low ? LOW_BATTERY_BURST_CHANCE : BURST_CHANCE;

  const slot = Math.floor(timeSec / GLITCH_SLOT);
  const roll = deriveSeed(seed, `glitch:${slot}`) / U32;
  if (roll >= chance) return floor;

  const shape = deriveSeed(seed, `glitch-shape:${slot}`) / U32;
  const duration = MIN_BURST + (MAX_BURST - MIN_BURST) * shape;
  const room = GLITCH_SLOT - duration - EDGE_GAP * 2;
  const start = slot * GLITCH_SLOT + EDGE_GAP + room * (roll / chance);
  const local = timeSec - start;
  if (local <= 0 || local >= duration) return floor;

  const envelope = Math.sin((local / duration) * Math.PI);
  return Math.max(floor, (0.6 + 0.4 * shape) * envelope);
}
