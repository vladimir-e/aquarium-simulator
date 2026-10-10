/**
 * Plants — the canopy and the light at each plant's height. The flora pass
 * (`flora/`) runs them through their hour beside the blooms.
 */

import type { SimulationState } from '../state.js';
import { calculateTankHeight } from '../core/geometry.js';
import type { TunableConfig } from '../config/index.js';
import { canopyLight, lightAtHeight, unitOf, type PlantLight } from './canopy.js';

/**
 * Every plant's light, in `state.plants` order — the readings vitality runs on.
 * One O(N²) canopy pass.
 */
export function readPlantLight(state: SimulationState, config: TunableConfig): PlantLight[] {
  const depth = calculateTankHeight(state.tank.capacity);
  return canopyLight(state.plants, state, config.optics).map((canopy, i) =>
    lightAtHeight(unitOf(state.plants[i]), canopy, state.resources, depth)
  );
}

export { offerCarbon, calculateCo2Factor, plantFixer } from '../systems/photosynthesis.js';
export type { CarbonFixer } from '../systems/photosynthesis.js';
export {
  LEAF_AREA_PER_RATE_UNIT,
  plantHeight,
  leafArea,
  rateUnits,
  tissueMass,
  sizeOf,
  unitOf,
  canopyLight,
  floorCover,
  floorShade,
  floorLight,
  plantLightTaken,
  isOvergrown,
} from './canopy.js';
export type { CanopyLight, LightPath, PlantLight, Planted, Unit } from './canopy.js';
export { getRespirationTemperatureFactor } from '../systems/respiration.js';
export { VIGOUR_SPAN, MIN_PLANTABLE_SIZE, isPlantableSize } from './create-plant.js';
export {
  calculateNutrientSufficiency,
  speciesDemand,
  speciesHalfSaturation,
  nutrientShare,
  formHalfSaturations,
  formShares,
  formsMeet,
  bedPool,
  tankPools,
  plantFeeder,
  poolDraws,
  feederShares,
  nutrientsIn,
} from '../systems/nutrients.js';
export type { Feeder, NutrientPool, TankPools, PoolDraw } from '../systems/nutrients.js';
export {
  computePlantVitality,
  buildPlantStressors,
  buildPlantBenefits,
  plantNitrateEdge,
} from '../systems/plant-vitality.js';
