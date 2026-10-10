/**
 * A bloom — plant mechanics without a position. Its budget is the bloom's as
 * a whole and its mass is the share of its habitat that tissue fills, so the
 * crowding its habitat leaves is the room its growth has.
 */

import type { AlgaeState, Blooms, Plant, SimulationState } from '../state.js';
import type { AlgaeConfig, NutrientsConfig, PlantsConfig } from '../config/index.js';
import type { OpticsConfig } from '../config/optics.js';
import { mapNutrients, NUTRIENTS, type NutrientVector } from '../config/nutrients.js';
import { calculateTankHeight } from '../core/geometry.js';
import { lightSaturationFactor } from '../core/kinetics.js';
import { formHalfSaturations, type Feeder } from '../systems/nutrients.js';
import type { CarbonFixer } from '../systems/photosynthesis.js';
import { metabolicRateUnits, saturationIrradiance, TISSUE_PER_RATE_UNIT } from '../systems/flora.js';
import { scaleFlora, type FloraParams, type FloraState } from '../systems/flora-budget.js';
import { NO_STRESS, type DebStress } from '../systems/reserve.js';
import { getPlantPower } from '../systems/plant-power.js';
import { floorShade } from '../plants/canopy.js';
import {
  bloomMass,
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

export function bloomFixer(
  bloom: AlgaeState,
  light: BloomLight,
  omega: number,
  traits: AlgaeTraits,
  config: PlantsConfig
): CarbonFixer {
  return {
    metabolicRateUnits: bloomRateUnits(bloom.budget.structure, traits),
    lightResponse: lightSaturationFactor(light.par, saturationIrradiance(traits, config)),
    omega,
    co2HalfSaturation: traits.co2HalfSaturation,
  };
}

/** Rate units of thriving plant per litre of water: the dose of their exudates. */
export function thrivingPlantDensity(plants: readonly Plant[], litres: number): number {
  return litres > 0 ? getPlantPower(plants) / litres : 0;
}

/**
 * What thriving plants' exudates do to a bloom's budget: they lower the share
 * of its photosynthate it can take, along a Monod falling from 1 with the dose,
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
 * asked at Q_min: as much as the scarcest nutrient delivered built, its stores
 * what the rest delivered past that. A spore lands unfed: its reserve is what
 * it fixes once it lands.
 */
export function sporesBuilt(structure: number, delivered: Readonly<NutrientVector>, p: FloraParams): FloraState {
  const built = Math.min(
    structure,
    ...NUTRIENTS.map((n) => (p.qMin[n] > 0 ? delivered[n] / p.qMin[n] : structure))
  );
  return {
    structure: built,
    reserve: 0,
    offshootBuffer: 0,
    stores: mapNutrients((n) => delivered[n] - p.qMin[n] * built),
  };
}

/**
 * Spores are the bloom's immigration: they arrive at condition 100 and join
 * the bloom, every pool of their budget beside its own, diluting its deficit
 * by structure. On a bloom that died back, or on an empty one, what stands is
 * only what landed.
 */
export function landSpores(bloom: AlgaeState | null, spores: FloraState): AlgaeState {
  const { budget, condition } = bloom ?? EMPTY_BLOOM;
  const structure = budget.structure + spores.structure;
  const kept = structure > 0 ? budget.structure / structure : 0;
  return {
    budget: {
      structure,
      reserve: budget.reserve + spores.reserve,
      offshootBuffer: budget.offshootBuffer + spores.offshootBuffer,
      stores: mapNutrients((n) => budget.stores[n] + spores.stores[n]),
    },
    condition: 100 - (100 - condition) * kept,
  };
}

/** Each kind's coverage at a place: its mass times the share of its habitat that lies there. */
export function coverageAt(
  tank: HabitatTank & Pick<SimulationState, 'algae'>,
  place: HabitatPlace
): Record<AlgaeKind, number> {
  return mapKinds((kind) => bloomMass(tank, kind) * placeShare(ALGAE[kind].habitat, place, tank));
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
  bloomMass,
  bloomTissue,
  columnGain,
  habitatMean,
  habitatPlaces,
  habitatSize,
  massOf,
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
