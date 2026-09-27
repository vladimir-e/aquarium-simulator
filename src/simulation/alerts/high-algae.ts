/**
 * High algae alert — fires once when the blooms' combined coverage grows past
 * the mass where it starts to shade plants, resets at or below it.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import type { TunableConfig } from '../config/index.js';
import { combinedCoverage } from '../algae/index.js';
import { ceiled, latch } from './latch.js';

/** Algae mass the bloom alerts over: where it starts to shade plants. */
export function algaeAlertLine(config: TunableConfig): number {
  return config.plants.algaeShadingThreshold;
}

export const highAlgaeAlert: Alert = {
  id: 'high-algae',

  check(state: SimulationState, config: TunableConfig): AlertResult {
    const mass = combinedCoverage(state.algae);
    return latch(
      state,
      'highAlgae',
      mass > algaeAlertLine(config),
      'algae',
      `High algae level: ${ceiled(mass, 1)} - shading plants, consider reducing light, scrubbing or a water change`
    );
  },
};
