import { gutCapacity, hungerLine } from '../../simulation/index.js';
import { livestockDefaults } from '../../simulation/config/livestock.js';
import type { Fish } from '../../simulation/state.js';

/** Grams in the gut of this fish, this full; a grown neon when none is named. */
export function gutAt(fullness: number, fish: Pick<Fish, 'species' | 'mass'> = { species: 'neon_tetra', mass: 0.5 }): number {
  return fullness * gutCapacity(fish, livestockDefaults);
}

export const FED = gutAt(1);
export const HUNGRY = gutAt(hungerLine(1, livestockDefaults) / 2);
export const STARVING = 0;
