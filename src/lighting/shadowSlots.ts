/**
 * The few real, shadow-casting lights follow the panels nearest the player. A slot never jumps
 * from one panel to another while lit: a panel that stops being wanted fades out, and only a dark
 * slot is handed a new panel, which then fades in. Once a slot has settled on its panel it follows
 * that panel's brightness exactly, so flicker and blackouts show up at once — in its shadows too.
 */
export interface Slot {
  /** Panel id (cell index) this light sits on, or null when free. */
  id: number | null;
  /** 0..1 multiplier of the light's full intensity. */
  intensity: number;
  /** False while fading in on a newly assigned panel. */
  settled: boolean;
}

export function createSlots(count: number): Slot[] {
  return Array.from({ length: count }, () => ({ id: null, intensity: 0, settled: false }));
}

/**
 * `wanted`: the panels that should have a real light right now, nearest first, with their target
 * brightness (flicker × distance fade). `fade`: intensity change per second when fading.
 */
export function updateSlots(slots: Slot[], wanted: readonly { id: number; target: number }[], dt: number, fade: number): void {
  const target = new Map(wanted.map((w) => [w.id, w.target]));
  const step = fade * dt;
  for (const s of slots) {
    const t = s.id === null ? undefined : target.get(s.id);
    if (t === undefined) {
      s.intensity = Math.max(0, s.intensity - step);
      if (s.intensity === 0) {
        s.id = null;
        s.settled = false;
      }
    } else if (!s.settled) {
      s.intensity = Math.min(t, s.intensity + step);
      if (s.intensity >= t) s.settled = true;
    } else {
      s.intensity = t;
    }
  }
  const held = new Set(slots.map((s) => s.id));
  for (const w of wanted) {
    if (held.has(w.id)) continue;
    const free = slots.find((s) => s.id === null);
    if (!free) break;
    free.id = w.id;
    free.intensity = 0;
    free.settled = false;
    held.add(w.id);
  }
}
