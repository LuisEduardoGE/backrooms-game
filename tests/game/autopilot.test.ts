import { describe, expect, it } from 'vitest';
import { autopilotInput, createAutopilot } from '../../src/game/autopilot';
import { createPlayer, updatePlayer } from '../../src/player/controller';
import { shortestPath } from '../../src/world/clues';
import { reachedExit } from '../../src/world/exit';
import { generateLevel } from '../../src/world/generator';
import { CELL_SIZE, cellToWorld, DIR_STEP } from '../../src/world/grid';

describe('autopilot', () => {
  for (const seed of [42, 7, 1234]) {
    it(`walks the true path to the noclip wall on seed ${seed}`, () => {
      const level = generateLevel(seed);
      const path = shortestPath(level.grid, level.start, level.exit);
      const player = createPlayer({ x: cellToWorld(level.start.x), z: cellToWorld(level.start.y) }, level.startYaw);
      const ap = createAutopilot();
      const face = {
        x: cellToWorld(level.exit.x) + (DIR_STEP[level.exitSide].x * CELL_SIZE) / 2,
        z: cellToWorld(level.exit.y) + (DIR_STEP[level.exitSide].y * CELL_SIZE) / 2,
      };
      const dt = 1 / 60;
      let escaped = false;
      for (let i = 0; i < 60 * 900 && !escaped; i++) {
        updatePlayer(player, autopilotInput(ap, player.pos, player.yaw, path, dt, face), dt, level.grid);
        escaped = reachedExit(level.exit, level.exitSide, player.pos);
      }
      expect(escaped).toBe(true);
    });
  }
});
