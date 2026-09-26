/**
 * Plant power — leaf area × health, summed across the tank.
 *
 * The same primitive feeds two consumers:
 *   - Fish vitality: `plantPower` saturates a shelter benefit.
 *   - Algae vitality: `plantPower` drives the suppression stressor and
 *     the `low_plant_power` benefit.
 *
 * Per-plant contribution is its rate units × `condition / 100`: a full
 * thriving sword counts 2.8, a full monte carlo patch 0.5, a half-grown
 * one half that, and a dying plant (condition 0) nothing. It stays linear
 * in leaf area: what caps the leaf a tank carries is the light its own
 * canopy leaves it, on the plant side.
 *
 * Saturation / thresholds are the consumer's concern, not this
 * helper's.
 */

import type { Plant } from '../state.js';
import { rateUnits } from '../plants/canopy.js';

export function getPlantPower(plants: readonly Plant[]): number {
  if (plants.length === 0) return 0;
  let total = 0;
  for (const plant of plants) {
    total += rateUnits(plant) * (plant.condition / 100);
  }
  return total;
}
