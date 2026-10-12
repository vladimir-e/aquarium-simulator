/**
 * A bloom — plant mechanics without a position. Its budget is the bloom's as
 * a whole and its coverage is the share of its habitat that tissue fills, so the
 * crowding its habitat leaves is the room its growth has.
 */

import type { AlgaeState, Blooms, Plant, SimulationState } from '../state.js';
import type { AlgaeConfig, NutrientsConfig, PlantsConfig } from '../config/index.js';
import type { OpticsConfig } from '../config/optics.js';
import { mapForms, mapNutrients, NUTRIENT_OF, NUTRIENTS, type FormVector, type NutrientVector } from '../config/nutrients.js';
import { calculateTankHeight } from '../core/geometry.js';
import { lightSaturationFactor } from '../core/kinetics.js';
import { formHalfSaturations, type Feeder } from '../systems/nutrients.js';
import type { CarbonFixer } from '../systems/photosynthesis.js';
import { metabolicRateUnits, saturationIrradiance, TISSUE_PER_RATE_UNIT } from '../systems/flora.js';
import { floraNutrients, scaleFlora, type FloraParams, type FloraState } from '../systems/flora-budget.js';
import { NO_STRESS, type DebStress } from '../systems/reserve.js';
import { getPlantPower } from '../systems/plant-power.js';
import { floorShade } from '../plants/canopy.js';
import {
  bloomCoverage,
  columnGain,
  habitatMean,
  placeShare,
  type BloomLight,
  type HabitatPlace,
  type HabitatTank,
} from './habitat.js';
import { waterExtinction } from './light-loss.js';
import { ALGAE, type AlgaeHabitat, type AlgaeKind, type AlgaeTraits } from './traits.js';
import { EMPTY_BLOOM, mapKinds } from './blooms.js';

