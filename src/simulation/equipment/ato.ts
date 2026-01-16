/**
 * Auto Top-Off (ATO) equipment - automatically restores water level.
 *
 * ATO monitors water level and tops off when level drops below 99% of capacity.
 * Restores water to exactly 100% in a single tick.
 *
 * When adding water:
 * - Temperature blends toward tap water temperature
 * - With mass-based nitrogen storage, ppm auto-decreases (no mass change needed)
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import { blendTemperature } from '../core/blending.js';

/**
 * Water level threshold as fraction of capacity.
 * ATO triggers when water level falls below this threshold.
 */
export const WATER_LEVEL_THRESHOLD = 0.99;

/**
 * Process ATO: if water is below threshold, returns effects to top off to 100%
 * with temperature blending.
 */
export function atoUpdate(state: SimulationState): Effect[] {
  const { ato } = state.equipment;
  const { capacity } = state.tank;
  const waterLevel = state.resources.water;

  if (!ato.enabled) {
    return [];
  }

  const thresholdLevel = capacity * WATER_LEVEL_THRESHOLD;

  if (waterLevel >= thresholdLevel) {
    return [];
  }

  const waterToAdd = capacity - waterLevel;
  const currentTemp = state.resources.temperature;
  const blendedTemp = blendTemperature(
    currentTemp,
    waterLevel,
    state.environment.tapWaterTemperature,
    waterToAdd
  );
  const tempDelta = blendedTemp - currentTemp;

  const effects: Effect[] = [
    {
      tier: 'immediate',
      resource: 'water',
      delta: waterToAdd,
      source: 'ato',
    },
  ];

  // Only add temperature effect if there's an actual change
  if (tempDelta !== 0) {
    effects.push({
      tier: 'immediate',
      resource: 'temperature',
      delta: tempDelta,
      source: 'ato',
    });
  }

  return effects;
}
