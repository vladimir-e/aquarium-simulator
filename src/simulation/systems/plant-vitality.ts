/**
 * Plant vitality — runs each plant through the one vitality step.
 *
 * The channels a bloom has too — starvation, temperature, pH, nutrient
 * deficiency and the three income channels — are the flora law's (`flora.ts`),
 * read off the plant's budget as the hour found it and the hour it ran. Beside
 * them sit the ones only a plant has: the burn at its crown top while the
 * lamps are on, GH out of band, and nitrate on log dose past an edge its
 * hardiness carries out.
 */

import type { Plant, Resources } from '../state.js';
import type { PlantLight } from '../plants/canopy.js';
import { PLANT_SPECIES_DATA, getCo2HalfSaturation, plantTraits, type PlantSpecies } from '../plants/species.js';
import { toleranceFactor } from '../livestock/tolerance.js';
import type { PlantsConfig } from '../config/plants.js';
import { getDgh, getPpm } from '../resources/index.js';
import type { FloraFluxes, FloraParams } from './flora-budget.js';
import { pointsHealed } from './reserve.js';
import { floraBenefits, floraStressors, floraVitalityInput, type FloraVitalityInput } from './flora.js';
import {
  computeVitality,
  eFoldsPast,
  hardened,
  outsideBand,
  type VitalityFactor,
  type VitalityResult,
} from './vitality.js';

export interface PlantVitalityContext {
  /** The plant as the hour found it. */
  plant: Plant;
  params: FloraParams;
  /** What its budget did over the hour. */
  fluxes: FloraFluxes;
  resources: Resources;
  waterVolume: number;
  plantsConfig: PlantsConfig;
  /** The light at this plant's height, from the tick's one canopy pass. */
  light: PlantLight;
}

const vitalityInput = ({ plant, params, fluxes, resources, plantsConfig }: PlantVitalityContext): FloraVitalityInput =>
  floraVitalityInput(plant.budget, params, fluxes, {
    traits: plantTraits(plant.species),
    resources,
    plantsConfig,
    co2HalfSaturation: getCo2HalfSaturation(plant.species, plantsConfig),
  });

/** Nitrate ppm a species takes harm past: the plant edge, carried out by its hardiness. */
export function plantNitrateEdge(species: PlantSpecies, plantsConfig: PlantsConfig): number {
  return plantsConfig.nitrateEdge * toleranceFactor(PLANT_SPECIES_DATA[species].hardiness);
}

/**
 * Build the stressor list for a plant, hardened: the flora channels, the burn at
 * its crown top and GH, and hardiness scales every one of them; nitrate's edge
 * it moves instead.
 */
export function buildPlantStressors(ctx: PlantVitalityContext): VitalityFactor[] {
  const { plant, resources, waterVolume, plantsConfig, light } = ctx;
  const species = PLANT_SPECIES_DATA[plant.species];

  return [
    ...hardened(
      [
        ...floraStressors(vitalityInput(ctx)),
        {
          key: 'light',
          label: 'Light high',
          amount: plantsConfig.lightExcessiveSeverity * Math.max(0, light.crownPar - species.tolerableLight[1]),
        },
        {
          key: 'gh',
          label: 'GH',
          amount: plantsConfig.ghStressSeverity * outsideBand(getDgh(resources.gh, waterVolume), species.tolerableGH),
        },
      ],
      species.hardiness
    ),
    {
      key: 'nitrate',
      label: 'Nitrate',
      amount:
        plantsConfig.nitrateStressSeverity *
        eFoldsPast(getPpm(resources.nitrate, waterVolume), plantNitrateEdge(plant.species, plantsConfig)),
    },
  ];
}

export function buildPlantBenefits(ctx: PlantVitalityContext): VitalityFactor[] {
  return floraBenefits(vitalityInput(ctx));
}

/** A plant's condition over the hour its budget ran, its reserve paying for the repair. Stateless. */
export function computePlantVitality(ctx: PlantVitalityContext): VitalityResult {
  return computeVitality({
    stressors: buildPlantStressors(ctx),
    benefits: buildPlantBenefits(ctx),
    condition: ctx.plant.condition,
    healed: pointsHealed(ctx.fluxes.burned.healing, ctx.plant.budget, ctx.params, ctx.plantsConfig),
  });
}
