/**
 * Algae vitality — runs the tank-wide algae through the unified
 * vitality engine.
 *
 * Algae is a single mass-based organism (one population, not an
 * array of specimens). The same `computeVitality` engine plants and
 * fish use drives `condition`; the orchestrator turns surplus into
 * mass growth and condition < 100 into mass decay (see
 * `simulation/algae/index.ts`).
 *
 * Stressors:
 * - `plant_suppression` — plant power above `suppressionThreshold`
 *   damages algae condition.
 *
 * Benefits:
 * - `excess_light` — W/L above `lightExcessThreshold` (capped peak).
 * - `excess_nutrients` — NO3 / PO4 ratio above plant optimum
 *   (capped peak; dominant nutrient lever).
 * - `nutrient_deficiency` — small benefit when nutrients fall below
 *   plant optimum (the canary signal that plants are starving).
 * - `low_plant_power` — plant power below `weaknessThreshold`
 *   (capped peak; mirrors plant_suppression).
 *
 * `low_plant_power` and `plant_suppression` are mirror-image factors
 * with a deadband between `weaknessThreshold` and
 * `suppressionThreshold` — neither fires inside the band, giving
 * the system a quiet zone.
 *
 * No direct CO2 / temperature / pH / oxygen channels. CO2 affects
 * algae indirectly via plant condition (CO2-fed plants thrive →
 * high plant power → algae suppressed). Same for ammonia, light,
 * and any other plant-side input. Plant condition is the meta-signal.
 */

import type { AlgaeState, Plant, Resources } from '../state.js';
import type { AlgaeVitalityConfig } from '../config/algae-vitality.js';
import type { NutrientsConfig } from '../config/nutrients.js';
import { getPpm } from '../resources/index.js';
import { getPlantPower } from './plant-power.js';
import {
  computeVitality,
  type VitalityFactor,
  type VitalityResult,
} from './vitality.js';

export interface AlgaeVitalityContext {
  algae: AlgaeState;
  plants: readonly Plant[];
  resources: Resources;
  /** Tank capacity in liters — used for W/L. */
  tankCapacity: number;
  algaeConfig: AlgaeVitalityConfig;
  nutrientsConfig: NutrientsConfig;
}

/**
 * Capped severity helper: `min(peak, severity × deviation)` clamped
 * to non-negative. Pulls the cap-and-floor pattern out of every
 * benefit factor so the builder reads cleanly.
 */
function cappedAmount(deviation: number, severity: number, peak: number): number {
  if (deviation <= 0) return 0;
  return Math.min(peak, severity * deviation);
}

/**
 * Build the stressor list for algae. Severities are pre-hardiness;
 * the engine applies the central hardiness factor.
 *
 * Inactive stressors are emitted with `amount: 0` so the breakdown
 * shape stays stable for UI / tests that look up by key.
 */
export function buildAlgaeStressors(ctx: AlgaeVitalityContext): VitalityFactor[] {
  const { plants, algaeConfig } = ctx;
  const power = getPlantPower(plants);

  let plantSuppression = 0;
  if (power > algaeConfig.suppressionThreshold) {
    plantSuppression =
      algaeConfig.plantSuppressionSeverity *
      (power - algaeConfig.suppressionThreshold);
  }

  return [
    { key: 'plant_suppression', label: 'Plant suppression', amount: plantSuppression },
  ];
}

/**
 * Build the benefit list for algae. All four benefit channels are
 * emitted every tick (zero-amount when inactive) so the UI breakdown
 * has a stable shape.
 */
export function buildAlgaeBenefits(ctx: AlgaeVitalityContext): VitalityFactor[] {
  const { plants, resources, tankCapacity, algaeConfig, nutrientsConfig } = ctx;

  // Excess light — W/L above the threshold. Photoperiod-gated by
  // `resources.light` itself, which is already 0 at night.
  const wattsPerLiter =
    tankCapacity > 0 ? resources.light / tankCapacity : 0;
  const excessLight = cappedAmount(
    wattsPerLiter - algaeConfig.lightExcessThreshold,
    algaeConfig.excessLightSeverity,
    algaeConfig.excessLightPeak
  );

  // Nutrient excess / deficiency — relative to plant optimum from the
  // nutrients config (which the player tunes for their planted setup).
  // Excess fires when the tank has more than plants need; deficiency
  // fires when the tank has less. Take the max across NO3/PO4 so a
  // single overdose / starvation signal lights up the channel.
  const waterVolume = resources.water;
  const nitratePpm = waterVolume > 0 ? getPpm(resources.nitrate, waterVolume) : 0;
  const phosphatePpm = waterVolume > 0 ? getPpm(resources.phosphate, waterVolume) : 0;
  const optNo3 = nutrientsConfig.optimalNitratePpm;
  const optPo4 = nutrientsConfig.optimalPhosphatePpm;

  const no3Ratio = optNo3 > 0 ? nitratePpm / optNo3 : 0;
  const po4Ratio = optPo4 > 0 ? phosphatePpm / optPo4 : 0;

  // Excess: largest fractional overshoot above optimum.
  const no3Excess = Math.max(0, no3Ratio - 1);
  const po4Excess = Math.max(0, po4Ratio - 1);
  const excessRatio = Math.max(no3Excess, po4Excess);
  const excessNutrients = cappedAmount(
    excessRatio,
    algaeConfig.excessNutrientSeverity,
    algaeConfig.excessNutrientPeak
  );

  // Deficiency: largest shortfall below optimum (only fires when
  // there is a *plant* optimum in the config; if both optima are
  // zero or undefined, the deficit is zero).
  const no3Deficit = optNo3 > 0 ? Math.max(0, 1 - no3Ratio) : 0;
  const po4Deficit = optPo4 > 0 ? Math.max(0, 1 - po4Ratio) : 0;
  const deficitRatio = Math.max(no3Deficit, po4Deficit);
  const nutrientDeficiency = cappedAmount(
    deficitRatio,
    algaeConfig.nutrientDeficiencySeverity,
    algaeConfig.nutrientDeficiencyPeak
  );

  // Low plant power — mirror-image of suppression on the benefit
  // side. Algae moves in when plants can't hold the line.
  const power = getPlantPower(plants);
  const lowPlantPower = cappedAmount(
    algaeConfig.weaknessThreshold - power,
    algaeConfig.lowPlantPowerSeverity,
    algaeConfig.lowPlantPowerPeak
  );

  return [
    { key: 'excess_light', label: 'Excess light', amount: excessLight },
    { key: 'excess_nutrients', label: 'Excess nutrients', amount: excessNutrients },
    { key: 'nutrient_deficiency', label: 'Nutrient deficiency', amount: nutrientDeficiency },
    { key: 'low_plant_power', label: 'Low plant power', amount: lowPlantPower },
  ];
}

/**
 * Compute one tick of vitality for algae. Stateless — UI and tests
 * call this directly; the orchestrator calls it as part of the
 * full tick pipeline.
 */
export function computeAlgaeVitality(ctx: AlgaeVitalityContext): VitalityResult {
  return computeVitality({
    stressors: buildAlgaeStressors(ctx),
    benefits: buildAlgaeBenefits(ctx),
    hardiness: ctx.algaeConfig.hardiness,
    condition: ctx.algae.condition,
  });
}
