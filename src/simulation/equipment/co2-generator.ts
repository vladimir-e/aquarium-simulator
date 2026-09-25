/**
 * CO2 Generator equipment - injects CO2 into the tank for planted aquariums.
 *
 * CO2 injection:
 * - Configurable bubble rate (0.5-5.0 bps)
 * - Schedule-based operation (like lights)
 * - Meters a mass into the water the tank is holding, so an evaporated tank
 *   reads a higher concentration off the same bubble rate
 *
 * The injected CO2 will naturally off-gas via the gas exchange system,
 * reaching equilibrium based on injection rate vs off-gassing rate.
 */

import { produce } from 'immer';
import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import { isScheduleActive } from '../core/schedule.js';
import { getPpm } from '../resources/index.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * mg of CO2 one bubble carries: a bubble-counter bubble is ~0.1 mL, and CO2
 * at room temperature and pressure weighs 1.8 mg/mL. At 1 bps for 8 hours a
 * day that empties a 5 lb cylinder in about fourteen months.
 */
const CO2_PER_BUBBLE = 0.18;

/** mg of CO2 per hour that one bubble per second delivers. */
export const CO2_MASS_RATE = CO2_PER_BUBBLE * 3600;

/**
 * Available bubble rate options (bubbles per second).
 * Range: 0.5 to 5.0 with 0.5 step.
 */
export const BUBBLE_RATE_OPTIONS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0] as const;

export type BubbleRate = (typeof BUBBLE_RATE_OPTIONS)[number];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate CO2 injection amount per tick (hour).
 * Uses mass-based calculation: larger tanks get less concentration change
 * from the same bubble rate.
 *
 * @param bubbleRate - Bubbles per second
 * @param waterVolume - Water actually in the tank, litres
 * @returns CO2 added in mg/L per hour
 */
export function calculateCo2Injection(bubbleRate: number, waterVolume: number): number {
  return getPpm(bubbleRate * CO2_MASS_RATE, waterVolume);
}

/**
 * Calculate expected CO2 rate for display.
 *
 * @param bubbleRate - Bubbles per second
 * @param waterVolume - Water actually in the tank, litres
 * @returns Formatted string showing expected rate
 */
export function formatCo2Rate(bubbleRate: number, waterVolume: number): string {
  const rate = calculateCo2Injection(bubbleRate, waterVolume);
  return `+${rate.toFixed(1)} mg/L/hr`;
}

// ============================================================================
// Equipment Update
// ============================================================================

export interface Co2GeneratorUpdateResult {
  effects: Effect[];
  isOn: boolean;
}

/**
 * Process CO2 generator: if enabled and schedule is active, inject CO2.
 * Returns effects and whether the generator is currently on.
 */
export function co2GeneratorUpdate(state: SimulationState): Co2GeneratorUpdateResult {
  const { co2Generator } = state.equipment;
  const hourOfDay = state.tick % 24;

  if (!co2Generator.enabled) {
    return { effects: [], isOn: false };
  }

  const isActive = isScheduleActive(hourOfDay, co2Generator.schedule);

  if (!isActive) {
    return { effects: [], isOn: false };
  }

  // Calculate CO2 to inject this tick (mass-based, depends on water volume)
  const co2Injection = calculateCo2Injection(co2Generator.bubbleRate, state.resources.water);

  const effects: Effect[] = [
    {
      tier: 'active',
      resource: 'co2',
      delta: co2Injection,
      source: 'co2-generator',
    },
  ];

  return { effects, isOn: true };
}

/**
 * Apply CO2 generator isOn state change.
 * Returns new state with updated isOn flag.
 */
export function applyCo2GeneratorStateChange(
  state: SimulationState,
  isOn: boolean
): SimulationState {
  if (state.equipment.co2Generator.isOn === isOn) {
    return state;
  }

  return produce(state, (draft) => {
    draft.equipment.co2Generator.isOn = isOn;
  });
}
