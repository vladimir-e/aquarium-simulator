/**
 * Plants — the canopy and the light at each plant's height. The flora pass
 * (`flora/`) runs them through their hour beside the bloom.
 */

import { calculateTankHeight, type SimulationState } from '../state.js';
import type { TunableConfig } from '../config/index.js';
import { canopyLight, lightAtHeight, type PlantLight } from './canopy.js';

/**
 * Every plant's light, in `state.plants` order — the readings vitality runs on.
 * One O(N²) canopy pass.
 */
export function readPlantLight(state: SimulationState, config: TunableConfig): PlantLight[] {
  const depth = calculateTankHeight(state.tank.capacity);
  return canopyLight(state.plants, state.tank.capacity, config.optics).map((canopy, i) =>
    lightAtHeight(state.plants[i], canopy, state.resources, depth)
  );
}

export {
  calculatePhotosynthesis,
  calculateCo2Factor,
  plantFixer,
} from '../systems/photosynthesis.js';
export type { CarbonFixer } from '../systems/photosynthesis.js';
export {
  LEAF_AREA_PER_RATE_UNIT,
  plantHeight,
  leafArea,
  rateUnits,
  getTotalRateUnits,
  canopyLight,
  floorCover,
  floorShade,
  isOvergrown,
} from './canopy.js';
export type { CanopyLight, PlantLight } from './canopy.js';
export {
  calculateRespiration,
  getRespirationTemperatureFactor,
} from '../systems/respiration.js';
export {
  spendSurplus,
  propagate,
  getSpeciesGrowthRate,
} from '../systems/plant-growth.js';
export type { Propagation } from '../systems/plant-growth.js';
export { VIGOUR_SPAN, MIN_PLANTABLE_SIZE, isPlantableSize } from './create-plant.js';
export {
  calculateNutrientSufficiency,
  speciesDemand,
  speciesHalfSaturation,
  nutrientShare,
  nutrientShares,
  tankPools,
  plantFeeder,
  poolDraws,
  feederShares,
  organicNutrients,
} from '../systems/nutrients.js';
export type { Feeder, NutrientPool, TankPools, PoolDraw } from '../systems/nutrients.js';
export { tissueMass, tissuePerRateUnit, shedShare } from '../systems/plant-lifecycle.js';
export {
  computePlantVitality,
  buildPlantStressors,
  buildPlantBenefits,
  plantHealingRate,
  plantNitrateEdge,
} from '../systems/plant-vitality.js';
