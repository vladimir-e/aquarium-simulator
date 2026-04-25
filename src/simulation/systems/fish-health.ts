/**
 * Fish health system — runs on the unified Vitality engine.
 *
 * Each tick a fish's environment is decomposed into damage and benefit
 * factors, fed through {@link computeVitality}, and the result drives
 * `health` (the fish-side name for vitality's `condition`). Surplus is
 * captured on `Fish.surplus` for future lifecycle behaviour (breeding,
 * juvenile→adult progression, longevity bonuses) but is otherwise unused
 * for now.
 *
 * Design notes (locked in task 40):
 * - Stressors keep their existing severities (calibrated against the
 *   four canonical scenarios). Hardiness scaling moves into the vitality
 *   module — fish-health sets up the factors with raw severities and
 *   `computeVitality` applies `(1 - hardiness)`.
 * - Benefits are: pH in range (0.4 %/h), hunger ≤ 30 (0.3), oxygen ≥ 5
 *   mg/L (0.3). Sum at all-ideal = 1.0 %/h — the budget the four
 *   canonical calibration scenarios were pinned against. Temperature
 *   is intentionally not a separate benefit — within the species range
 *   the fish already has zero temp damage and the other benefits cover
 *   recovery; outside the range the temperature stressor takes over.
 *   When per-species `optimalTemperature` data lands later (paired with
 *   the existing tolerableTemperatureRange) we can revisit by adding a
 *   small "in optimal sub-band" benefit without breaking calibration.
 */

import type { Fish, Resources } from '../state.js';
import { FISH_SPECIES_DATA } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';
import { unionizedAmmoniaFraction } from './nitrogen-cycle.js';
import {
  computeVitality,
  type VitalityFactor,
  type VitalityResult,
} from './vitality.js';

export interface HealthResult {
  /** Fish that survived this tick */
  survivingFish: Fish[];
  /** Names of fish that died */
  deadFishNames: string[];
  /** Total waste produced from dead fish */
  deathWaste: number;
}

/**
 * Per-stressor stress contribution (%/hr) for a single fish.
 *
 * Each field is the damage rate that stressor adds to the fish this
 * tick, already scaled by the fish's effective hardiness. The shape is
 * preserved from the pre-vitality engine because plant cards / fish
 * cards index it by name.
 */
export interface StressBreakdown {
  temperature: number;
  ph: number;
  ammonia: number;
  nitrite: number;
  nitrate: number;
  hunger: number;
  oxygen: number;
  waterLevel: number;
  flow: number;
  total: number;
}

const ZERO_BREAKDOWN: StressBreakdown = {
  temperature: 0,
  ph: 0,
  ammonia: 0,
  nitrite: 0,
  nitrate: 0,
  hunger: 0,
  oxygen: 0,
  waterLevel: 0,
  flow: 0,
  total: 0,
};

/**
 * Compute the effective hardiness for a fish.
 *
 * Species baseline + per-individual offset, clamped so an extreme
 * offset (or legacy data) can't push fish into invincible or instantly-
 * dying territory.
 */
function effectiveHardiness(fish: Fish): number {
  const base = FISH_SPECIES_DATA[fish.species].hardiness;
  return Math.max(0.1, Math.min(0.95, base + fish.hardinessOffset));
}

/**
 * In-range benefit: `peak` while `value` is inside the `[lo, hi]`
 * tolerance band, zero outside. The matching stressor takes over once
 * the value crosses out of range, so the transition stays continuous
 * in the net-rate sense (lose `peak` of benefit, start gaining damage).
 *
 * Step-shaped on purpose: real fish tolerance bands are mostly flat
 * with cliff edges (in/out of range), and a flat plateau keeps the
 * benefit budget near its 1.0 %/h ceiling when only one factor drops
 * to the edge — preserving calibration without per-scenario retunes.
 */
function inRangeBenefit(value: number, lo: number, hi: number, peak: number): number {
  return value >= lo && value <= hi ? peak : 0;
}

/**
 * Linear-ramp benefit: zero up to `lowOff`, ramping to `peak` at
 * `highOn`, full thereafter. Used for hunger (inverted: peak when
 * hunger ≤ low, ramping to 0 above) and oxygen (peak when O2 ≥ high).
 */
function rampBenefit(value: number, lowOff: number, highOn: number, peak: number): number {
  if (lowOff === highOn) return value >= highOn ? peak : 0;
  const ascending = highOn > lowOff;
  if (ascending) {
    if (value <= lowOff) return 0;
    if (value >= highOn) return peak;
    return peak * ((value - lowOff) / (highOn - lowOff));
  }
  // Descending — used for hunger: peak when hunger ≤ highOn, zero at lowOff.
  if (value >= lowOff) return 0;
  if (value <= highOn) return peak;
  return peak * ((lowOff - value) / (lowOff - highOn));
}

/** Peak benefit magnitudes (%/h) — see module-level note for total budget. */
const FISH_BENEFIT_PEAKS = {
  ph: 0.4,
  hunger: 0.3,
  oxygen: 0.3,
} as const;

