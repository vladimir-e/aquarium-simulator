/**
 * Heater equipment - maintains tank temperature at target.
 *
 * The heater and temperature drift formulas share constants to ensure
 * realistic equilibrium behavior. An underpowered heater will plateau
 * below target (realistic).
 *
 * Calibration: 1.3 W/L achieves ~5.5°C rise above room temp at equilibrium.
 */

import { produce } from 'immer';
import type { Effect } from '../effects.js';
import type { SimulationState } from '../state.js';
import { REFERENCE_VOLUME, VOLUME_EXPONENT } from '../systems/temperature-drift.js';

/**
 * Calculates the heating rate for one tick (1 hour).
 */
export function calculateHeatingRate(
  wattage: number,
  waterVolume: number
): number {
  const volumeScale = Math.pow(REFERENCE_VOLUME / waterVolume, VOLUME_EXPONENT);
  return (wattage / waterVolume) * volumeScale;
}

/**
 * Updates the heater state and generates heating effects.
 * Returns a tuple of [effects, updated heater isOn state].
 */
export function heaterUpdate(state: SimulationState): {
  effects: Effect[];
  isOn: boolean;
} {
  const { heater } = state.equipment;
  const currentTemp = state.resources.temperature;
  const waterVolume = state.tank.waterLevel;

  // If disabled, do nothing
  if (!heater.enabled) {
    return { effects: [], isOn: false };
  }

  // If at or above target, turn off
  if (currentTemp >= heater.targetTemperature) {
    return { effects: [], isOn: false };
  }

  // Below target - heat up
  const heatingRate = calculateHeatingRate(heater.wattage, waterVolume);
  const tempGap = heater.targetTemperature - currentTemp;
  const delta = Math.min(heatingRate, tempGap); // Don't overshoot

  return {
    effects: [
      {
        tier: 'immediate',
        resource: 'temperature',
        delta,
        source: 'heater',
      },
    ],
    isOn: true,
  };
}

/**
 * Applies heater state changes (isOn) to the simulation state.
 */
export function applyHeaterStateChange(
  state: SimulationState,
  isOn: boolean
): SimulationState {
  if (state.equipment.heater.isOn === isOn) {
    return state;
  }

  return produce(state, (draft) => {
    draft.equipment.heater.isOn = isOn;
  });
}
