export const FIXED_DT = 1 / 60;
export const MAX_STEPS_PER_FRAME = 5;

/**
 * Converts variable frame times into a count of fixed simulation steps.
 * After a long stall (tab hidden, breakpoint) it runs at most `maxSteps` and drops the rest,
 * so the simulation never spirals or teleports.
 */
export function createFixedStepper(step = FIXED_DT, maxSteps = MAX_STEPS_PER_FRAME) {
  let accumulator = 0;
  return {
    advance(frameDt: number): number {
      accumulator += Math.max(0, frameDt);
      let steps = Math.floor(accumulator / step);
      if (steps > maxSteps) {
        steps = maxSteps;
        accumulator = 0;
      } else {
        accumulator -= steps * step;
      }
      return steps;
    },
    /** Fraction (0..1) of a step left in the accumulator; blend previous→current state by this when rendering. */
    alpha(): number {
      return accumulator / step;
    },
  };
}
