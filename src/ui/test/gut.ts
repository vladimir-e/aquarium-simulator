import { gutCapacity, hungerLine } from '../../simulation/index.js';
import { livestockDefaults } from '../../simulation/config/livestock.js';

/** Grams in the gut of a fish of this mass, this full. */
export function gutAt(fullness: number, mass = 0.5): number {
  return fullness * gutCapacity({ mass }, livestockDefaults);
}

export const FED = gutAt(1);
export const HUNGRY = gutAt(hungerLine(1, livestockDefaults) / 2);
export const STARVING = 0;
