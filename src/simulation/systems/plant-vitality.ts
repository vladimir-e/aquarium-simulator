/**
 * Plant vitality — runs each plant through the unified vitality engine.
 *
 * Mirrors `fish-health` for fish: build a stressor list, build a benefit
 * list, hand them to {@link computeVitality}, route the result back
 * onto plant state.
 *
 * Benefits are income: every channel is realised *through* photosynthesis,
 * so each runs on its drive — the light term times the Liebig sufficiency,
 * as carbon fixation does — and a plant earns nothing in the dark or with a
 * nutrient run dry. A plant's vigour scales every channel too — hardiness
 * scales what harms it, vigour what it earns.
 *
 * Light is read at the plant's own height (see `plants/canopy.ts`): income,
 * nutrient demand and starvation at its mean leaf, the burn at its crown top.
 *
 * Stressors:
 * - Light starvation (daily light integral under the species edge)
 * - Light excessive (PAR over `tolerableLight`, while the lamps are on)
 * - Temperature out of `tolerableTemp` (per °C, two-sided)
 * - pH out of `tolerablePH` (per pH unit, two-sided)
 * - GH out of `tolerableGH` (per dGH, two-sided)
 * - Nutrient deficiency (Liebig sufficiency under `sufficiencyEdge`, on the light curve)
 * - Nitrate (log dose past the plant edge hardiness carries out)
 * - Algae shading (when algae density crosses the shading threshold)
 */

import type { Plant, Resources } from '../state.js';
import type { PlantLight } from '../plants/canopy.js';
import { getPh } from '../core/carbonate.js';
import {
  PLANT_SPECIES_DATA,
  dailyLightEdge,
  getSaturationIrradiance,
  type PlantSpecies,
} from '../plants/species.js';
import { toleranceFactor } from '../livestock/tolerance.js';
import type { PlantsConfig } from '../config/plants.js';
import { lightSaturationFactor } from '../core/kinetics.js';
import { getDgh, getPpm } from '../resources/index.js';
import { calculateCo2Factor } from './photosynthesis.js';
import { getRespirationTemperatureFactor } from './respiration.js';
import {
  bandComfort,
  computeVitality,
  eFoldsPast,
  hardened,
  outsideBand,
  shortfall,
  type VitalityFactor,
  type VitalityResult,
} from './vitality.js';

export interface PlantVitalityContext {
  plant: Plant;
  resources: Resources;
  waterVolume: number;
  plantsConfig: PlantsConfig;
  /** Liebig sufficiency for this plant (0–1), computed once a tick by `processPlants`. */
  nutrientSufficiency: number;
  /**
   * Current algae biomass / coverage 0–100 (from `state.algae.mass`).
   * Drives the `algae_shading` stressor when above the configured
   * threshold.
   */
  algaeMass: number;
  /** The light at this plant's height, from the tick's one canopy pass. */
  light: PlantLight;
}

function lightSaturation({ plant, plantsConfig, light }: PlantVitalityContext): number {
  return lightSaturationFactor(
    light.par,
    getSaturationIrradiance(plant.species, plantsConfig)
  );
}

/** Nitrate ppm a species takes harm past: the plant edge, carried out by its hardiness. */
export function plantNitrateEdge(species: PlantSpecies, plantsConfig: PlantsConfig): number {
  return plantsConfig.nitrateEdge * toleranceFactor(PLANT_SPECIES_DATA[species].hardiness);
}

/**
 * Build the stressor list for a plant, hardened: hardiness scales every channel
 * but nitrate, whose edge it moves instead.
 */
export function buildPlantStressors(ctx: PlantVitalityContext): VitalityFactor[] {
  const { plant, resources, waterVolume, plantsConfig, nutrientSufficiency, algaeMass, light } = ctx;
  const species = PLANT_SPECIES_DATA[plant.species];
  const factors: VitalityFactor[] = [];

  // Starvation reads the day the plant has had, so a scheduled night costs
  // nothing and a dead fixture bites as its light leaves the window. Its cost
  // is respiration's, so it runs on respiration's Q10. The day is read at
  // today's canopy.
  factors.push({
    key: 'lightStarvation',
    label: 'Light starvation',
    amount:
      plantsConfig.lightStarvationSeverity *
      shortfall(light.dailyLight, dailyLightEdge(plant.species)) *
      getRespirationTemperatureFactor(resources.temperature, plantsConfig),
  });

  const lightHi = species.tolerableLight[1];
  factors.push({
    key: 'light',
    label: 'Light high',
    amount: plantsConfig.lightExcessiveSeverity * Math.max(0, light.crownPar - lightHi),
  });

  const ph = getPh(resources);
  const gh = getDgh(resources.gh, waterVolume);
  factors.push(
    {
      key: 'temperature',
      label: 'Temperature',
      amount:
        plantsConfig.temperatureStressSeverity * outsideBand(resources.temperature, species.tolerableTemp),
    },
    { key: 'ph', label: 'pH', amount: plantsConfig.phStressSeverity * outsideBand(ph, species.tolerablePH) },
    { key: 'gh', label: 'GH', amount: plantsConfig.ghStressSeverity * outsideBand(gh, species.tolerableGH) }
  );

  // Demand rides the same light curve as income: a plant in the dark is
  // asking for nothing.
  factors.push({
    key: 'nutrients',
    label: 'Nutrient deficiency',
    amount:
      lightSaturation(ctx) *
      plantsConfig.nutrientDeficiencySeverity *
      shortfall(nutrientSufficiency, plantsConfig.sufficiencyEdge),
  });

  // Algae shading — only kicks in once algae density is meaningful.
  // Reads `state.algae.mass` (threaded through the context); a heavy
  // bloom (mass > threshold) shades plants and drags their condition
  // down. With plant decline, algae's `plant_suppression` stressor
  // weakens → algae's net rate climbs → more mass growth — the
  // intended death-spiral mechanic.
  let algaeAmount = 0;
  if (algaeMass > plantsConfig.algaeShadingThreshold) {
    algaeAmount =
      plantsConfig.algaeShadingSeverity * (algaeMass - plantsConfig.algaeShadingThreshold);
  }
  factors.push({ key: 'algae', label: 'Algae shading', amount: algaeAmount });

  return [
    ...hardened(factors, species.hardiness),
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
  const { plant, resources, plantsConfig, nutrientSufficiency } = ctx;
  const species = PLANT_SPECIES_DATA[plant.species];
  const earning = lightSaturation(ctx) * nutrientSufficiency * (1 + plant.vigour);

  return [
    {
      key: 'co2',
      label: 'CO₂',
      amount:
        earning *
        plantsConfig.co2BenefitPeak *
        calculateCo2Factor(resources.co2, plant.species, plantsConfig),
    },
    {
      key: 'temperature',
      label: 'Temperature',
      amount:
        earning *
        plantsConfig.temperatureBenefitPeak *
        bandComfort(resources.temperature, species.tolerableTemp),
    },
    {
      key: 'ph',
      label: 'pH',
      amount: earning * plantsConfig.phBenefitPeak * bandComfort(getPh(resources), species.tolerablePH),
    },
  ];
}

/** Share of its bank a plant heals from per hour: it repairs at the pace it grows. */
export function plantHealingRate(plant: Plant, plantsConfig: PlantsConfig): number {
  return PLANT_SPECIES_DATA[plant.species].growthRate * plantsConfig.healingDrawRate;
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
    healingRate: plantHealingRate(ctx.plant, ctx.plantsConfig),
  });
}
