/**
 * Passive resource calculations for surface area and water flow.
 * Passive resources are recalculated each tick from current equipment state.
 */

import type {
  SimulationState,
  PassiveResources,
  FilterType,
  PowerheadFlowRate,
  SubstrateType,
} from './state.js';
import {
  FILTER_SURFACE,
  FILTER_FLOW,
  POWERHEAD_FLOW_LPH,
  SUBSTRATE_SURFACE_PER_LITER,
} from './state.js';

/**
 * Gets the bacteria surface area for a filter type (cm²).
 */
export function getFilterSurface(type: FilterType): number {
  return FILTER_SURFACE[type];
}

/**
 * Gets the flow rate for a filter type (L/h).
 */
export function getFilterFlow(type: FilterType): number {
  return FILTER_FLOW[type];
}

/**
 * Gets the flow rate for a powerhead setting (L/h).
 * Converts GPH to L/h.
 */
export function getPowerheadFlow(flowRateGPH: PowerheadFlowRate): number {
  return POWERHEAD_FLOW_LPH[flowRateGPH];
}

/**
 * Gets the bacteria surface area for a substrate type (cm²).
 * Surface scales with tank capacity.
 */
export function getSubstrateSurface(type: SubstrateType, tankCapacity: number): number {
  return SUBSTRATE_SURFACE_PER_LITER[type] * tankCapacity;
}

/**
 * Calculates passive resources from all equipment.
 * Called each tick to recalculate surface and flow based on current state.
 *
 * Surface area sources:
 * - Tank glass walls (bacteriaSurface)
 * - Filter media (when enabled)
 * - Substrate (based on type and tank capacity)
 *
 * Flow sources:
 * - Filter (when enabled)
 * - Powerhead (when enabled)
 */
export function calculatePassiveResources(state: SimulationState): PassiveResources {
  const { tank, equipment } = state;

  // Surface area
  let surface = tank.bacteriaSurface; // glass walls
  if (equipment.filter.enabled) {
    surface += getFilterSurface(equipment.filter.type);
  }
  surface += getSubstrateSurface(equipment.substrate.type, tank.capacity);

  // Flow rate
  let flow = 0;
  if (equipment.filter.enabled) {
    flow += getFilterFlow(equipment.filter.type);
  }
  if (equipment.powerhead.enabled) {
    flow += getPowerheadFlow(equipment.powerhead.flowRateGPH);
  }

  return { surface, flow };
}
