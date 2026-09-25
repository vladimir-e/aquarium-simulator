/**
 * Algae population dynamics — runs the tank-wide algae through the
 * shared stressor / benefit machinery, but as a pure population, not
 * an organism with a condition state.
 *
 * Algae is a population whose coverage rises when conditions favour
 * it and falls when conditions are hostile. There is no intermediate
 * `condition` — net rate (benefit − damage, post-hardiness) drives
 * mass. The orchestrator folds a positive net into the surplus bank
 * (photoperiod-gated); a negative net drains that reserve buffer first
 * and only shrinks mass by the shortfall the bank can't cover.
 *
 * Stressors:
 * - `plant_suppression` — plant power above `suppressionThreshold`
 *   damages algae growth.
 *
 * Benefits:
 * - `excess_light` — substrate PAR above `lightExcessThreshold`
 *   (capped peak).
 * - `excess_nutrients` — NO3 / PO4 ratio above algae's reference ppm
 *   (capped peak; dominant nutrient lever).
 * - `nutrient_deficiency` — small benefit when nutrients fall below
 *   that reference (the canary signal that plants are starving).
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

import type { Plant, Resources } from '../state.js';
import type { AlgaeVitalityConfig } from '../config/algae-vitality.js';
import { getPpm } from '../resources/index.js';
import { getPlantPower } from './plant-power.js';
import type { VitalityFactor } from './vitality.js';

export interface AlgaeVitalityContext {
  plants: readonly Plant[];
  resources: Resources;
  algaeConfig: AlgaeVitalityConfig;
}

/**
 * Per-factor and aggregate breakdown for the algae population. Mirrors
 * the shape of `VitalityBreakdown` so the UI renderer that consumes
 * vitality breakdowns can read this directly.
 */
export interface AlgaePopulationBreakdown {
  /** Stressor factors with hardiness already applied to `amount`. */
  stressors: VitalityFactor[];
  /** Benefit factors (unchanged from the builder). */
  benefits: VitalityFactor[];
  /** Total damage rate (%/h), post-hardiness. */
  damageRate: number;
  /** Total benefit rate (%/h). */
  benefitRate: number;
  /** Net rate (benefit − damage). Positive = growing. */
  net: number;
}

/** Result of one tick of algae population computation. */
export interface AlgaePopulationResult {
  /** Net rate (benefit − damage), post-hardiness. Drives mass directly. */
  net: number;
  /** Per-factor and aggregate breakdown for UI / telemetry. */
  breakdown: AlgaePopulationBreakdown;
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
 * `computeAlgaePopulation` applies the central `(1 - hardiness)`
 * scaling.
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
  const { plants, resources, algaeConfig } = ctx;

  // Excess light — substrate PAR above the threshold. Photoperiod-gated by
  // `resources.light` itself, which is already 0 at night.
  const excessLight = cappedAmount(
    resources.light - algaeConfig.lightExcessThreshold,
    algaeConfig.excessLightSeverity,
    algaeConfig.excessLightPeak
  );

  // Nutrient excess / deficiency — relative to algae's reference ppm.
  // Take the max across NO3/PO4 so a single overdose / starvation signal
  // lights up the channel.
  const no3Ratio = getPpm(resources.nitrate, resources.water) / algaeConfig.referenceNitratePpm;
  const po4Ratio =
    getPpm(resources.phosphate, resources.water) / algaeConfig.referencePhosphatePpm;

  const excessNutrients = cappedAmount(
    Math.max(no3Ratio, po4Ratio) - 1,
    algaeConfig.excessNutrientSeverity,
    algaeConfig.excessNutrientPeak
  );

  const nutrientDeficiency = cappedAmount(
    1 - Math.min(no3Ratio, po4Ratio),
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
 * Compute one tick of population dynamics for algae. Stateless — UI
 * and tests call this directly; the orchestrator calls it as part of
 * the full tick pipeline.
 *
 * Applies the central `(1 - hardiness)` factor to stressors, sums
 * both arrays, and returns the net rate plus the bundled breakdown.
 * Net is the rate at which mass changes (positive → growth via
 * surplus, negative → direct shrinkage).
 */
export function computeAlgaePopulation(ctx: AlgaeVitalityContext): AlgaePopulationResult {
  const stressors = buildAlgaeStressors(ctx);
  const benefits = buildAlgaeBenefits(ctx);

  // Match the central engine's hardiness clamp so out-of-range
  // values can't produce negative multipliers.
  const clampedHardiness = Math.max(0, Math.min(1, ctx.algaeConfig.hardiness));
  const hardinessFactor = 1 - clampedHardiness;

  const scaledStressors = stressors.map((s) => ({
    ...s,
    amount: s.amount * hardinessFactor,
  }));

  const damageRate = scaledStressors.reduce((sum, s) => sum + s.amount, 0);
  const benefitRate = benefits.reduce((sum, b) => sum + b.amount, 0);
  const net = benefitRate - damageRate;

  return {
    net,
    breakdown: {
      stressors: scaledStressors,
      benefits,
      damageRate,
      benefitRate,
      net,
    },
  };
}
