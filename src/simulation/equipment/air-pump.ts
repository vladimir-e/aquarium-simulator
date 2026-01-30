/**
 * Air pump equipment for aeration.
 *
 * Air pumps provide:
 * - Direct O2 injection from bubble dissolution
 * - Increased gas exchange rate via surface agitation
 * - Small additional water flow from bubble uplift
 *
 * Air pumps auto-scale to tank size with realistic caps based on
 * typical aquarium air pump capabilities.
 */

export interface AirPump {
  /** Whether air pump is running */
  enabled: boolean;
}

export const DEFAULT_AIR_PUMP: AirPump = {
  enabled: false,
};

/**
 * Air pump specifications.
 * Based on typical aquarium air pumps (Tetra Whisper, Marina, etc.)
 */
export interface AirPumpSpec {
  /** Base air output in liters per hour */
  baseOutputLph: number;
  /** Maximum tank capacity this can effectively aerate (L) */
  maxCapacityLiters: number;
  /** Flow contribution from bubble uplift (L/h per L/h of air) */
  flowPerAirLph: number;
}

/**
 * Air pump scales with tank size.
 * Assumes appropriately sized air pump for the tank.
 *
 * Small tanks (< 40L): ~60 L/h air output
 * Medium tanks (40-150L): ~120 L/h air output
 * Large tanks (150-400L): ~240 L/h air output
 * Very large tanks (> 400L): ~400 L/h air output (realistic cap)
 */
export const AIR_PUMP_SPEC: AirPumpSpec = {
  baseOutputLph: 60, // Base for small tanks
  maxCapacityLiters: 400, // ~100 gallons, realistic max for single air stone
  flowPerAirLph: 0.1, // 10% of air output converts to water flow
};

/**
 * Gets the air output for a tank of given capacity (L/h).
 * Scales with tank size up to a realistic maximum.
 */
export function getAirPumpOutput(tankCapacityLiters: number): number {
  // Scale air output with tank size
  // Small: 60 L/h, Medium: 120 L/h, Large: 240 L/h, Cap: 400 L/h
  if (tankCapacityLiters <= 40) {
    return AIR_PUMP_SPEC.baseOutputLph;
  } else if (tankCapacityLiters <= 150) {
    return AIR_PUMP_SPEC.baseOutputLph * 2;
  } else if (tankCapacityLiters <= AIR_PUMP_SPEC.maxCapacityLiters) {
    return AIR_PUMP_SPEC.baseOutputLph * 4;
  } else {
    // Beyond max capacity, still provide max output but warn in UI
    return AIR_PUMP_SPEC.baseOutputLph * 6.67; // ~400 L/h cap
  }
}

/**
 * Gets the water flow contribution from air pump bubble uplift (L/h).
 * This is a small fraction of the air output.
 */
export function getAirPumpFlow(tankCapacityLiters: number): number {
  const airOutput = getAirPumpOutput(tankCapacityLiters);
  // Bubble uplift creates ~10% of air volume as water movement
  return Math.round(airOutput * AIR_PUMP_SPEC.flowPerAirLph);
}

/**
 * Checks if an air pump is undersized for the given tank capacity.
 */
export function isAirPumpUndersized(tankCapacityLiters: number): boolean {
  return tankCapacityLiters > AIR_PUMP_SPEC.maxCapacityLiters;
}
