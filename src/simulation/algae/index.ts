/**
 * The bloom — plant mechanics without a position. Its vitality, shedding,
 * bank, light curve, tissue recipe and nutrient draw are the plants'; what it
 * has instead of a height and footprint is a habitat it fills.
 *
 * `mass` is the share of the habitat's capacity the bloom fills, so its tissue
 * scales with the litres it lives in. The bank buys mass as a population does:
 * in proportion to the mass already there, through the plants' taper
 * `1 − mass/100` as the habitat fills, day and night. Spores land at a constant
 * rate through the same taper, so an empty tank is never closed to a bloom;
 * whether they establish is the condition's business. Shed and dead tissue
 * return to the water as waste.
 *
 * The flora pass (`flora/`) runs the bloom beside the plants, so the two fix
 * carbon from one CO₂ stock and draw their tissue from one pool in one call.
 */

import type { AlgaeState } from '../state.js';
import type { AlgaeConfig, NutrientsConfig, TunableConfig } from '../config/index.js';
import { lightSaturationFactor } from '../core/kinetics.js';
import type { Feeder } from '../systems/nutrients.js';
import type { CarbonFixer } from '../systems/photosynthesis.js';
import { growthTaper } from '../systems/plant-growth.js';
import { shedShare, tissuePerRateUnit } from '../systems/plant-lifecycle.js';
import type { BloomLight } from './light.js';
import { algaeSaturationIrradiance, type AlgaeTraits } from './traits.js';

/** Grams of organic matter in this much bloom, in a habitat of these litres. */
export function bloomTissue(mass: number, litres: number, config: AlgaeConfig): number {
  return (mass / 100) * config.tissuePerLitre * litres;
}

/**
 * Rate units a bloom's metabolism runs at: its tissue's, on the plants' own
 * tissue-to-rate-unit relation, at its growth rate — a gram of algae fixes and
 * respires as much faster than a gram of leaf as it grows.
 */
export function bloomRateUnits(
  mass: number,
  litres: number,
  traits: AlgaeTraits,
  config: TunableConfig
): number {
  return (bloomTissue(mass, litres, config.algae) / tissuePerRateUnit(config.plants)) * traits.growthRate;
}

/** A bloom feeds from the water alone. */
export function bloomFeeder(traits: AlgaeTraits, config: NutrientsConfig): Feeder {
  return { demand: config.demand[traits.nutrientDemand], rootShare: 0 };
}

export function bloomFixer(
  bloom: AlgaeState,
  litres: number,
  light: BloomLight,
  sufficiency: number,
  traits: AlgaeTraits,
  config: TunableConfig
): CarbonFixer {
  return {
    rateUnits: bloomRateUnits(bloom.mass, litres, traits, config),
    lightResponse: lightSaturationFactor(light.par, algaeSaturationIrradiance(traits, config.plants)),
    sufficiency,
    co2HalfSaturation: config.algae.co2HalfSaturation,
  };
}

/** An hour's purchase at full supply: the bank's growth and the spores that land. */
export interface BloomPurchase {
  before: AlgaeState;
  after: AlgaeState;
}

/**
 * What the bank buys this hour, before the water supplies it. The draw is the
 * plants': `growthDrawRate` of the bank through the taper. Each point drawn
 * buys `growthRate × sizePerSurplus` percent of the mass standing, so a bloom
 * grows logistically toward a full habitat.
 */
export function purchaseBloom(bloom: AlgaeState, traits: AlgaeTraits, config: TunableConfig): BloomPurchase {
  const taper = growthTaper(bloom.mass);
  const drawn = Math.max(0, bloom.surplus) * Math.min(1, config.plants.growthDrawRate) * taper;
  const grown = (bloom.mass * drawn * traits.growthRate * config.plants.sizePerSurplus) / 100;
  const spores = config.algae.sporeRate * taper;
  return {
    before: bloom,
    after: { ...bloom, mass: bloom.mass + grown + spores, surplus: bloom.surplus - drawn },
  };
}

/** Mass a purchase asks the water to build. */
export function massBought({ before, after }: BloomPurchase): number {
  return after.mass - before.mass;
}

/** The purchase at the share of it the water supplied. */
export function supplyBloom({ before, after }: BloomPurchase, share: number): AlgaeState {
  return {
    ...after,
    mass: before.mass + share * (after.mass - before.mass),
    surplus: before.surplus + share * (after.surplus - before.surplus),
  };
}

/** The bloom after the hour's losses, and the grams of waste each loss left. */
export interface BloomLoss {
  bloom: AlgaeState;
  shed: number;
  died: number;
}

/**
 * Low condition sheds a bloom with the plants' shape — the square of the
 * deficit — and condition 0 kills what is left, bank and all.
 */
export function loseBloom(bloom: AlgaeState, litres: number, config: TunableConfig): BloomLoss {
  const lost = shedShare(bloom.condition, config.plants) * bloom.mass;
  const shed = bloomTissue(lost, litres, config.algae);
  if (bloom.condition > 0) return { bloom: { ...bloom, mass: bloom.mass - lost }, shed, died: 0 };
  return {
    bloom: { mass: 0, condition: 0, surplus: 0 },
    shed,
    died: bloomTissue(bloom.mass - lost, litres, config.algae),
  };
}

export { ALGAE, algaeDailyLightEdge, algaeSaturationIrradiance } from './traits.js';
export type { AlgaeTraits } from './traits.js';
export { bloomLight, columnGain } from './light.js';
export type { BloomLight } from './light.js';
export {
  computeAlgaeVitality,
  buildAlgaeStressors,
  buildAlgaeBenefits,
  algaeHealingRate,
  thrivingPlantDensity,
} from '../systems/algae-vitality.js';
export type { AlgaeVitalityContext } from '../systems/algae-vitality.js';
