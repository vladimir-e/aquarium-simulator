/**
 * Filter equipment for biological filtration and water flow.
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

/** Filter flow rate by type (L/h) */
export const FILTER_FLOW: Record<FilterType, number> = {
  sponge: 100,
  hob: 300,
  canister: 600,
  sump: 1000,
};

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
