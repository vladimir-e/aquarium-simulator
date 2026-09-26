/**
 * High algae alert — fires once when the bloom grows past the mass where it
 * starts to shade plants, resets at or below it.
 *
 * Reads `state.algae.mass` directly — algae is a top-level organism
 * with mass / surplus, not a resource.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import type { TunableConfig } from '../config/index.js';
import { ceiled, latch } from './latch.js';

/** Algae mass the bloom alerts over: where it starts to shade plants. */
export function algaeAlertLine(config: TunableConfig): number {
  return config.plants.algaeShadingThreshold;
}

export const highAlgaeAlert: Alert = {
  id: 'high-algae',

  check(state: SimulationState, config: TunableConfig): AlertResult {
    const mass = state.algae.mass;
    return latch(
      state,
      'highAlgae',
      mass > algaeAlertLine(config),
      'algae',
      `High algae level: ${ceiled(mass, 1)} - shading plants, consider reducing light or scrubbing`
    );
  },
};
