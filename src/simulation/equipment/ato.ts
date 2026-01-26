/**
 * Auto Top-Off (ATO) equipment - automatically restores water level.
 *
 * ATO monitors water level and tops off when level drops below 99% of capacity.
 * Restores water to exactly 100% in a single tick.
 *
 * When adding water:
 * - Temperature blends toward tap water temperature
 * - Dissolved gases blend with tap water concentrations (saturated O2, atmospheric CO2)
 * - pH blends toward tap water pH using H+ concentration math
 * - With mass-based nitrogen storage, ppm auto-decreases (no mass change needed)
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import { blendTemperature, blendConcentration, blendPH } from '../core/blending.js';
import { calculateO2Saturation } from '../systems/gas-exchange.js';
import { gasExchangeDefaults } from '../config/gas-exchange.js';

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
  const tapTemp = state.environment.tapWaterTemperature;
  const currentTemp = state.resources.temperature;
  const blendedTemp = blendTemperature(
    currentTemp,
    waterLevel,
    tapTemp,
    waterToAdd
  );
  const tempDelta = blendedTemp - currentTemp;

  // Calculate O2/CO2 blending
  // Tap water comes saturated with O2 (at tap temp) and at atmospheric CO2
  const tapO2Saturation = calculateO2Saturation(tapTemp);
  const tapCo2 = gasExchangeDefaults.atmosphericCo2;

  const blendedO2 = blendConcentration(
    state.resources.oxygen,
    waterLevel,
    tapO2Saturation,
    waterToAdd
  );
  const o2Delta = blendedO2 - state.resources.oxygen;

  const blendedCo2 = blendConcentration(
    state.resources.co2,
    waterLevel,
    tapCo2,
    waterToAdd
  );
  const co2Delta = blendedCo2 - state.resources.co2;

  // Calculate pH blending
  const tapPH = state.environment.tapWaterPH;
  const blendedPH = blendPH(
    state.resources.ph,
    waterLevel,
    tapPH,
    waterToAdd
  );
  const phDelta = blendedPH - state.resources.ph;

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

  // Add O2 effect if there's a change
  if (Math.abs(o2Delta) > 0.001) {
    effects.push({
      tier: 'immediate',
      resource: 'oxygen',
      delta: o2Delta,
      source: 'ato',
    });
  }

  // Add CO2 effect if there's a change
  if (Math.abs(co2Delta) > 0.001) {
    effects.push({
      tier: 'immediate',
      resource: 'co2',
      delta: co2Delta,
      source: 'ato',
    });
  }

  // Add pH effect if there's a change
  if (Math.abs(phDelta) > 0.001) {
    effects.push({
      tier: 'immediate',
      resource: 'ph',
      delta: phDelta,
      source: 'ato',
    });
  }

  return effects;
}
