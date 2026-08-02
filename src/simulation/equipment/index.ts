/**
 * Equipment registry and effect collector.
 */

import { produce } from 'immer';
import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import { calculateTankGlassSurface } from '../state.js';
import type { TunableConfig } from '../config/index.js';
import {
  heaterUpdate,
  applyHeaterStateChange,
  calculateHeatingRate,
  HEATER_WATTAGE_OPTIONS,
} from './heater.js';
import { atoUpdate } from './ato.js';
import { getFilterSurface, getFilterFlow, isFilterAirDriven, type FilterType, type Filter, type FilterSpec, DEFAULT_FILTER, FILTER_TYPES, FILTER_SURFACE, FILTER_SPECS, FILTER_AIR_DRIVEN } from './filter.js';
import { getPowerheadFlow, type PowerheadFlowRate, type Powerhead, DEFAULT_POWERHEAD, POWERHEAD_FLOW_LPH, POWERHEAD_FLOW_RATES } from './powerhead.js';
import {
  getSubstrateSurface,
  getSubstrateOrganicReserve,
  replaceSubstrate,
  calculateSubstrateLeach,
  substrateUpdate,
  type SubstrateType,
  type Substrate,
  DEFAULT_SUBSTRATE,
  SUBSTRATE_SURFACE_PER_LITER,
  SUBSTRATE_ORGANIC_PER_LITER,
} from './substrate.js';
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
import {
  autoDoserUpdate,
  applyAutoDoserSettings,
  shouldDose,
  type AutoDoser,
  DEFAULT_AUTO_DOSER,
  DOSE_AMOUNT_OPTIONS,
  type DoseAmount,
} from './auto-doser.js';

// Re-export equipment modules
export { heaterUpdate, applyHeaterStateChange, calculateHeatingRate, HEATER_WATTAGE_OPTIONS };
export { atoUpdate };
export { getFilterSurface, getFilterFlow, isFilterAirDriven, type FilterType, type Filter, type FilterSpec, DEFAULT_FILTER, FILTER_TYPES, FILTER_SURFACE, FILTER_SPECS, FILTER_AIR_DRIVEN };
export { getPowerheadFlow, type PowerheadFlowRate, type Powerhead, DEFAULT_POWERHEAD, POWERHEAD_FLOW_LPH, POWERHEAD_FLOW_RATES };
export {
  getSubstrateSurface,
  getSubstrateOrganicReserve,
  replaceSubstrate,
  calculateSubstrateLeach,
  substrateUpdate,
  type SubstrateType,
  type Substrate,
  DEFAULT_SUBSTRATE,
  SUBSTRATE_SURFACE_PER_LITER,
  SUBSTRATE_ORGANIC_PER_LITER,
};
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
export {
  autoDoserUpdate,
  applyAutoDoserSettings,
  shouldDose,
  type AutoDoser,
  DEFAULT_AUTO_DOSER,
  DOSE_AMOUNT_OPTIONS,
  type DoseAmount,
};

/**
 * Collects effects from all equipment and applies equipment state changes.
 * Returns the updated state and collected effects.
 */
export function processEquipment(
  state: SimulationState,
  config: TunableConfig
): {
  state: SimulationState;
  effects: Effect[];
} {
  const effects: Effect[] = [];
  let updatedState = state;

  // Process substrate leaching
  const substrateResult = substrateUpdate(updatedState, config.decay);
  effects.push(...substrateResult.effects);
  updatedState = substrateResult.state;

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

  // Process auto doser
  const autoDoserResult = autoDoserUpdate(updatedState);
  effects.push(...autoDoserResult.effects);
  updatedState = autoDoserResult.state;

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

/**
 * The share of the biofilm a tank keeps when the bed currently in it comes out.
 *
 * A colony is a stock spread over every colonisable cm² the tank has, so a bed
 * that carries most of that surface carries most of the nitrifiers away in the
 * bucket, and whatever is laid in its place arrives sterile — which is why a
 * rescape blips even though the glass and the filter media never left the tank.
 *
 * A bed that stays put costs nothing, but that is not a question about types:
 * a fresh bag of the same soil is still a new bed. The callers that can leave
 * the bed alone recognise it by identity before they ask this.
 */
export function biofilmKept(state: SimulationState): number {
  const bed = state.equipment.substrate;
  const surface = calculatePassiveResources(state).surface;
  const lost = getSubstrateSurface(bed.type, state.tank.capacity);
  return surface > 0 ? 1 - lost / surface : 1;
}

/**
 * Pull the bed out and lay a different one in its place, and the biofilm that
 * lived on it goes out with it.
 *
 * Returns the same state when the bed is already of that type.
 */
export function rescape(state: SimulationState, type: SubstrateType): SimulationState {
  const bed = state.equipment.substrate;
  const laid = replaceSubstrate(bed, type, state.tank.capacity);
  if (laid === bed) return state;

  const kept = biofilmKept(state);

  return produce(state, (draft) => {
    draft.equipment.substrate = laid;
    draft.resources.aob *= kept;
    draft.resources.nob *= kept;
    draft.resources.surface = calculatePassiveResources(draft).surface;
  });
}
