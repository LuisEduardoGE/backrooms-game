import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { shortestPath } from '../../src/world/clues';
import { generateLevel } from '../../src/world/generator';
import { Cell, getCell } from '../../src/world/grid';
import { ITEM_COUNTS, MIN_ITEM_SPACING, placeItems } from '../../src/world/items';
import { NOTES } from '../../src/game/notes';

for (const seed of [7, 42]) {
  describe(`placeItems (seed ${seed})`, () => {
    const level = generateLevel(seed);
    const path = shortestPath(level.grid, level.start, level.exit);
    const items = placeItems(level, path, createRng(seed));
    const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

    it('places the configured number of each kind with sequential ids', () => {
      for (const kind of ['battery', 'almondWater', 'note'] as const) {
        expect(items.filter((i) => i.kind === kind)).toHaveLength(ITEM_COUNTS[kind]);
      }
      expect(items.map((i) => i.id)).toEqual(items.map((_, k) => k));
    });

    it('uses plain floor only, never the start or exit cell', () => {
      for (const it of items) {
        expect(getCell(level.grid, it.cell.x, it.cell.y)).toBe(Cell.Floor);
        expect(it.cell).not.toEqual(level.start);
        expect(it.cell).not.toEqual(level.exit);
      }
    });

    it('keeps items at least MIN_ITEM_SPACING apart', () => {
      for (let a = 0; a < items.length; a++) {
        for (let b = a + 1; b < items.length; b++) {
          expect(cheb(items[a].cell, items[b].cell)).toBeGreaterThanOrEqual(MIN_ITEM_SPACING);
        }
      }
    });

    it('favours the edges of dark zones for batteries and Almond Water', () => {
      const supplies = items.filter((i) => i.kind !== 'note');
      const nearDark = supplies.filter((i) => {
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const x = i.cell.x + dx;
            const y = i.cell.y + dy;
            if (x >= 0 && y >= 0 && x < level.grid.width && y < level.grid.height && level.grid.dark[y * level.grid.width + x]) return true;
          }
        }
        return false;
      });
      expect(nearDark.length / supplies.length).toBeGreaterThanOrEqual(0.5);
    });

    it('puts distinct notes within 6 cells of the true path', () => {
      const notes = items.filter((i) => i.kind === 'note');
      expect(new Set(notes.map((n) => n.note)).size).toBe(notes.length);
      for (const n of notes) expect(Math.min(...path.map((p) => cheb(p, n.cell)))).toBeLessThanOrEqual(6);
    });

    it('is deterministic', () => {
      expect(placeItems(level, path, createRng(seed))).toEqual(items);
    });
  });
}

describe('essential notes', () => {
  const arrowsNote = NOTES.findIndex((n) => n.title === 'Arrows');
  const wallNote = NOTES.findIndex((n) => n.title === 'The wall');

  it('always places the notes that explain the goal, with the arrows note near the start', () => {
    for (const seed of [7, 42, 99, 1234, 5000]) {
      const level = generateLevel(seed);
      const path = shortestPath(level.grid, level.start, level.exit);
      const notes = placeItems(level, path, createRng(seed)).filter((i) => i.kind === 'note');
      expect(notes.map((n) => n.note)).toContain(arrowsNote);
      expect(notes.map((n) => n.note)).toContain(wallNote);
      const first = notes.find((n) => n.note === arrowsNote)!;
      expect(Math.max(Math.abs(first.cell.x - level.start.x), Math.abs(first.cell.y - level.start.y))).toBeLessThanOrEqual(10);
    }
  });
});
