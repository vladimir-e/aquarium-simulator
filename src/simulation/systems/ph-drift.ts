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
import type { TunableConfig } from '../config/index.js';
import { type PhConfig, phDefaults } from '../config/ph.js';

/**
 * Calculate the target pH based on hardscape items.
 * Multiple items of same type have cumulative effect with diminishing returns.
 *
 * @param items - Array of hardscape items in the tank
 * @returns Target pH value (between 6.0 and 8.0 typically)
 */
export function calculateHardscapeTargetPH(
  items: HardscapeItem[],
  config: PhConfig = phDefaults
): number {
  let target = config.neutralPh;
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
    const calcitePull = 1 - Math.pow(config.hardscapeDiminishingFactor, calciteCount);
    target += (config.calciteTargetPh - config.neutralPh) * calcitePull;
  }
  if (driftwoodCount > 0) {
    const driftwoodPull = 1 - Math.pow(config.hardscapeDiminishingFactor, driftwoodCount);
    target += (config.driftwoodTargetPh - config.neutralPh) * driftwoodPull;
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
export function calculateCO2PHEffect(
  co2: number,
  config: PhConfig = phDefaults
): number {
  const co2Excess = co2 - config.co2NeutralLevel;
  return co2Excess * config.co2PhCoefficient;
}

// ============================================================================
// System Implementation
// ============================================================================

export const phDriftSystem: System = {
  id: 'ph-drift',
  tier: 'passive',

  update(state: SimulationState, config: TunableConfig): Effect[] {
    const { resources, equipment } = state;
    const hardscapeItems = equipment.hardscape.items;
    const phConfig = config.ph;

    // Calculate target pH from hardscape
    const hardscapeTarget = calculateHardscapeTargetPH(hardscapeItems, phConfig);

    // Calculate CO2 effect (additive to target pH)
    const co2Effect = calculateCO2PHEffect(resources.co2, phConfig);

    // Effective target = hardscape target + CO2 effect
    const effectiveTarget = hardscapeTarget + co2Effect;

    // Drift toward target using exponential approach
    const phDelta = phConfig.basePgDriftRate * (effectiveTarget - resources.ph);

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
