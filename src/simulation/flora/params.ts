/**
 * Each kind of flora's budget: carbon off the plants' photosynthesis and
 * respiration tunables, so a gram of tissue fixes and burns what its rate
 * units do today, and Droop quotas off the plants' config or a bloom kind's
 * traits.
 */

import type { PlantsConfig } from '../config/plants.js';
import { mapNutrients, type NutrientVector } from '../config/nutrients.js';
import { CO2_TO_CH2O_MASS_RATIO, N_TO_NO3_MASS_RATIO, P_TO_PO4_MASS_RATIO } from '../core/chemistry.js';
import { HOURS_PER_DAY } from '../core/clock.js';
import { tissuePerRateUnit, type FloraTraits } from '../systems/flora.js';
import type { FloraParams } from '../systems/flora-budget.js';
import { plantTraits, type PlantSpecies } from '../plants/species.js';
import { ALGAE, type AlgaeKind } from '../algae/traits.js';

type Composition = Pick<PlantsConfig, 'quotaMin' | 'quotaMax' | 'storeFillDays'>;

const NUTRIENT_PER_ELEMENT: Readonly<NutrientVector> = {
  nitrate: N_TO_NO3_MASS_RATIO,
  phosphate: P_TO_PO4_MASS_RATIO,
  potassium: 1,
  iron: 1,
};

const inEngineUnits = (quota: Readonly<NutrientVector>): NutrientVector =>
  mapNutrients((n) => quota[n] * NUTRIENT_PER_ELEMENT[n] * 1000);

function floraParams(
  { growthRate }: Pick<FloraTraits, 'growthRate'>,
  kappa: number,
  { quotaMin, quotaMax, storeFillDays }: Composition,
  config: PlantsConfig
): FloraParams {
  const photosynthatePerGram =
    (growthRate * config.co2PerRateUnit * CO2_TO_CH2O_MASS_RATIO) / (1000 * tissuePerRateUnit(config));
  const pAm = config.basePhotosynthesisRate * photosynthatePerGram;
  return {
    pAm,
    v: pAm / config.reserveCapacity,
    kappa,
    pM: config.baseRespirationRate * photosynthatePerGram,
    EG: 1 / config.growthEfficiency,
    kappaG: config.growthEfficiency,
    qMin: inEngineUnits(quotaMin),
    qMax: inEngineUnits(quotaMax),
    storeFillRate: mapNutrients(() => 1 / (storeFillDays * HOURS_PER_DAY)),
  };
}

export const plantParams = (species: PlantSpecies, config: PlantsConfig): FloraParams =>
  floraParams(plantTraits(species), config.somaShare, config, config);

/** A bloom's growth is its reproduction: it keeps no offshoot buffer, so its whole mobilisation goes to the soma. */
export const bloomParams = (kind: AlgaeKind, config: PlantsConfig): FloraParams =>
  floraParams(ALGAE[kind], 1, ALGAE[kind], config);