/** Rate units a bloom's metabolism runs at: its tissue's, on the plants' own relation, at its growth rate. */
export function bloomRateUnits(structure: number, traits: AlgaeTraits): number {
  return metabolicRateUnits(structure / TISSUE_PER_RATE_UNIT, traits);
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

/** A bloom as photosynthesis reads it: its stress lowers the ceiling it fixes to, and so its draw on the CO₂. */
export function bloomFixer(
  bloom: AlgaeState,
  light: BloomLight,
  omega: number,
  stress: Readonly<DebStress>,
  traits: AlgaeTraits,
  plantsConfig: PlantsConfig
): CarbonFixer {
  return {
    metabolicRateUnits: stress.assimilation * bloomRateUnits(bloom.budget.structure, traits),
    lightResponse: lightSaturationFactor(light.par, saturationIrradiance(traits, plantsConfig)),
    omega,
    co2HalfSaturation: traits.co2HalfSaturation,
  };
}

/** Rate units of thriving plant per litre of water: the dose of their exudates. */
export function thrivingPlantDensity(plants: readonly Plant[], litres: number): number {
  return litres > 0 ? getPlantPower(plants) / litres : 0;
}

/**
 * What thriving plants' exudates do to a bloom's budget: they lower its
 * assimilation ceiling by hyperbolic inhibition, falling from 1 with the dose,
 * halved where `allelopathySeverity × dose` is 1.
 */
export function allelopathy(plants: readonly Plant[], litres: number, config: AlgaeConfig): DebStress {
  return { ...NO_STRESS, assimilation: 1 / (1 + config.allelopathySeverity * thrivingPlantDensity(plants, litres)) };
}

/**
 * The mean PAR over a habitat as a multiple of the PAR at the substrate: the
 * column's mean through the column and on the walls that span it, what the
 * canopy leaves on the floor and the hardscape. The column's mean is read
 * through the water as it stands, so a bloom in it shades itself and the walls.
 */
export function habitatGain(
  habitat: AlgaeHabitat,
  tank: Pick<SimulationState, 'tank' | 'equipment' | 'plants' | 'algae'>,
  optics: OpticsConfig
): number {
  const column = columnGain(calculateTankHeight(tank.tank.capacity), waterExtinction(tank, optics));
  const underCanopy = 1 - floorShade(tank.plants, tank.tank.capacity, optics);
  return habitatMean(habitat, tank, { column, walls: column, floor: underCanopy, hardscape: underCanopy });
}

/**
 * The spores the water built over the hour, out of `structure` grams of spore
 * asked at Q_min: as much as the scarcest nutrient delivered, or the grams of
 * `photosynthate` the water's CO2 left them, built, their stores what the rest
 * delivered past that, up to full. A spore lands unfed: its reserve is what it
 * fixes once it lands.
 */
export function sporesBuilt(
  structure: number,
  delivered: Readonly<NutrientVector>,
  photosynthate: number,
  p: FloraParams
): FloraState {
  const built = Math.min(
    structure,
    photosynthate,
    ...NUTRIENTS.map((n) => (p.qMin[n] > 0 ? delivered[n] / p.qMin[n] : structure))
  );
  return {
    structure: built,
    reserve: 0,
    offshootBuffer: 0,
    stores: mapNutrients((n) => Math.min(delivered[n] - p.qMin[n] * built, (p.qMax[n] - p.qMin[n]) * built)),
  };
}

/** mg of each form the spores take up of what was delivered them: each at the share of its nutrient they hold. */
export function sporesUptake(
  uptake: Readonly<FormVector>,
  delivered: Readonly<NutrientVector>,
  spores: FloraState,
  p: FloraParams
): FormVector {
  const held = floraNutrients(spores, p);
  return mapForms((f) => {
    const n = NUTRIENT_OF[f];
    return delivered[n] > 0 ? (uptake[f] * held[n]) / delivered[n] : 0;
  });
}

/**
 * Spores are the bloom's immigration: structure without reserve, every pool of
 * their budget joining the bloom's own. Condition is one number for the whole
 * bloom, so they join at its condition: landing at 100 they would keep healing
 * a bloom starving in the dark, and it could never die. Only an empty bloom —
 * one that died back, or never stood — starts afresh from them at 100.
 */
export function landSpores(bloom: AlgaeState | null, spores: FloraState): AlgaeState {
  const { budget, condition } = bloom ?? EMPTY_BLOOM;
  return {
    budget: {
      structure: budget.structure + spores.structure,
      reserve: budget.reserve + spores.reserve,
      offshootBuffer: budget.offshootBuffer + spores.offshootBuffer,
      stores: mapNutrients((n) => budget.stores[n] + spores.stores[n]),
    },
    condition: budget.structure > 0 ? condition : 100,
  };
}

/** Each kind's coverage at a place: its whole coverage times the share of its habitat that lies there. */
export function coverageAt(
  tank: HabitatTank & Pick<SimulationState, 'algae'>,
  place: HabitatPlace
): Record<AlgaeKind, number> {
  return mapKinds((kind) => bloomCoverage(tank, kind) * placeShare(ALGAE[kind].habitat, place, tank));
}

/**
 * Each bloom with `part` of a place laid bare: the tissue there taken out, the
 * tissue the rest of its habitat holds kept. Coverage is one figure over the
 * habitat, so what is left spreads over the bare place at once.
 */
export function clearPlace(
  tank: HabitatTank & Pick<SimulationState, 'algae'>,
  place: HabitatPlace,
  part = 1
): Blooms {
  return mapKinds((kind) => {
    const bloom = tank.algae[kind];
    return { ...bloom, budget: scaleFlora(bloom.budget, 1 - part * placeShare(ALGAE[kind].habitat, place, tank)) };
  });
}

export { ALGAE, ALGAE_KINDS } from './traits.js';
export { EMPTY_BLOOM, emptyBlooms, isAlgaeKind, mapKinds } from './blooms.js';
export type { AlgaeHabitat, AlgaeKind, AlgaeTraits } from './traits.js';
export {
  bloomLight,
  bloomCoverage,
  bloomTissue,
  columnGain,
  habitatMean,
  habitatPlaces,
  habitatSize,
  coverageOf,
  namePlaces,
  placesKept,
  placeShare,
  REMOVED_BY,
} from './habitat.js';
export type { BloomLight, BloomRemoval, HabitatPlace, HabitatTank } from './habitat.js';
export { bloomPass, columnPass, lightLoss, waterExtinction } from './light-loss.js';
export type { BloomLightLoss, BloomTank, LightLoss } from './light-loss.js';
export { computeAlgaeVitality, buildAlgaeStressors, buildAlgaeBenefits } from '../systems/algae-vitality.js';
export type { AlgaeVitalityContext } from '../systems/algae-vitality.js';
