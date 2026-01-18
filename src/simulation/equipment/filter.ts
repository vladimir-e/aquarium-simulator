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
 * - maxCapacityLiters: maximum tank size this filter can handle
 * - maxFlowLph: maximum flow rate (L/h), derived from maxCapacity * targetTurnover
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
