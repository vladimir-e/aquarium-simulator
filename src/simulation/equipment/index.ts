/**
 * Equipment registry and effect collector.
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import { calculateTankGlassSurface } from '../state.js';
import {
  heaterUpdate,
  applyHeaterStateChange,
  calculateHeatingRate,
} from './heater.js';
import { atoUpdate } from './ato.js';
import { getFilterSurface, getFilterFlow, isFilterAirDriven, type FilterType, type Filter, type FilterSpec, DEFAULT_FILTER, FILTER_SURFACE, FILTER_SPECS, FILTER_AIR_DRIVEN } from './filter.js';
import { getPowerheadFlow, type PowerheadFlowRate, type Powerhead, DEFAULT_POWERHEAD, POWERHEAD_FLOW_LPH } from './powerhead.js';
import { getSubstrateSurface, type SubstrateType, type Substrate, DEFAULT_SUBSTRATE, SUBSTRATE_SURFACE_PER_LITER } from './substrate.js';
import { calculateHardscapeTotalSurface } from './hardscape.js';
import {
  co2GeneratorUpdate,
  applyCo2GeneratorStateChange,
  calculateCo2Injection,
  formatCo2Rate,
  CO2_MASS_RATE,
  BUBBLE_RATE_OPTIONS,
  type BubbleRate,
} from './co2-generator.js';
import { getLightOutput, type Light, type LightWattage, DEFAULT_LIGHT, LIGHT_WATTAGE_OPTIONS } from './light.js';
import {
  getAirPumpOutput,
  getAirPumpFlow,
  isAirPumpUndersized,
  type AirPump,
  DEFAULT_AIR_PUMP,
  AIR_PUMP_SPEC,
} from './air-pump.js';

// Re-export equipment modules
export { heaterUpdate, applyHeaterStateChange, calculateHeatingRate };
export { atoUpdate };
export { getFilterSurface, getFilterFlow, isFilterAirDriven, type FilterType, type Filter, type FilterSpec, DEFAULT_FILTER, FILTER_SURFACE, FILTER_SPECS, FILTER_AIR_DRIVEN };
export { getPowerheadFlow, type PowerheadFlowRate, type Powerhead, DEFAULT_POWERHEAD, POWERHEAD_FLOW_LPH };
export { getSubstrateSurface, type SubstrateType, type Substrate, DEFAULT_SUBSTRATE, SUBSTRATE_SURFACE_PER_LITER };
export {
  co2GeneratorUpdate,
  applyCo2GeneratorStateChange,
  calculateCo2Injection,
  formatCo2Rate,
  CO2_MASS_RATE,
  BUBBLE_RATE_OPTIONS,
  type BubbleRate,
};
export { getLightOutput, type Light, type LightWattage, DEFAULT_LIGHT, LIGHT_WATTAGE_OPTIONS };
export {
  getAirPumpOutput,
  getAirPumpFlow,
  isAirPumpUndersized,
  type AirPump,
  DEFAULT_AIR_PUMP,
  AIR_PUMP_SPEC,
};

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

  // Process CO2 generator
  const co2Result = co2GeneratorUpdate(updatedState);
  effects.push(...co2Result.effects);
  updatedState = applyCo2GeneratorStateChange(updatedState, co2Result.isOn);

  return { state: updatedState, effects };
}

/**
 * Passive resource values calculated from equipment.
 */
export interface PassiveResourceValues {
  surface: number;
  flow: number;
  light: number;
  aeration: boolean;
}

/**
 * Calculates passive resources from all equipment.
 * Called each tick to recalculate surface, flow, light, and aeration based on current state.
 *
 * Surface area sources:
 * - Tank glass walls (calculated from capacity)
 * - Filter media (when enabled)
 * - Substrate (based on type and tank capacity)
 * - Hardscape items (rocks, driftwood, decorations)
 *
 * Flow sources:
 * - Filter (when enabled)
 * - Powerhead (when enabled)
 * - Air pump (when enabled, small contribution from bubble uplift)
 *
 * Light sources:
 * - Light fixture (when enabled and schedule active)
 *
 * Aeration sources:
 * - Air pump (when enabled)
 * - Air-driven filter (sponge filter)
 */
export function calculatePassiveResources(state: SimulationState): PassiveResourceValues {
  const { tank, equipment, tick } = state;
  const hourOfDay = tick % 24;

  // Calculate tank glass surface from capacity
  const tankGlassSurface = calculateTankGlassSurface(tank.capacity);

  // Surface area
  let surface = tankGlassSurface;
  if (equipment.filter.enabled) {
    surface += getFilterSurface(equipment.filter.type);
  }
  surface += getSubstrateSurface(equipment.substrate.type, tank.capacity);
  surface += calculateHardscapeTotalSurface(equipment.hardscape.items);

  // Flow rate (scaled to tank capacity)
  let flow = 0;
  if (equipment.filter.enabled) {
    flow += getFilterFlow(equipment.filter.type, tank.capacity);
  }
  if (equipment.powerhead.enabled) {
    flow += getPowerheadFlow(equipment.powerhead.flowRateGPH);
  }
  // Air pump adds small flow from bubble uplift
  if (equipment.airPump.enabled) {
    flow += getAirPumpFlow(tank.capacity);
  }

  // Light (based on schedule)
  const light = getLightOutput(equipment.light, hourOfDay);

  // Aeration: active if air pump is on OR filter is air-driven (sponge)
  const filterAerates = equipment.filter.enabled && isFilterAirDriven(equipment.filter.type);
  const aeration = equipment.airPump.enabled || filterAerates;

  return { surface, flow, light, aeration };
}
