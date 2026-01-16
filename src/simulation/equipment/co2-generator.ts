/**
 * CO2 Generator equipment - injects CO2 into the tank for planted aquariums.
 *
 * CO2 injection:
 * - Configurable bubble rate (0.5-5.0 bps)
 * - Schedule-based operation (like lights)
 * - Adds CO2 at 1.5 mg/L per hour per bubble/sec
 *
 * The injected CO2 will naturally off-gas via the gas exchange system,
 * reaching equilibrium based on injection rate vs off-gassing rate.
 */

import { produce } from 'immer';
import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import { isScheduleActive } from '../core/schedule.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * CO2 dosing rate: mg/L per hour per bubble per second.
 * At 1 bps, this adds 1.5 mg/L of CO2 per hour.
 */
export const CO2_DOSING_RATE = 1.5;

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
 *
 * @param bubbleRate - Bubbles per second
 * @returns CO2 added in mg/L per hour
 */
export function calculateCo2Injection(bubbleRate: number): number {
  return bubbleRate * CO2_DOSING_RATE;
}

/**
 * Calculate expected CO2 rate for display.
 *
 * @param bubbleRate - Bubbles per second
 * @returns Formatted string showing expected rate
 */
export function formatCo2Rate(bubbleRate: number): string {
  const rate = calculateCo2Injection(bubbleRate);
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

  // Calculate CO2 to inject this tick
  const co2Injection = calculateCo2Injection(co2Generator.bubbleRate);

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
