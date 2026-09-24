import { cellToWorld } from '../world/grid';
import type { Item, ItemKind } from '../world/items';

/** Metres from the player's centre to an item's centre. */
export const INTERACT_RANGE = 1.6;
/** cos of the widest angle between the view direction and an item (60°). */
const MIN_FACING_DOT = 0.5;
/** Closer than this, an item counts as underfoot and facing doesn't matter. */
const UNDERFOOT = 0.5;

/** The nearest untaken item within reach that the player is facing. */
export function findInteractable(
  items: readonly Item[],
  taken: ReadonlySet<number>,
  pos: { x: number; z: number },
  yaw: number,
): Item | null {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  let best: Item | null = null;
  let bestDist = Infinity;
  for (const item of items) {
    if (taken.has(item.id)) continue;
    const dx = cellToWorld(item.cell.x) - pos.x;
    const dz = cellToWorld(item.cell.y) - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > INTERACT_RANGE || dist >= bestDist) continue;
    if (dist > UNDERFOOT && (dx * fx + dz * fz) / dist < MIN_FACING_DOT) continue;
    best = item;
    bestDist = dist;
  }
  return best;
}

const PROMPTS: Record<ItemKind, string> = {
  battery: '[E] TAKE BATTERY',
  almondWater: '[E] DRINK ALMOND WATER',
  note: '[E] READ NOTE',
};

export function promptFor(kind: ItemKind): string {
  return PROMPTS[kind];
}
