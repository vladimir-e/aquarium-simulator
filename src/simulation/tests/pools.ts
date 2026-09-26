import type { Resources } from '../state.js';
import type { Nutrient } from '../config/nutrients.js';
import type { TankPools } from '../systems/nutrients.js';

/** The pools of a tank whose bed holds what its water does: every plant reads the water's shares, wherever it feeds. */
export function mirroredPools(water: Pick<Resources, Nutrient | 'water'>): TankPools {
  const pool = { stock: water, volume: water.water };
  return [pool, pool];
}
