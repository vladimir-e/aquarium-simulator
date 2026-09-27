/**
 * The bloom — plant mechanics without a position. `mass` is the share of its
 * habitat it fills, so its tissue scales with the litres it lives in, and its
 * bank buys mass in proportion to the mass standing.
 */

import type { AlgaeState } from '../state.js';
import type { NutrientsConfig, PlantsConfig } from '../config/index.js';
import { lightSaturationFactor } from '../core/kinetics.js';
import type { Feeder } from '../systems/nutrients.js';
import type { CarbonFixer } from '../systems/photosynthesis.js';
import { bankConversion, bankDraw, growthTaper, saturationIrradiance } from '../systems/flora.js';
import { shedShare, tissuePerRateUnit } from '../systems/plant-lifecycle.js';
import type { BloomLight } from './light.js';
import { bloomPace, type AlgaeTraits } from './traits.js';

/** Grams of organic matter in this much bloom, in a habitat of these litres. */
export function bloomTissue(mass: number, litres: number, traits: AlgaeTraits): number {
  return (mass / 100) * traits.tissuePerLitre * litres;
}

/** Rate units a bloom's metabolism runs at: its tissue's, on the plants' own relation, at its pace. */
export function bloomRateUnits(mass: number, litres: number, traits: AlgaeTraits, config: PlantsConfig): number {
  return (bloomTissue(mass, litres, traits) / tissuePerRateUnit(config)) * bloomPace(traits);
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
  config: PlantsConfig
): CarbonFixer {
  return {
    rateUnits: bloomRateUnits(bloom.mass, litres, traits, config),
    lightResponse: lightSaturationFactor(light.par, saturationIrradiance(traits, config)),
    sufficiency,
    co2HalfSaturation: traits.co2HalfSaturation,
  };
}

/** An hour's purchase at full supply: the bloom the bank grows, and the spores that land beside it. */
export interface BloomPurchase {
  before: AlgaeState;
  after: AlgaeState;
  spores: number;
}

/** Bank points that grow a bloom of `from` by `grown`: every point buys the same e-fold. */
function bloomPrice(from: number, grown: number, traits: AlgaeTraits, config: PlantsConfig): number {
  return from > 0 ? (100 * Math.log1p(grown / from)) / bankConversion(traits, config) : 0;
}

/**
 * What the bank buys this hour, before the water supplies it. The plants' draw
 * on an empty habitat, at the plants' conversion, is the bloom's rate `r`; the
 * mass follows the logistic exactly over the hour,
 * `m₁ = m₀·eʳ / (1 + m₀(eʳ − 1)/100)`, so it closes on a full habitat without
 * reaching it, and the bank pays for the growth it got. Spores land after,
 * through the taper at the mass the hour leaves.
 */
export function purchaseBloom(bloom: AlgaeState, traits: AlgaeTraits, config: PlantsConfig): BloomPurchase {
  const rise = Math.expm1((bankDraw(bloom.surplus, 0, config) * bankConversion(traits, config)) / 100);
  const grown = (bloom.mass * (100 - bloom.mass) * rise) / (100 + bloom.mass * rise);
  const mass = bloom.mass + grown;
  return {
    before: bloom,
    after: { ...bloom, mass, surplus: bloom.surplus - bloomPrice(bloom.mass, grown, traits, config) },
    spores: traits.sporeRate * growthTaper(mass),
  };
}

/** Mass a purchase asks the water to build. */
export function massBought({ before, after, spores }: BloomPurchase): number {
  return after.mass - before.mass + spores;
}

/** The purchase at the share of it the water supplied, the bank paying for the growth that arrived. */
export function supplyBloom(
  { before, after, spores }: BloomPurchase,
  share: number,
  traits: AlgaeTraits,
  config: PlantsConfig
): BloomPurchase {
  const grown = share * (after.mass - before.mass);
  return {
    before,
    after: { ...after, mass: before.mass + grown, surplus: before.surplus - bloomPrice(before.mass, grown, traits, config) },
    spores: share * spores,
  };
}

/** The bloom after the hour's losses — none where condition 0 killed it — and the grams of waste each loss left. */
export interface BloomLoss {
  bloom: AlgaeState | null;
  shed: number;
  died: number;
}

/**
 * Low condition sheds a bloom with the plants' shape — the square of the
 * deficit — and condition 0 kills what is left, bank and all.
 */
export function loseBloom(bloom: AlgaeState, litres: number, traits: AlgaeTraits, config: PlantsConfig): BloomLoss {
  const lost = shedShare(bloom.condition, config) * bloom.mass;
  const kept = { ...bloom, mass: bloom.mass - lost };
  const shed = bloomTissue(lost, litres, traits);
  if (bloom.condition > 0) return { bloom: kept, shed, died: 0 };
  return { bloom: null, shed, died: bloomTissue(kept.mass, litres, traits) };
}

/**
 * Spores are the bloom's offshoots: they arrive at condition 100 and join the
 * bloom by mass, diluting its deficit. On a bloom that died back, or on an
 * empty one, what stands is only what landed.
 */
export function landSpores(bloom: AlgaeState | null, spores: number): AlgaeState {
  const standing = bloom ?? { mass: 0, condition: 100, surplus: 0 };
  const mass = standing.mass + spores;
  const kept = mass > 0 ? standing.mass / mass : 0;
  return { ...standing, mass, condition: 100 - (100 - standing.condition) * kept };
}

export { ALGAE, bloomPace } from './traits.js';
export type { AlgaeTraits } from './traits.js';
export { bloomLight, columnGain } from './light.js';
export type { BloomLight } from './light.js';
export {
  computeAlgaeVitality,
  buildAlgaeStressors,
  buildAlgaeBenefits,
  thrivingPlantDensity,
} from '../systems/algae-vitality.js';
export type { AlgaeVitalityContext } from '../systems/algae-vitality.js';
