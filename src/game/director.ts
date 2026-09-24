import type { Rng } from '../core/rng';
import { noiseWeight } from './noise';

export const SMILER_PHASE_SEC = 180;
export const HOWLER_PHASE_SEC = 480;
/** Summed footstep weight (walk = 1, sprint = 9) that summons the Howler early. */
export const LOUD_THRESHOLD = 2500;
const PRESENCE_MIN_SEC = 20;
const PRESENCE_MAX_SEC = 40;

export interface Director {
  time: number;
  loudness: number;
  smilersSpawned: boolean;
  howlerSpawned: boolean;
  nextPresenceAt: number;
}

export type DirectorEvent = 'spawnSmilers' | 'spawnHowler' | 'presence';

export function createDirector(rng: Rng): Director {
  return {
    time: 0,
    loudness: 0,
    smilersSpawned: false,
    howlerSpawned: false,
    nextPresenceAt: rng.range(PRESENCE_MIN_SEC, PRESENCE_MAX_SEC),
  };
}

/** Escalation: Presence from the start, Smilers at 3 min, the Howler at 8 min or when the player is very loud. */
export function updateDirector(d: Director, dt: number, footstep: number | null, rng: Rng): DirectorEvent[] {
  d.time += dt;
  if (footstep !== null) d.loudness += noiseWeight(footstep);
  const events: DirectorEvent[] = [];
  if (!d.smilersSpawned && d.time >= SMILER_PHASE_SEC) {
    d.smilersSpawned = true;
    events.push('spawnSmilers');
  }
  if (!d.howlerSpawned && (d.time >= HOWLER_PHASE_SEC || d.loudness >= LOUD_THRESHOLD)) {
    d.howlerSpawned = true;
    events.push('spawnHowler');
  }
  if (d.time >= d.nextPresenceAt) {
    d.nextPresenceAt = d.time + rng.range(PRESENCE_MIN_SEC, PRESENCE_MAX_SEC);
    events.push('presence');
  }
  return events;
}
