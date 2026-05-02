/**
 * Plant power — biomass × health, summed across the tank.
 *
 * The same primitive feeds two consumers:
 *   - Fish vitality: `plantPower` saturates a shelter benefit.
 *   - Algae vitality: `plantPower` drives the suppression stressor and
 *     the `low_plant_power` benefit.
 *
 * Per-plant contribution is `(size / 100) × (condition / 100)`. A
 * full-grown (size 100) thriving (condition 100) plant counts as 1.0;
 * a half-grown plant at full health counts 0.5; a dying plant
 * (condition 0) counts 0. Overgrown plants count proportionally more —
 * a size-300 healthy plant contributes 3 units. That is intentional:
 * overgrowth is regulated on the plant side (self-shading and
 * interspecies competition push an overgrown plant toward stressed →
 * biomass dies back → contribution shrinks), so this helper stays
 * linear in raw biomass.
 *
 * Saturation / thresholds are the consumer's concern, not this
 * helper's.
 */

import type { Plant } from '../state.js';

export function getPlantPower(plants: readonly Plant[]): number {
  if (plants.length === 0) return 0;
  let total = 0;
  for (const plant of plants) {
    total += (plant.size / 100) * (plant.condition / 100);
  }
  return total;
}
