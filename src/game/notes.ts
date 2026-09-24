export interface Note {
  title: string;
  body: string;
  /** Always placed: 'start' = within reach of the spawn, 'path' = anywhere along the true path. */
  essential?: 'start' | 'path';
}

/** Notes left by earlier wanderers. Six are placed per tape. */
export const NOTES: readonly Note[] = [
  {
    title: 'Day ?',
    body: "I stopped counting the rooms. The hum never stops. If you're reading this, don't sit down. Keep walking.",
  },
  {
    title: 'Arrows',
    essential: 'start',
    body: 'Someone painted arrows on the walls. Red, like old paint. I followed them for an hour and the rooms started to feel less the same. Trust the arrows. Mostly.',
  },
  {
    title: 'Not all of them',
    body: 'Some arrows lie. The real ones all lead the same way. If two disagree, walk on and look for the next arrow before you choose.',
  },
  {
    title: 'Water',
    body: 'Found a bottle of water that smells like almonds. It tastes wrong. My head cleared right after. Drink it when the walls start breathing.',
  },
  {
    title: 'The dark rooms',
    body: "Where the lights are dead, you start to come apart. Don't linger in there. If you have to cross, go quick, or use the camera's green.",
  },
  {
    title: 'Camera',
    body: 'The camcorder sees green in the dark. It eats batteries. There are batteries lying around, like someone left them for us. Or for bait.',
  },
  {
    title: 'The wall',
    essential: 'path',
    body: "There's a wall out here that doesn't sit right. It shimmers, like the tape is chewed. I think you're supposed to walk into it. I'm too scared to try.",
  },
  {
    title: 'Last one',
    body: "If you find this, I went through the shimmering wall. Or I didn't. Either way, don't stay. The longer you stay, the less of you is left.",
  },
];
