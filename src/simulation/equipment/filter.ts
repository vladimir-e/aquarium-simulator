/**
 * Filter equipment for biological filtration and water flow.
 *
 * Flow rates scale with tank size to achieve target turnover rates.
 * Each filter type has a maximum tank capacity it can realistically handle.
 */

export type FilterType = 'sponge' | 'hob' | 'canister' | 'sump';

export interface Filter {
  /** Whether filter is running */
  enabled: boolean;
  /** Filter type determines flow and surface area */
  type: FilterType;
}

export const DEFAULT_FILTER: Filter = {
  enabled: true,
  type: 'sponge',
};

/** Filter types in the order a picker offers them, smallest first. */
export const FILTER_TYPES: readonly FilterType[] = ['sponge', 'hob', 'canister', 'sump'];

/** Filter bacteria surface area by type (cm²) */
export const FILTER_SURFACE: Record<FilterType, number> = {
  sponge: 8000,
  hob: 15000,
  canister: 25000,
  sump: 40000,
};

/**
 * Filter specifications for flow rate scaling.
 * - targetTurnover: desired tank turnovers per hour
 * - maxCapacityLiters: largest tank the class is sold for
 * - maxFlowLph: the class's own flow ceiling
 *
 * The two limits are independent numbers and do not reconcile. At
 * `targetTurnover`, `maxFlowLph` runs out at 75 L for a sponge, 208.33 L for a
 * HOB and 562.5 L for a canister — the last of these short of the 568 L the
 * class is rated to, so a canister on the tank it is sold for is already
 * delivering under its own target turnover.
 */
export interface FilterSpec {
  targetTurnover: number;
  maxCapacityLiters: number;
  maxFlowLph: number;
}

export const FILTER_SPECS: Record<FilterType, FilterSpec> = {
  sponge: {
    targetTurnover: 4,
    maxCapacityLiters: 75, // ~20 gallons
    maxFlowLph: 300,
  },
  hob: {
    targetTurnover: 6,
    maxCapacityLiters: 208, // ~55 gallons
    maxFlowLph: 1250,
  },
  canister: {
    targetTurnover: 8,
    maxCapacityLiters: 568, // ~150 gallons
    maxFlowLph: 4500,
  },
  sump: {
    targetTurnover: 10,
    maxCapacityLiters: Infinity, // no realistic cap
    maxFlowLph: Infinity,
  },
};

/**
 * Whether a filter type is air-driven (provides aeration).
 * Sponge filters use air lift mechanism for flow, inherently aerating the water.
 */
export const FILTER_AIR_DRIVEN: Record<FilterType, boolean> = {
  sponge: true,
  hob: false,
  canister: false,
  sump: false,
};

/**
 * Checks if a filter type is air-driven (provides aeration).
 */
export function isFilterAirDriven(type: FilterType): boolean {
  return FILTER_AIR_DRIVEN[type];
}

/**
 * Gets the bacteria surface area for a filter type (cm²).
 */
export function getFilterSurface(type: FilterType): number {
  return FILTER_SURFACE[type];
}

/**
 * Gets the flow rate for a filter type scaled to tank capacity (L/h).
 * Flow = tankCapacity * targetTurnover, capped at maxFlowLph.
 */
export function getFilterFlow(type: FilterType, tankCapacityLiters: number): number {
  const spec = FILTER_SPECS[type];
  const calculatedFlow = tankCapacityLiters * spec.targetTurnover;
  return Math.min(calculatedFlow, spec.maxFlowLph);
}