/** Hunger thresholds (%): full benefit at ≤30, zero at the 50% stress line. */
const HUNGER_FULL = 30;
const HUNGER_NONE = 50;

/**
 * Oxygen thresholds (mg/L): full benefit at ≥5 (the stress threshold).
 * Tighter than a strict aerobic ideal (≥8) on purpose — most healthy
 * tanks sit in the 6–8 mg/L band, and tying the benefit to the same
 * cutoff the stressor uses keeps the net recovery rate stable across
 * the safe-but-not-supersaturated zone (matches legacy 1.0 %/h
 * baseline once the species is otherwise comfortable).
 */
const O2_NONE = 5;
const O2_FULL = 5;

interface FishFactorContext {
  fish: Fish;
  resources: Resources;
  waterVolume: number;
  tankCapacity: number;
  config: LivestockConfig;
}

/**
 * Build the stressor list for a fish, with raw severities (no hardiness
 * applied — that happens inside `computeVitality`). Inactive stressors
 * are emitted with `amount: 0` so the breakdown shape stays stable for
 * downstream UI / tests that look up by name.
 */
function buildStressors(ctx: FishFactorContext): VitalityFactor[] {
  const { fish, resources, waterVolume, tankCapacity, config } = ctx;
  const speciesData = FISH_SPECIES_DATA[fish.species];

  // Temperature stress
  let tempStress = 0;
  const [tempMin, tempMax] = speciesData.temperatureRange;
  if (resources.temperature < tempMin) {
    tempStress = config.temperatureStressSeverity * (tempMin - resources.temperature);
  } else if (resources.temperature > tempMax) {
    tempStress = config.temperatureStressSeverity * (resources.temperature - tempMax);
  }

  // pH stress
  let phStress = 0;
  const [phMin, phMax] = speciesData.phRange;
  if (resources.ph < phMin) {
    phStress = config.phStressSeverity * (phMin - resources.ph);
  } else if (resources.ph > phMax) {
    phStress = config.phStressSeverity * (resources.ph - phMax);
  }

  // Ammonia stress — only the unionized NH3 fraction is acutely toxic.
  // Zero-volume sentinel: tank fully drained but fish still present.
  let ammoniaStress = 0;
  const totalAmmoniaPpm =
    waterVolume > 0 ? resources.ammonia / waterVolume : resources.ammonia > 0 ? 100 : 0;
  if (totalAmmoniaPpm > 0) {
    const freeNH3Ppm =
      waterVolume > 0
        ? totalAmmoniaPpm * unionizedAmmoniaFraction(resources.ph, resources.temperature)
        : totalAmmoniaPpm;
    ammoniaStress = config.ammoniaStressSeverity * freeNH3Ppm;
  }

  // Nitrite stress (any presence harmful)
  let nitriteStress = 0;
  const nitritePpm = waterVolume > 0 ? resources.nitrite / waterVolume : (resources.nitrite > 0 ? 100 : 0);
  if (nitritePpm > 0) {
    nitriteStress = config.nitriteStressSeverity * nitritePpm;
  }

  // Nitrate stress (above 40 ppm)
  let nitrateStress = 0;
  const nitratePpm = waterVolume > 0 ? resources.nitrate / waterVolume : (resources.nitrate > 0 ? 100 : 0);
  if (nitratePpm > 40) {
    nitrateStress = config.nitrateStressSeverity * (nitratePpm - 40);
  }

  // Hunger stress (above 50%)
  let hungerStress = 0;
  if (fish.hunger > 50) {
    hungerStress = config.hungerStressSeverity * (fish.hunger - 50);
  }

  // Oxygen stress (below 5 mg/L)
  let oxygenStress = 0;
  if (resources.oxygen < 5) {
    oxygenStress = config.oxygenStressSeverity * (5 - resources.oxygen);
  }

  // Water level stress (below 50% capacity)
  let waterLevelStress = 0;
  const waterPercent = tankCapacity > 0 ? (waterVolume / tankCapacity) * 100 : 100;
  if (waterPercent < 50) {
    waterLevelStress = config.waterLevelStressSeverity * (50 - waterPercent);
  }

  // Flow stress (above species max tolerance)
  let flowStress = 0;
  if (resources.flow > speciesData.maxFlow) {
    flowStress = config.flowStressSeverity * (resources.flow - speciesData.maxFlow);
  }

  return [
    { key: 'temperature', label: 'Temperature', amount: tempStress, kind: 'damage' },
    { key: 'ph', label: 'pH', amount: phStress, kind: 'damage' },
    { key: 'ammonia', label: 'Free NH3', amount: ammoniaStress, kind: 'damage' },
    { key: 'nitrite', label: 'Nitrite', amount: nitriteStress, kind: 'damage' },
    { key: 'nitrate', label: 'Nitrate', amount: nitrateStress, kind: 'damage' },
    { key: 'hunger', label: 'Hunger', amount: hungerStress, kind: 'damage' },
    { key: 'oxygen', label: 'Oxygen', amount: oxygenStress, kind: 'damage' },
    { key: 'waterLevel', label: 'Water level', amount: waterLevelStress, kind: 'damage' },
    { key: 'flow', label: 'Flow', amount: flowStress, kind: 'damage' },
  ];
}

