/**
 * Equipment registry and effect collector.
 */

import type { Effect } from '../effects.js';
import type { SimulationState } from '../state.js';
import {
  heaterUpdate,
  applyHeaterStateChange,
  calculateHeatingRate,
} from './heater.js';
import { atoUpdate } from './ato.js';

export { heaterUpdate, applyHeaterStateChange, calculateHeatingRate };
export { atoUpdate };

/**
 * Collects effects from all equipment and applies equipment state changes.
 * Returns the updated state and collected effects.
 */
export function processEquipment(state: SimulationState): {
  state: SimulationState;
  effects: Effect[];
} {
  const effects: Effect[] = [];
  let updatedState = state;

  // Process heater
  const heaterResult = heaterUpdate(updatedState);
  effects.push(...heaterResult.effects);
  updatedState = applyHeaterStateChange(updatedState, heaterResult.isOn);

  // Process ATO
  const atoEffects = atoUpdate(updatedState);
  effects.push(...atoEffects);

  return { state: updatedState, effects };
}
