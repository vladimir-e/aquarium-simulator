/**
 * Plant vitality — runs each plant through the unified vitality engine.
 *
 * The channels a bloom has too — light starvation, temperature, pH, nutrient
 * deficiency and the three income channels — are the flora law's (`flora.ts`),
 * read at the plant's own height (see `plants/canopy.ts`) and earned at its
 * vigour. Beside them sit the ones only a plant has: the burn at its crown top
 * while the lamps are on, GH out of band, and nitrate on log dose past an edge
 * its hardiness carries out.
 */

import type { Plant, Resources } from '../state.js';
import type { PlantLight } from '../plants/canopy.js';
import { PLANT_SPECIES_DATA, getCo2HalfSaturation, plantTraits, type PlantSpecies } from '../plants/species.js';
import { toleranceFactor } from '../livestock/tolerance.js';
import type { PlantsConfig } from '../config/plants.js';
import { getDgh, getPpm } from '../resources/index.js';
import { floraBenefits, floraHealingRate, floraStressors, type FloraHour } from './flora.js';
import {
  computeVitality,
  eFoldsPast,
  hardened,
  outsideBand,
  type VitalityFactor,
  type VitalityResult,
} from './vitality.js';

export interface PlantVitalityContext {
  plant: Plant;
  resources: Resources;
  waterVolume: number;
  plantsConfig: PlantsConfig;
  /** Liebig sufficiency for this plant (0–1), computed once a tick by the flora pass. */
  nutrientSufficiency: number;
  /** The light at this plant's height, from the tick's one canopy pass. */
  light: PlantLight;
}

function floraHour({ plant, resources, plantsConfig, nutrientSufficiency, light }: PlantVitalityContext): FloraHour {
  return {
    traits: plantTraits(plant.species),
    resources,
    plantsConfig,
    light,
    nutrientSufficiency,
    co2HalfSaturation: getCo2HalfSaturation(plant.species, plantsConfig),
    vigour: plant.vigour,
  };
}

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
        ...floraStressors(floraHour(ctx)),
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
  return floraBenefits(floraHour(ctx));
}

/**
 * Compute one tick of vitality for a plant — useful for UI rendering
 * (trend arrows, breakdown lists) and for tests. Stateless.
 */
export function computePlantVitality(ctx: PlantVitalityContext): VitalityResult {
  return computeVitality({
    stressors: buildPlantStressors(ctx),
    benefits: buildPlantBenefits(ctx),
    condition: ctx.plant.condition,
    surplus: ctx.plant.surplus,
    surplusCap: ctx.plantsConfig.surplusCap,
    healingRate: floraHealingRate(plantTraits(ctx.plant.species), ctx.plantsConfig),
  });
}
