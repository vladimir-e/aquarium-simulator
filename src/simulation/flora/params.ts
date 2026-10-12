/**
 * Each kind of flora's budget: carbon off the plants' photosynthesis and
 * respiration tunables, so a gram of tissue fixes and burns what its rate
 * units do, and Droop quotas off the plants' config or a bloom kind's traits.
 */

import type { Plant } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { mapNutrients, type NutrientVector } from '../config/nutrients.js';
import { CO2_TO_CH2O_MASS_RATIO, MG_PER_G, N_TO_NO3_MASS_RATIO, P_TO_PO4_MASS_RATIO } from '../core/chemistry.js';
import { HOURS_PER_DAY } from '../core/clock.js';
import { TISSUE_PER_RATE_UNIT, type FloraTraits } from '../systems/flora.js';
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
  mapNutrients((n) => quota[n] * NUTRIENT_PER_ELEMENT[n]);

function floraParams(
  { growthRate }: Pick<FloraTraits, 'growthRate'>,
  kappa: number,
  { quotaMin, quotaMax, storeFillDays }: Composition,
  plantsConfig: PlantsConfig,
  vigour = 0
): FloraParams {
  const photosynthatePerGram =
    (growthRate * plantsConfig.co2PerRateUnit * CO2_TO_CH2O_MASS_RATIO) / (MG_PER_G * TISSUE_PER_RATE_UNIT);
  const pAm = (1 + vigour) * plantsConfig.basePhotosynthesisRate * photosynthatePerGram;
  return {
    pAm,
    v: pAm / plantsConfig.reserveCapacity,
    kappa,
    pM: plantsConfig.baseRespirationRate * photosynthatePerGram,
    EG: 1 / plantsConfig.growthEfficiency,
    kappaG: plantsConfig.growthEfficiency,
    qMin: inEngineUnits(quotaMin),
    qMax: inEngineUnits(quotaMax),
    storeFillRate: mapNutrients(() => 1 / (storeFillDays * HOURS_PER_DAY)),
  };
}

export const plantParams = (species: PlantSpecies, plantsConfig: PlantsConfig): FloraParams =>
  floraParams(plantTraits(species), plantsConfig.somaShare, plantsConfig, plantsConfig);

/** A unit's params: its species', its assimilation ceiling lifted by `1 + vigour`. */
export const unitParams = ({ species, vigour }: Pick<Plant, 'species' | 'vigour'>, plantsConfig: PlantsConfig): FloraParams =>
  floraParams(plantTraits(species), plantsConfig.somaShare, plantsConfig, plantsConfig, vigour);

/** A bloom's growth is its reproduction: it keeps no offshoot buffer, so its whole mobilisation goes to the soma. */
export const bloomParams = (kind: AlgaeKind, plantsConfig: PlantsConfig): FloraParams =>
  floraParams(ALGAE[kind], 1, ALGAE[kind], plantsConfig);
