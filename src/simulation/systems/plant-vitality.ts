/**
 * Plant vitality — runs each plant through the unified vitality engine.
 *
 * Mirrors `fish-health` for fish: build a stressor list, build a benefit
 * list, hand them to {@link computeVitality}, route the result back
 * onto plant state. The breakdown drives both the per-plant condition
 * update and the surplus-gated growth path.
 *
 * Stressor coverage (each gated by species config so not every species
 * triggers every channel):
 * - Light insufficient / excessive (two-sided around `tolerableLight`)
 * - CO2 insufficient (high-tech species suffer when CO2 falls)
 * - Temperature out of `tolerableTemp` (per °C, two-sided)
 * - pH out of `tolerablePH` (per pH unit, two-sided)
 * - Nutrient deficiency (per (1 − Liebig sufficiency))
 * - Nutrient toxicity (gross NO3 overdose — auto-doser failure case)
 * - Algae shading (when algae density crosses the shading threshold)
 *
 * Benefit coverage (in-range = peak, out-of-range = 0):
 * - Light, CO2, Temperature, pH, Nutrients sufficient
 *
 * Sum at all-good ≈ 0.5 %/h, so a healthy plant heals at familiar
 * speed and only starts growing once condition is full (surplus-
 * overflow rule).
 */

import type { Plant, Resources } from '../state.js';
import { PLANT_SPECIES_DATA } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import type { NutrientsConfig } from '../config/nutrients.js';
import { calculateNutrientSufficiency } from './nutrients.js';
import { getPpm } from '../resources/index.js';
import {
  computeVitality,
  type VitalityFactor,
  type VitalityResult,
} from './vitality.js';

export interface PlantVitalityContext {
  plant: Plant;
  resources: Resources;
  waterVolume: number;
  plantsConfig: PlantsConfig;
  nutrientsConfig: NutrientsConfig;
}

/**
 * In-range benefit: full peak inside `[lo, hi]`, zero outside.
 * Mirrors the fish helper of the same name. Step-shaped on purpose so
 * the matching stressor cleanly takes over outside the band.
 */
function inRangeBenefit(value: number, lo: number, hi: number, peak: number): number {
  return value >= lo && value <= hi ? peak : 0;
}

/**
 * Build the stressor list for a plant. Severities are pre-hardiness;
 * the species `hardiness` factor is applied centrally inside
 * `computeVitality`.
 */
export function buildPlantStressors(ctx: PlantVitalityContext): VitalityFactor[] {
  const { plant, resources, waterVolume, plantsConfig, nutrientsConfig } = ctx;
  const species = PLANT_SPECIES_DATA[plant.species];
  const factors: VitalityFactor[] = [];

  // Light — two-sided, and only during the photoperiod. Light = 0
  // here means "lights off, it's night" — plants aren't trying to
  // photosynthesize, so a lights-off tick isn't a "light insufficient"
  // event. The light-excessive side is always-on (excess UV/PAR can
  // burn leaves any time the lamps are on, but if they're off there's
  // nothing to burn).
  const [lightLo, lightHi] = species.tolerableLight;
  let lightAmount = 0;
  let lightLabel = 'Light';
  if (resources.light > 0 && resources.light < lightLo) {
    lightAmount = plantsConfig.lightInsufficientSeverity * (lightLo - resources.light);
    lightLabel = 'Light low';
  } else if (resources.light > lightHi) {
    lightAmount = plantsConfig.lightExcessiveSeverity * (resources.light - lightHi);
    lightLabel = 'Light high';
  }
  factors.push({ key: 'light', label: lightLabel, amount: lightAmount, kind: 'damage' });

  // CO2 — only the *low* side is a stressor for plants, and only when
  // lights are on. Plants don't draw CO2 in the dark (no
  // photosynthesis), so the overnight CO2 dip in any sealed-lid
  // planted tank doesn't count as damage. Modelling otherwise would
  // make MC die from the natural diurnal CO2 swing.
  const [co2Lo] = species.tolerableCO2;
  let co2Amount = 0;
  if (resources.light > 0 && resources.co2 < co2Lo) {
    co2Amount = plantsConfig.co2InsufficientSeverity * (co2Lo - resources.co2);
  }
  factors.push({ key: 'co2', label: 'CO2 low', amount: co2Amount, kind: 'damage' });

  // Temperature — two-sided.
  const [tempLo, tempHi] = species.tolerableTemp;
  let tempAmount = 0;
  if (resources.temperature < tempLo) {
    tempAmount = plantsConfig.temperatureStressSeverity * (tempLo - resources.temperature);
  } else if (resources.temperature > tempHi) {
    tempAmount = plantsConfig.temperatureStressSeverity * (resources.temperature - tempHi);
  }
  factors.push({ key: 'temperature', label: 'Temperature', amount: tempAmount, kind: 'damage' });

  // pH — two-sided.
  const [phLo, phHi] = species.tolerablePH;
  let phAmount = 0;
  if (resources.ph < phLo) {
    phAmount = plantsConfig.phStressSeverity * (phLo - resources.ph);
  } else if (resources.ph > phHi) {
    phAmount = plantsConfig.phStressSeverity * (resources.ph - phHi);
  }
  factors.push({ key: 'ph', label: 'pH', amount: phAmount, kind: 'damage' });

  // Nutrient deficiency — Liebig sufficiency drives a single damage
  // signal proportional to (1 − sufficiency).
  const sufficiency = calculateNutrientSufficiency(
    resources,
    waterVolume,
    plant.species,
    nutrientsConfig
  );
  const deficiency = Math.max(0, 1 - sufficiency);
  const nutrientAmount = plantsConfig.nutrientDeficiencySeverity * deficiency;
  factors.push({
    key: 'nutrients',
    label: 'Nutrient deficiency',
    amount: nutrientAmount,
    kind: 'damage',
  });

  // Nutrient toxicity — gross NO3 overdose (auto-doser failure case).
  const nitratePpm = getPpm(resources.nitrate, waterVolume);
  let toxicityAmount = 0;
  if (nitratePpm > plantsConfig.nutrientToxicityThresholdNitrate) {
    toxicityAmount =
      plantsConfig.nutrientToxicitySeverity *
      (nitratePpm - plantsConfig.nutrientToxicityThresholdNitrate);
  }
  factors.push({
    key: 'nutrientToxicity',
    label: 'Nutrient toxicity',
    amount: toxicityAmount,
    kind: 'damage',
  });

  // Algae shading — only kicks in once algae density is meaningful.
  let algaeAmount = 0;
  if (resources.algae > plantsConfig.algaeShadingThreshold) {
    algaeAmount =
      plantsConfig.algaeShadingSeverity * (resources.algae - plantsConfig.algaeShadingThreshold);
  }
  factors.push({ key: 'algae', label: 'Algae shading', amount: algaeAmount, kind: 'damage' });

  return factors;
}

