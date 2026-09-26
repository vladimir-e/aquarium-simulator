import type { Resources } from '../state.js';
import { mapNutrients, type Nutrient } from '../config/nutrients.js';
import type { TankPools } from '../systems/nutrients.js';

/** A tank whose bed holds a copy of what its water does: every plant reads the water's shares, wherever it feeds. */
export function mirroredPools(water: Pick<Resources, Nutrient | 'water'>): TankPools {
  return [
    { stock: water, volume: water.water },
    { stock: mapNutrients((n) => water[n]), volume: water.water },
  ];
}
