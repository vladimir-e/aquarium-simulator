/**
 * Passive resource calculations for surface area, water flow, and light.
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
import { calculateHardscapeTotalSurface } from './equipment/hardscape.js';
import { isScheduleActive } from './schedule.js';

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
 * Called each tick to recalculate surface, flow, and light based on current state.
 *
 * Surface area sources:
 * - Tank glass walls (bacteriaSurface)
 * - Filter media (when enabled)
 * - Substrate (based on type and tank capacity)
 * - Hardscape items (rocks, driftwood, decorations)
 *
 * Flow sources:
 * - Filter (when enabled)
 * - Powerhead (when enabled)
 *
 * Light sources:
 * - Light fixture (when enabled and schedule active)
 */
export function calculatePassiveResources(state: SimulationState): PassiveResources {
  const { tank, equipment, tick } = state;
  const hourOfDay = tick % 24;

  // Surface area
  let surface = tank.bacteriaSurface; // glass walls
  if (equipment.filter.enabled) {
    surface += getFilterSurface(equipment.filter.type);
  }
  surface += getSubstrateSurface(equipment.substrate.type, tank.capacity);
  surface += calculateHardscapeTotalSurface(equipment.hardscape.items);

  // Flow rate
  let flow = 0;
  if (equipment.filter.enabled) {
    flow += getFilterFlow(equipment.filter.type);
  }
  if (equipment.powerhead.enabled) {
    flow += getPowerheadFlow(equipment.powerhead.flowRateGPH);
  }

  // Light (based on schedule)
  let light = 0;
  if (equipment.light.enabled) {
    const isActive = isScheduleActive(hourOfDay, equipment.light.schedule);
    if (isActive) {
      light = equipment.light.wattage;
    }
  }

  return { surface, flow, light };
}