/**
 * Build the benefit list for a plant — five factors, all binary
 * in-range/out-of-range.
 */
export function buildPlantBenefits(ctx: PlantVitalityContext): VitalityFactor[] {
  const { plant, resources, waterVolume, plantsConfig, nutrientsConfig } = ctx;
  const species = PLANT_SPECIES_DATA[plant.species];
  const [lightLo, lightHi] = species.tolerableLight;
  const [co2Lo, co2Hi] = species.tolerableCO2;
  const [tempLo, tempHi] = species.tolerableTemp;
  const [phLo, phHi] = species.tolerablePH;

  const sufficiency = calculateNutrientSufficiency(
    resources,
    waterVolume,
    plant.species,
    nutrientsConfig
  );

  return [
    {
      key: 'light',
      label: 'Light',
      amount: inRangeBenefit(resources.light, lightLo, lightHi, plantsConfig.lightBenefitPeak),
      kind: 'benefit',
    },
    {
      key: 'co2',
      label: 'CO2',
      amount: inRangeBenefit(resources.co2, co2Lo, co2Hi, plantsConfig.co2BenefitPeak),
      kind: 'benefit',
    },
    {
      key: 'temperature',
      label: 'Temperature',
      amount: inRangeBenefit(
        resources.temperature,
        tempLo,
        tempHi,
        plantsConfig.temperatureBenefitPeak
      ),
      kind: 'benefit',
    },
    {
      key: 'ph',
      label: 'pH',
      amount: inRangeBenefit(resources.ph, phLo, phHi, plantsConfig.phBenefitPeak),
      kind: 'benefit',
    },
    {
      key: 'nutrients',
      label: 'Nutrients',
      // Nutrient benefit scales linearly with sufficiency — a partially
      // fed plant gets a partial benefit. Asymmetric with the deficiency
      // stressor (which scales with (1 − sufficiency)) by design: the
      // two together let condition track sufficiency continuously for
      // plants whose only knob is nutrients.
      amount: plantsConfig.nutrientBenefitPeak * Math.max(0, Math.min(1, sufficiency)),
      kind: 'benefit',
    },
  ];
}

/**
 * Compute one tick of vitality for a plant — useful for UI rendering
 * (trend arrows, breakdown lists) and for tests. Stateless.
 */
export function computePlantVitality(ctx: PlantVitalityContext): VitalityResult {
  const species = PLANT_SPECIES_DATA[ctx.plant.species];
  return computeVitality({
    stressors: buildPlantStressors(ctx),
    benefits: buildPlantBenefits(ctx),
    hardiness: species.hardiness,
    condition: ctx.plant.condition,
  });
}
