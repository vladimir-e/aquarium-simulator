import type { Resources } from '../state.js';
import { mapForms, type NutrientForm } from '../config/nutrients.js';
import type { TankPools } from '../systems/nutrients.js';

/** A tank whose bed holds a copy of what its water does: every plant reads the water's shares, wherever it feeds. */
export function mirroredPools(water: Pick<Resources, NutrientForm | 'water'>): TankPools {
  return [
    { stock: water, volume: water.water },
    { stock: mapForms((f) => water[f]), volume: water.water },
  ];
}
