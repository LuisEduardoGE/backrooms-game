import type { Rng } from '../core/rng';
import type { Vec2 } from '../player/collision';
import { CELL_SIZE, cellToWorld, type Grid, type Point, worldToCell } from '../world/grid';
import { findPath } from './astar';
import { hasLineOfSight } from './los';
import type { NoiseEvent } from './noise';

export type EntityKind = 'smiler' | 'howler';
export type EntityState = 'roam' | 'investigate' | 'chase' | 'search';

export interface EntityTuning {
  roamSpeed: number;
  investigateSpeed: number;
  chaseSpeed: number;
  /** How far it can see, in cells. */
  sightCells: number;
  /** How far it wanders when roaming, in cells. */
  roamRadius: number;
  loseSightSec: number;
  searchSec: number;
}

export const TUNING: Record<EntityKind, EntityTuning> = {
  smiler: { roamSpeed: 0.8, investigateSpeed: 1.8, chaseSpeed: 3.2, sightCells: 10, roamRadius: 6, loseSightSec: 4, searchSec: 6 },
  howler: { roamSpeed: 1.4, investigateSpeed: 2.6, chaseSpeed: 4.5, sightCells: 20, roamRadius: 20, loseSightSec: 4, searchSec: 8 },
};

/** Metres between centres at which the player is caught. */
export const CATCH_DISTANCE = 0.7;
const REPATH_SEC = 0.5;
const SEARCH_WANDER = 4;
const MAX_PATH_EXPANSIONS = 3000;

export interface Entity {
  id: number;
  kind: EntityKind;
  pos: Vec2;
  prevPos: Vec2;
  heading: number;
  state: EntityState;
  goal: Point | null;
  path: Point[];
  lastSeen: Vec2 | null;
  /** Counts down: sight-loss grace while chasing, remaining search time while searching. */
  timer: number;
  repath: number;
}

export interface EntityWorld {
  grid: Grid;
  canEnter: (x: number, y: number) => boolean;
  rng: Rng;
  player: Vec2;
  noises: readonly NoiseEvent[];
}

export function createEntity(id: number, kind: EntityKind, cell: Point): Entity {
  const pos = { x: cellToWorld(cell.x), z: cellToWorld(cell.y) };
  return { id, kind, pos, prevPos: { ...pos }, heading: 0, state: 'roam', goal: null, path: [], lastSeen: null, timer: 0, repath: 0 };
}

const cellOf = (p: Vec2): Point => ({ x: worldToCell(p.x), y: worldToCell(p.z) });
const sameCell = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

function randomNearby(w: EntityWorld, around: Point, radius: number): Point | null {
  for (let t = 0; t < 30; t++) {
    const p = { x: around.x + w.rng.int(-radius, radius + 1), y: around.y + w.rng.int(-radius, radius + 1) };
    if (w.canEnter(p.x, p.y)) return p;
  }
  return null;
}

function setGoal(e: Entity, goal: Point | null): void {
  e.goal = goal;
  e.path = [];
  e.repath = 0;
}

export function updateEntity(e: Entity, dt: number, w: EntityWorld): void {
  const t = TUNING[e.kind];
  e.prevPos = { ...e.pos };
  const here = cellOf(e.pos);

  // Senses.
  const distCells = Math.hypot(w.player.x - e.pos.x, w.player.z - e.pos.z) / CELL_SIZE;
  const sees = distCells <= t.sightCells && hasLineOfSight(w.grid, e.pos, w.player);
  if (sees) {
    e.lastSeen = { ...w.player };
    if (e.state !== 'chase') e.state = 'chase';
    e.timer = t.loseSightSec;
    const target = cellOf(w.player);
    if (!e.goal || !sameCell(e.goal, target)) e.goal = target;
  } else if (e.state === 'chase') {
    e.timer -= dt;
    if (e.timer <= 0) {
      e.state = 'search';
      e.timer = t.searchSec;
      setGoal(e, e.lastSeen ? cellOf(e.lastSeen) : null);
    }
  }
  if (e.state !== 'chase') {
    for (const n of w.noises) {
      if (n.radius > 0 && Math.hypot(n.x - e.pos.x, n.z - e.pos.z) / CELL_SIZE <= n.radius) {
        e.state = 'investigate';
        setGoal(e, cellOf(n));
      }
    }
  }

  // Goals per state.
  const arrived = e.goal !== null && e.path.length === 0 && sameCell(here, e.goal);
  if (e.state === 'investigate' && (arrived || e.goal === null)) {
    e.state = 'search';
    e.timer = t.searchSec;
    setGoal(e, null);
  }
  if (e.state === 'search') {
    e.timer -= dt;
    if (e.timer <= 0) {
      e.state = 'roam';
      setGoal(e, null);
    } else if (e.goal === null || arrived) {
      setGoal(e, randomNearby(w, e.lastSeen ? cellOf(e.lastSeen) : here, SEARCH_WANDER));
    }
  }
  if (e.state === 'roam' && (e.goal === null || arrived)) setGoal(e, randomNearby(w, here, t.roamRadius));

  // Planning (throttled).
  e.repath -= dt;
  if (e.goal && (e.repath <= 0 || e.path.length === 0) && !sameCell(here, e.goal)) {
    const path = findPath(w.grid, here, e.goal, w.canEnter, MAX_PATH_EXPANSIONS);
    e.path = path ? path.slice(1) : [];
    e.repath = REPATH_SEC;
    if (!path && e.state !== 'chase') setGoal(e, null);
  }

  // Movement along the path.
  const speed = e.state === 'chase' ? t.chaseSpeed : e.state === 'investigate' ? t.investigateSpeed : t.roamSpeed;
  let budget = speed * dt;
  while (budget > 0 && e.path.length > 0) {
    const target = { x: cellToWorld(e.path[0].x), z: cellToWorld(e.path[0].y) };
    const dx = target.x - e.pos.x;
    const dz = target.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) e.heading = Math.atan2(-dx, -dz);
    if (d <= budget) {
      e.pos = target;
      e.path.shift();
      budget -= d;
    } else {
      e.pos = { x: e.pos.x + (dx / d) * budget, z: e.pos.z + (dz / d) * budget };
      budget = 0;
    }
  }
}

export function caughtPlayer(e: Entity, player: Vec2): boolean {
  return Math.hypot(player.x - e.pos.x, player.z - e.pos.z) < CATCH_DISTANCE;
}
