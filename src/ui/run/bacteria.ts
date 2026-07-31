/**
 * Biofilter colonisation: AOB + NOB against their combined ceiling (each
 * bacterium type caps at surface × bacteriaPerCm2).
 */

import type { Resources } from '../../simulation/index.js';
import type { NitrogenCycleConfig } from '../../simulation/config/index.js';

/** Below this colonisation percentage the biofilter cannot carry a bioload. */
export const CYCLED_PCT = 25;

/** Colonisation as a percentage (0–100) of the tank's combined bacteria ceiling. */
export function biofilterColonisation(
  resources: Resources,
  config: NitrogenCycleConfig
): number {
  const ceiling = resources.surface * config.bacteriaPerCm2;
  if (ceiling <= 0) return 0;
  return Math.min(100, ((resources.aob + resources.nob) / (2 * ceiling)) * 100);
}
