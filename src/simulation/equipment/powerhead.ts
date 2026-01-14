/**
 * Powerhead equipment for additional water circulation.
 */

export type PowerheadFlowRate = 240 | 400 | 600 | 850;

export interface Powerhead {
  /** Whether powerhead is running */
  enabled: boolean;
  /** Flow rate preset in GPH (gallons per hour) */
  flowRateGPH: PowerheadFlowRate;
}

export const DEFAULT_POWERHEAD: Powerhead = {
  enabled: false,
  flowRateGPH: 400,
};

/** Powerhead flow rate conversion GPH to L/h */
export const POWERHEAD_FLOW_LPH: Record<PowerheadFlowRate, number> = {
  240: 908,
  400: 1514,
  600: 2271,
  850: 3218,
};

/**
 * Gets the flow rate for a powerhead setting (L/h).
 * Converts GPH to L/h.
 */
export function getPowerheadFlow(flowRateGPH: PowerheadFlowRate): number {
  return POWERHEAD_FLOW_LPH[flowRateGPH];
}
