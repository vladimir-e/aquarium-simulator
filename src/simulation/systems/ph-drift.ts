/**
 * pH Drift System - equilibrates pH based on hardscape and CO2.
 * Runs in PASSIVE tier.
 *
 * - Hardscape effect: calcite rock pushes pH up, driftwood pushes pH down
 * - CO2 effect: high CO2 lowers pH (carbonic acid formation)
 * - Neutral equilibrium around 7.0 when no hardscape present
 * - Multiple items of same type = stronger effect with diminishing returns
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState, HardscapeItem } from '../state.js';
import type { System } from './types.js';

// ============================================================================
// Constants
// ============================================================================

/** pH target for calcite rock (pushes pH up) */
export const CALCITE_TARGET_PH = 8.0;

/** pH target for driftwood (pushes pH down) */
export const DRIFTWOOD_TARGET_PH = 6.0;

/** Neutral pH when no hardscape present */
export const NEUTRAL_PH = 7.0;

/** Base drift rate (fraction toward target per tick) */
export const BASE_PH_DRIFT_RATE = 0.05;

/**
 * CO2 effect on pH.
 * At atmospheric CO2 (~4 mg/L), no effect.
 * Each mg/L above atmospheric lowers pH by this amount.
 */
export const CO2_PH_COEFFICIENT = -0.02;

/** CO2 level at atmospheric equilibrium (no pH effect) */
export const CO2_NEUTRAL_LEVEL = 4.0;

/**
 * Diminishing returns factor for multiple hardscape items.
 * Each additional item has this fraction of the previous item's effect.
 */
export const HARDSCAPE_DIMINISHING_FACTOR = 0.7;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate the target pH based on hardscape items.
 * Multiple items of same type have cumulative effect with diminishing returns.
 *
 * @param items - Array of hardscape items in the tank
 * @returns Target pH value (between 6.0 and 8.0 typically)
 */
export function calculateHardscapeTargetPH(items: HardscapeItem[]): number {
  let target = NEUTRAL_PH;
  let calciteCount = 0;
  let driftwoodCount = 0;

  for (const item of items) {
    if (item.type === 'calcite_rock') calciteCount++;
    if (item.type === 'driftwood') driftwoodCount++;
  }

  // Weighted pull toward respective targets
  // More items = stronger pull, but with diminishing returns
  // Formula: pull = 1 - (diminishing_factor ^ count) approaches 1 asymptotically
  if (calciteCount > 0) {
    const calcitePull = 1 - Math.pow(HARDSCAPE_DIMINISHING_FACTOR, calciteCount);
    target += (CALCITE_TARGET_PH - NEUTRAL_PH) * calcitePull;
  }
  if (driftwoodCount > 0) {
    const driftwoodPull = 1 - Math.pow(HARDSCAPE_DIMINISHING_FACTOR, driftwoodCount);
    target += (DRIFTWOOD_TARGET_PH - NEUTRAL_PH) * driftwoodPull;
  }

  return target;
}

/**
 * Calculate pH adjustment from CO2 level.
 * High CO2 lowers pH (carbonic acid formation: CO2 + H2O -> H2CO3).
 *
 * @param co2 - Current CO2 concentration in mg/L
 * @returns pH adjustment (negative for high CO2)
 */
export function calculateCO2PHEffect(co2: number): number {
  const co2Excess = co2 - CO2_NEUTRAL_LEVEL;
  return co2Excess * CO2_PH_COEFFICIENT;
}

// ============================================================================
// System Implementation
// ============================================================================

export const phDriftSystem: System = {
  id: 'ph-drift',
  tier: 'passive',

  update(state: SimulationState): Effect[] {
    const { resources, equipment } = state;
    const hardscapeItems = equipment.hardscape.items;

    // Calculate target pH from hardscape
    const hardscapeTarget = calculateHardscapeTargetPH(hardscapeItems);

    // Calculate CO2 effect (additive to target pH)
    const co2Effect = calculateCO2PHEffect(resources.co2);

    // Effective target = hardscape target + CO2 effect
    const effectiveTarget = hardscapeTarget + co2Effect;

    // Drift toward target using exponential approach
    const phDelta = BASE_PH_DRIFT_RATE * (effectiveTarget - resources.ph);

    // Skip negligible changes
    if (Math.abs(phDelta) < 0.001) return [];

    return [{
      tier: 'passive',
      resource: 'ph',
      delta: phDelta,
      source: 'ph-drift',
    }];
  },
};
