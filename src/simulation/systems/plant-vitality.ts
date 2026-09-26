/**
 * Plant vitality — runs each plant through the unified vitality engine.
 *
 * Mirrors `fish-health` for fish: build a stressor list, build a benefit
 * list, hand them to {@link computeVitality}, route the result back
 * onto plant state.
 *
 * Benefits are income: every channel is realised *through* photosynthesis,
 * so the light term multiplies all four and a plant earns nothing in the
 * dark.
 *
 * Stressors:
 * - Light starvation (daily light integral under the species edge)
 * - Light excessive (PAR over `tolerableLight`, while the lamps are on)
 * - Temperature out of `tolerableTemp` (per °C, two-sided)
 * - pH out of `tolerablePH` (per pH unit, two-sided)
 * - GH out of `tolerableGH` (per dGH, two-sided)
 * - Nutrient deficiency (per (1 − Liebig sufficiency), on the light curve)
 * - Nitrate (log dose past the plant edge hardiness carries out)
 * - Algae shading (when algae density crosses the shading threshold)
 */

import type { Plant, Resources } from '../state.js';
import { getPh } from '../core/carbonate.js';
import { PLANT_SPECIES_DATA, dailyLightEdge, getSaturationIrradiance } from '../plants/species.js';
import { dailyLightIntegral } from '../equipment/light.js';
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
  type VitalityFactor,
  type VitalityResult,
} from './vitality.js';

export interface PlantVitalityContext {
  plant: Plant;
  resources: Resources;
  waterVolume: number;
  plantsConfig: PlantsConfig;
  /**
   * Precomputed Liebig sufficiency for this plant (0–1). The orchestrator
   * computes it once per tick (`processPlants`) and threads the value
   * into vitality and photosynthesis — no module recomputes it.
   */
  nutrientSufficiency: number;
  /**
   * Current algae biomass / coverage 0–100 (from `state.algae.mass`).
   * Drives the `algae_shading` stressor when above the configured
   * threshold.
   */
  algaeMass: number;
}

function lightSaturation({ plant, resources, plantsConfig }: PlantVitalityContext): number {
  return lightSaturationFactor(
    resources.light,
    getSaturationIrradiance(plant.species, plantsConfig)
  );
}

/**
 * Share of the daily light edge a plant goes short of: 0 at or over the edge,
 * 1 in a day without light.
 */
export function lightShortfall(dailyLight: number, edge: number): number {
  return edge > 0 ? Math.max(0, 1 - dailyLight / edge) : 0;
}

/**
 * Build the stressor list for a plant, hardened: hardiness scales every channel
 * but nitrate, whose edge it moves instead.
 */
export function buildPlantStressors(ctx: PlantVitalityContext): VitalityFactor[] {
  const { plant, resources, waterVolume, plantsConfig, nutrientSufficiency, algaeMass } = ctx;
  const species = PLANT_SPECIES_DATA[plant.species];
  const factors: VitalityFactor[] = [];

  // Starvation reads the day the plant has had, so a scheduled night costs
  // nothing and a dead fixture bites as its light leaves the window. Its cost
  // is respiration's, so it runs on respiration's Q10.
  factors.push({
    key: 'lightStarvation',
    label: 'Light starvation',
    amount:
      plantsConfig.lightStarvationSeverity *
      lightShortfall(dailyLightIntegral(resources.lightByHour), dailyLightEdge(plant.species)) *
      getRespirationTemperatureFactor(resources.temperature, plantsConfig),
  });

  const lightHi = species.tolerableLight[1];
  factors.push({
    key: 'light',
    label: 'Light high',
    amount: plantsConfig.lightExcessiveSeverity * Math.max(0, resources.light - lightHi),
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

  // Nutrient deficiency — unmet demand, and demand rides the same light
  // curve as income: a plant in the dark is asking for nothing.
  factors.push({
    key: 'nutrients',
    label: 'Nutrient deficiency',
    amount:
      lightSaturation(ctx) * plantsConfig.nutrientDeficiencySeverity * (1 - nutrientSufficiency),
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

  const nitrateEdge = plantsConfig.nitrateEdge * toleranceFactor(species.hardiness);
  return [
    ...hardened(factors, species.hardiness),
    {
      key: 'nitrate',
      label: 'Nitrate',
      amount: plantsConfig.nitrateStressSeverity * eFoldsPast(getPpm(resources.nitrate, waterVolume), nitrateEdge),
    },
  ];
}

export function buildPlantBenefits(ctx: PlantVitalityContext): VitalityFactor[] {
  const { plant, resources, plantsConfig, nutrientSufficiency } = ctx;
  const species = PLANT_SPECIES_DATA[plant.species];
  const saturation = lightSaturation(ctx);

  return [
    {
      key: 'co2',
      label: 'CO2',
      amount:
        saturation *
        plantsConfig.co2BenefitPeak *
        calculateCo2Factor(resources.co2, plant.species, plantsConfig),
    },
    {
      key: 'temperature',
      label: 'Temperature',
      amount:
        saturation *
        plantsConfig.temperatureBenefitPeak *
        bandComfort(resources.temperature, species.tolerableTemp),
    },
    {
      key: 'ph',
      label: 'pH',
      amount: saturation * plantsConfig.phBenefitPeak * bandComfort(getPh(resources), species.tolerablePH),
    },
    {
      key: 'nutrients',
      label: 'Nutrients',
      // Nutrient benefit scales linearly with sufficiency — a partially
      // fed plant gets a partial benefit. Asymmetric with the deficiency
      // stressor (which scales with (1 − sufficiency)) by design: the
      // two together let condition track sufficiency continuously for
      // plants whose only knob is nutrients.
      amount:
        saturation *
        plantsConfig.nutrientBenefitPeak *
        Math.max(0, Math.min(1, nutrientSufficiency)),
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
