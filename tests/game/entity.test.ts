import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { CATCH_DISTANCE, caughtPlayer, createEntity, type Entity, type EntityWorld, TUNING, updateEntity } from '../../src/game/entity';
import type { NoiseEvent } from '../../src/game/noise';
import { Cell, CELL_SIZE, cellToWorld, createGrid, getCell, type Grid, setCell, worldToCell } from '../../src/world/grid';

/** 30×30 open room (floor 1..28). */
function open(): Grid {
  const g = createGrid(30, 30);
  for (let y = 1; y <= 28; y++) for (let x = 1; x <= 28; x++) setCell(g, x, y, Cell.Floor);
  return g;
}
const floor = (g: Grid) => (x: number, y: number) => getCell(g, x, y) === Cell.Floor;
const at = (cx: number, cy: number) => ({ x: cellToWorld(cx), z: cellToWorld(cy) });

function world(g: Grid, player: { x: number; z: number }, noises: NoiseEvent[] = [], canEnter = floor(g)): EntityWorld {
  return { grid: g, canEnter, rng: createRng(3), player, noises };
}
function run(e: Entity, w: EntityWorld, seconds: number, dt = 1 / 60) {
  for (let i = 0; i < Math.round(seconds / dt); i++) updateEntity(e, dt, { ...w, noises: i === 0 ? w.noises : [] });
}

describe('updateEntity', () => {
  it('roams when it neither hears nor sees the player', () => {
    const g = open();
    // A wall across the room hides the player.
    for (let x = 1; x <= 28; x++) setCell(g, x, 15, Cell.Wall);
    const e = createEntity(0, 'howler', { x: 5, y: 5 });
    run(e, world(g, at(20, 25)), 5);
    expect(e.state).toBe('roam');
    expect(e.pos).not.toEqual(at(5, 5));
    expect(getCell(g, worldToCell(e.pos.x), worldToCell(e.pos.z))).toBe(Cell.Floor);
  });

  it('investigates a noise it can hear, and ignores one out of earshot', () => {
    const g = open();
    for (let x = 1; x <= 28; x++) setCell(g, x, 15, Cell.Wall);
    const hear = createEntity(0, 'howler', { x: 5, y: 5 });
    updateEntity(hear, 1 / 60, world(g, at(25, 25), [{ ...at(9, 5), radius: 6 }]));
    expect(hear.state).toBe('investigate');
    expect(hear.goal).toEqual({ x: 9, y: 5 });

    const deaf = createEntity(1, 'howler', { x: 5, y: 5 });
    updateEntity(deaf, 1 / 60, world(g, at(25, 25), [{ ...at(20, 5), radius: 6 }]));
    expect(deaf.state).toBe('roam');
  });

  it('chases a player it can see, closing the distance', () => {
    const g = open();
    const e = createEntity(0, 'howler', { x: 5, y: 5 });
    const player = at(15, 5);
    const before = Math.hypot(player.x - e.pos.x, player.z - e.pos.z);
    run(e, world(g, player), 1);
    expect(e.state).toBe('chase');
    expect(Math.hypot(player.x - e.pos.x, player.z - e.pos.z)).toBeLessThan(before - TUNING.howler.chaseSpeed * 0.8);
  });

  it('gives up the chase after losing sight, searches, then roams again', () => {
    const g = open();
    const e = createEntity(0, 'howler', { x: 5, y: 5 });
    run(e, world(g, at(12, 5)), 0.2);
    expect(e.state).toBe('chase');
    // Player vanishes far away behind a wall.
    for (let x = 1; x <= 28; x++) setCell(g, x, 20, Cell.Wall);
    const hidden = world(g, at(25, 26));
    run(e, hidden, TUNING.howler.loseSightSec + 0.2);
    expect(e.state).toBe('search');
    run(e, hidden, TUNING.howler.searchSec + 0.2);
    expect(e.state).toBe('roam');
  });

  it('never lets a Smiler leave its allowed (dark) cells, even while it sees the player', () => {
    const g = open();
    const dark = (x: number, y: number) => floor(g)(x, y) && x <= 10;
    const e = createEntity(0, 'smiler', { x: 5, y: 10 });
    const w = world(g, at(14, 10), [], dark);
    for (let i = 0; i < 600; i++) {
      updateEntity(e, 1 / 60, w);
      expect(worldToCell(e.pos.x)).toBeLessThanOrEqual(10);
    }
    expect(e.state).toBe('chase');
  });

  it('catches only at contact distance', () => {
    const e = createEntity(0, 'howler', { x: 5, y: 5 });
    expect(caughtPlayer(e, { x: e.pos.x + CATCH_DISTANCE * 0.9, z: e.pos.z })).toBe(true);
    expect(caughtPlayer(e, { x: e.pos.x + CELL_SIZE, z: e.pos.z })).toBe(false);
  });

  it('is deterministic for the same world', () => {
    const g = open();
    const a = createEntity(0, 'howler', { x: 5, y: 5 });
    const b = createEntity(0, 'howler', { x: 5, y: 5 });
    run(a, world(g, at(25, 25)), 3);
    run(b, world(g, at(25, 25)), 3);
    expect(a.pos).toEqual(b.pos);
  });
});
