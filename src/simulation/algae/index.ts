/**
 * A bloom — plant mechanics without a position. `mass` is the share of its
 * habitat it fills, so its tissue scales with the habitat, and its bank buys
 * mass in proportion to the mass standing.
 */

import type { AlgaeState, Blooms } from '../state.js';
import type { NutrientsConfig, PlantsConfig } from '../config/index.js';
import { lightSaturationFactor } from '../core/kinetics.js';
import { formHalfSaturations, type Feeder } from '../systems/nutrients.js';
import type { CarbonFixer } from '../systems/photosynthesis.js';
import {
  bankConversion,
  bankDraw,
  growthTaper,
  loseFlora,
  metabolicRateUnits,
  saturationIrradiance,
  tissuePerRateUnit,
  type FloraLoss,
} from '../systems/flora.js';
import { habitatSize, placeShare, type BloomLight, type HabitatPlace, type HabitatTank } from './habitat.js';
import { ALGAE, type AlgaeKind, type AlgaeTraits } from './traits.js';
import { EMPTY_BLOOM, mapKinds } from './blooms.js';

/** Grams of organic matter in this much bloom, in a habitat of this size. */
export function bloomTissue(mass: number, habitat: number, traits: AlgaeTraits): number {
  return (mass / 100) * traits.tissueDensity * habitat;
}

/** Rate units a bloom's metabolism runs at: its tissue's, on the plants' own relation, at its growth rate. */
export function bloomRateUnits(mass: number, habitat: number, traits: AlgaeTraits, config: PlantsConfig): number {
  return metabolicRateUnits(bloomTissue(mass, habitat, traits) / tissuePerRateUnit(config), traits);
}

/** A bloom feeds from the water alone, on its own nitrogen and phosphorus affinities and its demand tier for the rest. */
export function bloomFeeder(traits: AlgaeTraits, config: NutrientsConfig): Feeder {
  return {
    halfSaturation: {
      ...formHalfSaturations(config.demand[traits.nutrientDemand], config),
      ammonia: traits.ammoniaHalfSaturation,
      nitrate: traits.nitrateHalfSaturation,
      phosphate: traits.phosphateHalfSaturation,
    },
    rootShare: 0,
  };
}

export function bloomFixer(
  bloom: AlgaeState,
  habitat: number,
  light: BloomLight,
  sufficiency: number,
  traits: AlgaeTraits,
  config: PlantsConfig
): CarbonFixer {
  return {
    metabolicRateUnits: bloomRateUnits(bloom.mass, habitat, traits, config),
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
 * mass follows the logistic exactly over the hour, its odds of room to mass
 * falling by `e^−r`: `(100 − m₁)/m₁ = e^−r·(100 − m₀)/m₀`. It closes on a full
 * habitat without reaching it, an empty one stays empty at any rate, and the
 * bank pays for the growth it got. Spores come through the taper at the mass
 * that growth reaches, since their tissue is drawn beside it.
 */
export function purchaseBloom(bloom: AlgaeState, traits: AlgaeTraits, config: PlantsConfig): BloomPurchase {
  const r = (bankDraw(bloom.surplus, 0, config) * bankConversion(traits, config)) / 100;
  const room = 100 - bloom.mass;
  const odds = Math.exp(Math.log(room) - Math.log(bloom.mass) - r);
  const grown = (room * -Math.expm1(-r)) / (1 + odds);
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

export function loseBloom(
  bloom: AlgaeState,
  habitat: number,
  traits: AlgaeTraits,
  config: PlantsConfig
): FloraLoss<AlgaeState> {
  return loseFlora(bloom, 'mass', (mass) => bloomTissue(mass, habitat, traits), config);
}

/**
 * Spores are the bloom's offshoots: they arrive at condition 100 with an empty
 * bank and join the bloom by mass, diluting its deficit and its bank alike. On
 * a bloom that died back, or on an empty one, what stands is only what landed.
 */
export function landSpores(bloom: AlgaeState | null, spores: number): AlgaeState {
  const standing = bloom ?? EMPTY_BLOOM;
  const mass = standing.mass + spores;
  const kept = mass > 0 ? standing.mass / mass : 0;
  return { mass, condition: 100 - (100 - standing.condition) * kept, surplus: standing.surplus * kept };
}

/**
 * Each bloom on a habitat that changed size, its tissue kept: new habitat
 * comes in bare and dilutes the coverage, and habitat taken out takes its
 * share of the bloom with it, the coverage left as it was.
 */
export function resettle(blooms: Blooms, before: HabitatTank, after: HabitatTank): Blooms {
  return mapKinds((kind) => {
    const { habitat } = ALGAE[kind];
    const grown = habitatSize(habitat, after) / habitatSize(habitat, before);
    return grown > 1 ? { ...blooms[kind], mass: blooms[kind].mass / grown } : blooms[kind];
  });
}

/** Each kind's coverage at a place: its mass times the share of its habitat that lies there. */
export function coverageAt(blooms: Blooms, place: HabitatPlace, tank: HabitatTank): Record<AlgaeKind, number> {
  return mapKinds((kind) => blooms[kind].mass * placeShare(ALGAE[kind].habitat, place, tank));
}

/**
 * Each bloom with a place laid bare: its coverage there taken out, the tissue
 * the rest of its habitat holds kept. Coverage is one figure over the habitat,
 * so what is left spreads over the bare place at once.
 */
export function clearPlace(blooms: Blooms, place: HabitatPlace, tank: HabitatTank): Blooms {
  const cleared = coverageAt(blooms, place, tank);
  return mapKinds((kind) => ({ ...blooms[kind], mass: blooms[kind].mass - cleared[kind] }));
}

export { ALGAE, ALGAE_KINDS } from './traits.js';
export { EMPTY_BLOOM, emptyBlooms, isAlgaeKind, mapKinds } from './blooms.js';
export type { AlgaeHabitat, AlgaeKind, AlgaeTraits } from './traits.js';
export { bloomLight, columnGain, habitatGain, habitatPlaces, habitatSize, namePlaces, placeShare } from './habitat.js';
export type { BloomLight, HabitatPlace, HabitatTank } from './habitat.js';
export { bloomPass, waterExtinction, waterShade } from './shade.js';
export type { BloomShade, WaterShade } from './shade.js';
export {
  computeAlgaeVitality,
  buildAlgaeStressors,
  buildAlgaeBenefits,
  thrivingPlantDensity,
} from '../systems/algae-vitality.js';
export type { AlgaeVitalityContext } from '../systems/algae-vitality.js';