/**
 * Build the benefit list for a fish. All three configured factors are
 * emitted every tick, even when they contribute zero — UI filters; the
 * simulation doesn't have to.
 */
function buildBenefits(ctx: FishFactorContext): VitalityFactor[] {
  const { fish, resources } = ctx;
  const speciesData = FISH_SPECIES_DATA[fish.species];
  const [phMin, phMax] = speciesData.phRange;

  return [
    {
      key: 'ph',
      label: 'pH',
      amount: inRangeBenefit(resources.ph, phMin, phMax, FISH_BENEFIT_PEAKS.ph),
      kind: 'benefit',
    },
    {
      key: 'hunger',
      label: 'Well-fed',
      amount: rampBenefit(fish.hunger, HUNGER_NONE, HUNGER_FULL, FISH_BENEFIT_PEAKS.hunger),
      kind: 'benefit',
    },
    {
      key: 'oxygen',
      label: 'Oxygen',
      amount: rampBenefit(resources.oxygen, O2_NONE, O2_FULL, FISH_BENEFIT_PEAKS.oxygen),
      kind: 'benefit',
    },
  ];
}

/**
 * Translate a vitality breakdown back into the named-field shape the UI
 * (and existing tests) consume. Values are post-hardiness damage rates —
 * the same numbers `processHealth` is acting on.
 */
function toStressBreakdown(result: VitalityResult): StressBreakdown {
  const breakdown: StressBreakdown = { ...ZERO_BREAKDOWN };
  let total = 0;
  for (const stressor of result.breakdown.stressors) {
    if (stressor.key in breakdown) {
      (breakdown as unknown as Record<string, number>)[stressor.key] = stressor.amount;
    }
    total += stressor.amount;
  }
  breakdown.total = total;
  return breakdown;
}

/**
 * Compute a vitality tick for a single fish without applying it. Used
 * by the UI to render the current trend, by tests to assert against,
 * and by `processHealth` to drive the actual update.
 */
export function computeFishVitality(
  fish: Fish,
  resources: Resources,
  waterVolume: number,
  tankCapacity: number,
  config: LivestockConfig
): VitalityResult {
  const ctx: FishFactorContext = { fish, resources, waterVolume, tankCapacity, config };
  return computeVitality({
    stressors: buildStressors(ctx),
    benefits: buildBenefits(ctx),
    hardiness: effectiveHardiness(fish),
    condition: fish.health,
  });
}

/**
 * Per-stressor breakdown for the UI / tests. Hardiness already applied.
 */
export function calculateStressBreakdown(
  fish: Fish,
  resources: Resources,
  waterVolume: number,
  tankCapacity: number,
  config: LivestockConfig
): StressBreakdown {
  return toStressBreakdown(
    computeFishVitality(fish, resources, waterVolume, tankCapacity, config)
  );
}

/**
 * Total stress for a single fish — thin convenience wrapper over the
 * breakdown. Identical numeric result.
 */
export function calculateStress(
  fish: Fish,
  resources: Resources,
  waterVolume: number,
  tankCapacity: number,
  config: LivestockConfig
): number {
  return calculateStressBreakdown(fish, resources, waterVolume, tankCapacity, config).total;
}

/**
 * Process health for all fish in one tick.
 * Applies vitality, captures surplus, and handles death.
 */
export function processHealth(
  fish: Fish[],
  resources: Resources,
  waterVolume: number,
  tankCapacity: number,
  config: LivestockConfig,
  random: () => number = Math.random
): HealthResult {
  const survivingFish: Fish[] = [];
  const deadFishNames: string[] = [];
  let deathWaste = 0;

  for (const f of fish) {
    const speciesData = FISH_SPECIES_DATA[f.species];

    const result = computeFishVitality(f, resources, waterVolume, tankCapacity, config);
    const newHealth = result.newCondition;

    // Death from health
    if (newHealth <= 0) {
      deadFishNames.push(speciesData.name);
      deathWaste += f.mass * config.deathDecayFactor;
      continue;
    }

    // Death from old age (probabilistic)
    if (f.age >= speciesData.maxAge) {
      if (random() < config.oldAgeDeathChance) {
        deadFishNames.push(`${speciesData.name} (old age)`);
        deathWaste += f.mass * config.deathDecayFactor;
        continue;
      }
    }

    // Surplus accumulates on the fish for future use (breeding, growth).
    // Today nothing reads it; the storage path is wired now to keep the
    // shape stable when those features land.
    survivingFish.push({
      ...f,
      health: newHealth,
      surplus: f.surplus + result.surplus,
    });
  }

  return {
    survivingFish,
    deadFishNames,
    deathWaste,
  };
}
