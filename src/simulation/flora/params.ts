/**
 * Each kind of flora's budget: carbon off the plants' photosynthesis and
 * respiration tunables, so a gram of tissue fixes and burns what its rate
 * units do today, and Droop quotas off culture and field tissue ranges.
 */

import type { PlantsConfig } from '../config/plants.js';
import { mapNutrients, type NutrientVector } from '../config/nutrients.js';
import { CO2_TO_CH2O_MASS_RATIO, N_TO_NO3_MASS_RATIO, P_TO_PO4_MASS_RATIO } from '../core/chemistry.js';
import { HOURS_PER_DAY } from '../core/clock.js';
import { tissuePerRateUnit, type FloraTraits } from '../systems/flora.js';
import type { FloraParams } from '../systems/flora-budget.js';
import { plantTraits, type PlantSpecies } from '../plants/species.js';
import { ALGAE, type AlgaeKind } from '../algae/traits.js';

type FloraKind = 'plant' | AlgaeKind;

/** Mass fraction of each element in a gram of tissue. */
interface Elements {
  N: number;
  P: number;
  K: number;
  Fe: number;
}

interface KindBudget {
  kappa: number;
  qMin: Elements;
  qMax: Elements;
  /** Days an empty store takes to fill at saturating concentration, at its opening rate. */
  storeFillDays: number;
}

const MG_PER_G = 1000;

const KAPPA_G = 0.8;

/** Starch runs 10–30 % of plant tissue: a full reserve is the top of it. */
const RESERVE_CAPACITY = 0.3;

/**
 * Plants share one composition, macrophyte dry-weight figures × 1.25 for ash.
 * N: PCLake submerged vegetation 1.0–3.5 % (Janse 2005); Gerloff 1975 culture
 * floors 0.4–1.1 %, maxima 3.3–4.3 %; critical 1.3 % (Gerloff & Krombholz 1966).
 * P: PCLake 0.08–0.35 %; Gerloff 1975 floors 0.03–0.06 %, maxima 0.35–0.73 %;
 * critical 0.13 % (G&K 1966). K: Gerloff 1975 floors 0.25–0.3 %, maxima
 * 1.1–5.1 %; Linn 1973 survey mean 1.54 %. Fe: Gerloff 1975 Elodea floor
 * 40 ppm, culture maximum 219 ppm.
 *
 * Green water, planktonic chlorophytes. N: PCLake greens 2–10 % (Janse 2005);
 * Bougaran 2010 S. minutum q₀ 3.5 %, q_max 12 %; Healey & Hendzel 1980 severe
 * deficiency under 4 %. P: PCLake 0.15–1.5 %; Bougaran 2010 q₀ 0.23 %, q_max
 * 1.9 %. K: Gerloff & Fishbeck 1969 Chlorella critical 0.4 %; Ho 2003 replete
 * 2.2 %. Fe: Glaesener 2013 C. reinhardtii limited 30–90 ppm, replete
 * 140–400 ppm; Sunda & Huntsman 1995 70 ppm at maximum growth.
 *
 * Film, periphyton per ash-free dry mass. N: Schmidt 2019 Droop Q_min 3.4 %;
 * Kahlert 1998 deficient under 4.8–5.3 %; Hillebrand & Sommer 1999 optimum
 * 7.5–8.3 %. P: Schmidt 2019 Q_min 0.17 %; H&S 1999 optimum 0.98–1.08 %; Fanta
 * 2010 lab plateau 1.07 %. K and Fe have no periphyton figures: green water's,
 * on the same photosynthetic machinery.
 *
 * Nothing publishes a store's fill time; these are Tune's.
 */
const KINDS: Readonly<Record<FloraKind, KindBudget>> = {
  plant: {
    kappa: 0.8,
    qMin: { N: 0.012, P: 0.0008, K: 0.004, Fe: 5e-5 },
    qMax: { N: 0.045, P: 0.006, K: 0.025, Fe: 2.5e-4 },
    storeFillDays: 3,
  },
  greenWater: {
    kappa: 1,
    qMin: { N: 0.025, P: 0.0015, K: 0.004, Fe: 2e-5 },
    qMax: { N: 0.1, P: 0.015, K: 0.022, Fe: 2e-4 },
    storeFillDays: 1,
  },
  film: {
    kappa: 1,
    qMin: { N: 0.03, P: 0.0017, K: 0.004, Fe: 2e-5 },
    qMax: { N: 0.08, P: 0.01, K: 0.022, Fe: 2e-4 },
    storeFillDays: 2,
  },
};

function inEngineUnits({ N, P, K, Fe }: Elements): NutrientVector {
  return {
    nitrate: MG_PER_G * N * N_TO_NO3_MASS_RATIO,
    phosphate: MG_PER_G * P * P_TO_PO4_MASS_RATIO,
    potassium: MG_PER_G * K,
    iron: MG_PER_G * Fe,
  };
}

function floraParams(
  kind: FloraKind,
  { growthRate }: Pick<FloraTraits, 'growthRate'>,
  config: PlantsConfig
): FloraParams {
  const { kappa, qMin, qMax, storeFillDays } = KINDS[kind];
  const photosynthatePerGram =
    (growthRate * config.co2PerRateUnit * CO2_TO_CH2O_MASS_RATIO) / (MG_PER_G * tissuePerRateUnit(config));
  const pAm = config.basePhotosynthesisRate * photosynthatePerGram;
  return {
    pAm,
    v: pAm / RESERVE_CAPACITY,
    kappa,
    pM: config.baseRespirationRate * photosynthatePerGram,
    EG: 1 / KAPPA_G,
    kappaG: KAPPA_G,
    qMin: inEngineUnits(qMin),
    qMax: inEngineUnits(qMax),
    storeFillRate: mapNutrients(() => 1 / (storeFillDays * HOURS_PER_DAY)),
  };
}

export const plantParams = (species: PlantSpecies, config: PlantsConfig): FloraParams =>
  floraParams('plant', plantTraits(species), config);

export const bloomParams = (kind: AlgaeKind, config: PlantsConfig): FloraParams =>
  floraParams(kind, ALGAE[kind], config);
