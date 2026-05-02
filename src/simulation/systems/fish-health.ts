/**
 * Fish health system — runs on the unified Vitality engine.
 *
 * Each tick a fish's environment is decomposed into damage and benefit
 * factors, fed through {@link computeVitality}, and the result drives
 * `health` (the fish-side name for vitality's `condition`). Surplus is
 * captured on `Fish.surplus` for future lifecycle behaviour (breeding,
 * juvenile→adult progression, longevity bonuses) but is otherwise unused.
 *
 * Stressors (raw severities; the vitality module applies hardiness
 * scaling centrally as `(1 - effectiveHardiness)`):
 * - Temperature, pH, free NH3, nitrite, nitrate, satiation (hunger
 *   side), oxygen, water level, flow, age (past species `maxAge`).
 *
 * Benefit factors (peaks and thresholds tunable via `LivestockConfig`):
 * - pH in species range
 * - Satiation in well-fed band (peak around mid-well-fed, zero at
 *   the band edges)
 * - Oxygen ≥ `oxygenStressThreshold`
 * - Plant presence (saturating at `plantBenefitSaturationPoint`)
 *
 * At default calibration the abiotic three sum to ≈ 1.0 %/h and the
 * plant benefit adds up to 0.2 %/h on top.
 *
 * Temperature is not a separate benefit: inside the species range
 * temperature stress is zero and the other benefits cover recovery;
 * outside the range the temperature stressor takes over. The plant-
 * presence benefit gives fish shelter/cover; plant-derived oxygen and
 * ammonia uptake flow through the resource layer into the existing
 * oxygen / ammonia channels and are not double-counted here.
 *
 * The plant benefit pushes the all-good budget above the abiotic
 * ceiling on purpose — a healthy planted tank should sit at full
 * health with a positive net rate, banking surplus on `Fish.surplus`
 * for the future surplus-driven breeding mechanic.
 */

import type { Fish, Plant, Resources } from '../state.js';
import { FISH_SPECIES_DATA } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';
import { unionizedAmmoniaFraction } from './nitrogen-cycle.js';
import { satiationContribution, SATIATION_BAND_LABEL } from './satiation.js';
import {
  computeVitality,
  inRangeBenefit,
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
 * Compute the effective hardiness for a fish.
 *
 * Species baseline + per-individual offset, clamped to [0.1, 0.95]
 * so an extreme offset can't push a fish into invincible or instantly-
 * dying territory.
 */
function effectiveHardiness(fish: Fish): number {
  const base = FISH_SPECIES_DATA[fish.species].hardiness;
  return Math.max(0.1, Math.min(0.95, base + fish.hardinessOffset));
}

interface FishFactorContext {
  fish: Fish;
  resources: Resources;
  plants: Plant[];
  waterVolume: number;
  tankCapacity: number;
  config: LivestockConfig;
}

/**
 * Aggregate plant-presence contribution → saturated benefit (linear ramp).
 *
 * Each plant contributes `(size/100) × (condition/100)`: a full-grown
 * (size 100), thriving (condition 100) plant counts as 1.0; a half-
 * grown plant at full health counts 0.5; a sick plant (condition 0)
 * counts 0. Overgrown plants count proportionally more — a single
 * size-300 healthy plant contributes 3 units and saturates the
 * benefit on its own. That's the intended behaviour: it's a lot of
 * biomass providing shelter. Overgrowth is regulated on the plant
 * side (self-shading and interspecies competition push an overgrown
 * plant toward stressed → biomass dies back → contribution shrinks),
 * so the fish-side math stays linear in raw biomass. The sum runs
 * through `min(1, total / SAT)` so the benefit tops out at `peak`
 * regardless of overplanting — see `plantBenefitSaturationPoint` in
 * `LivestockConfig` for the calibration choice.
 */
function plantBenefitAmount(plants: Plant[], config: LivestockConfig): number {
  if (plants.length === 0) return 0;
  let total = 0;
  for (const plant of plants) {
    total += (plant.size / 100) * (plant.condition / 100);
  }
  const saturation = Math.min(1, total / config.plantBenefitSaturationPoint);
  return config.plantBenefitPeak * saturation;
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

  // Nitrate stress (above the configured threshold)
  let nitrateStress = 0;
  const nitratePpm = waterVolume > 0 ? resources.nitrate / waterVolume : (resources.nitrate > 0 ? 100 : 0);
  if (nitratePpm > config.nitrateStressThreshold) {
    nitrateStress = config.nitrateStressSeverity * (nitratePpm - config.nitrateStressThreshold);
  }

  // Satiation stressor — band-aware label (Overfed / Hungry / Starving)
  // depending on which side of the well-fed peak the fish is sitting
  // on. The amount comes from the single piecewise-linear
  // `satiationContribution` curve; the well-fed benefit is emitted in
  // `buildBenefits` from the same call.
  const satiation = satiationContribution(fish.satiation, config);
  const satiationStressLabel =
    satiation.band === 'overfed' || satiation.band === 'hungry' || satiation.band === 'starving'
      ? SATIATION_BAND_LABEL[satiation.band]
      : SATIATION_BAND_LABEL.hungry;

  // Oxygen stress (below the configured threshold)
  let oxygenStress = 0;
  if (resources.oxygen < config.oxygenStressThreshold) {
    oxygenStress = config.oxygenStressSeverity * (config.oxygenStressThreshold - resources.oxygen);
  }

  // Water level stress (below the configured threshold of capacity)
  let waterLevelStress = 0;
  const waterPercent = tankCapacity > 0 ? (waterVolume / tankCapacity) * 100 : 100;
  if (waterPercent < config.waterLevelStressThreshold) {
    waterLevelStress = config.waterLevelStressSeverity * (config.waterLevelStressThreshold - waterPercent);
  }

  // Flow stress (above species max tolerance)
  let flowStress = 0;
  if (resources.flow > speciesData.maxFlow) {
    flowStress = config.flowStressSeverity * (resources.flow - speciesData.maxFlow);
  }

  // Age stress — past `maxAge` the fish accumulates damage that scales
  // linearly with how far past it is. This replaces the legacy
  // probabilistic old-age cliff with a smooth decline that flows
  // through the same vitality channel as every other stressor: a hardy
  // species in good conditions outlives a sensitive species at the
  // same age, and visible declining health gives the player a chance
  // to react. Death itself is the same `newHealth <= 0` check the
  // other stressors share.
  let ageStress = 0;
  if (fish.age > speciesData.maxAge) {
    ageStress = config.ageStressSeverity * (fish.age - speciesData.maxAge);
  }

  return [
    { key: 'temperature', label: 'Temperature', amount: tempStress },
    { key: 'ph', label: 'pH', amount: phStress },
    { key: 'ammonia', label: 'Free NH3', amount: ammoniaStress },
    { key: 'nitrite', label: 'Nitrite', amount: nitriteStress },
    { key: 'nitrate', label: 'Nitrate', amount: nitrateStress },
    { key: 'hunger', label: satiationStressLabel, amount: satiation.stressor },
    { key: 'oxygen', label: 'Oxygen', amount: oxygenStress },
    { key: 'waterLevel', label: 'Water level', amount: waterLevelStress },
    { key: 'flow', label: 'Flow', amount: flowStress },
    { key: 'age', label: 'Age', amount: ageStress },
  ];
}

/**
 * Build the benefit list for a fish. All four configured factors are
 * emitted every tick, even when they contribute zero — UI filters; the
 * simulation doesn't have to.
 */
function buildBenefits(ctx: FishFactorContext): VitalityFactor[] {
  const { fish, resources, plants, config } = ctx;
  const speciesData = FISH_SPECIES_DATA[fish.species];
  const [phMin, phMax] = speciesData.phRange;

  return [
    {
      key: 'ph',
      label: 'pH',
      amount: inRangeBenefit(resources.ph, phMin, phMax, config.phBenefitPeak),
    },
    {
      key: 'hunger',
      label: SATIATION_BAND_LABEL.wellFed,
      // Same `satiationContribution` curve as the stressor; only the
      // well-fed band emits a non-zero benefit, and the ramps either
      // side of the peak meet zero exactly at the band edges.
      amount: satiationContribution(fish.satiation, config).benefit,
    },
    {
      // Oxygen ≥ stress threshold is the safe side; the benefit is a
      // one-sided "above threshold" peak (`hi = Infinity`) tying directly
      // to the same cutoff. Tighter than a strict aerobic ideal on
      // purpose — most healthy tanks sit in the 6–8 mg/L band, and the
      // shared threshold keeps the net recovery rate stable across the
      // safe-but-not-supersaturated zone.
      key: 'oxygen',
      label: 'Oxygen',
      amount: inRangeBenefit(
        resources.oxygen,
        config.oxygenStressThreshold,
        Infinity,
        config.oxygenBenefitPeak
      ),
    },
    {
      key: 'plants',
      label: 'Plants',
      amount: plantBenefitAmount(plants, config),
    },
  ];
}

/**
 * Compute a vitality tick for a single fish without applying it. Used
 * by the UI to render the current trend, by tests to assert against,
 * and by `processHealth` to drive the actual update.
 */
export function computeFishVitality(
  fish: Fish,
  resources: Resources,
  plants: Plant[],
  waterVolume: number,
  tankCapacity: number,
  config: LivestockConfig
): VitalityResult {
  const ctx: FishFactorContext = { fish, resources, plants, waterVolume, tankCapacity, config };
  return computeVitality({
    stressors: buildStressors(ctx),
    benefits: buildBenefits(ctx),
    hardiness: effectiveHardiness(fish),
    condition: fish.health,
  });
}

/**
 * Process health for all fish in one tick.
 * Applies vitality, captures surplus, and handles death.
 *
 * Death is driven entirely by vitality: when stressors (including
 * the age stressor past `maxAge`) outpace benefits and condition
 * reaches 0, the fish dies. There is no separate probabilistic check.
 */
export function processHealth(
  fish: Fish[],
  resources: Resources,
  plants: Plant[],
  waterVolume: number,
  tankCapacity: number,
  config: LivestockConfig
): HealthResult {
  const survivingFish: Fish[] = [];
  const deadFishNames: string[] = [];
  let deathWaste = 0;

  for (const f of fish) {
    const speciesData = FISH_SPECIES_DATA[f.species];

    const result = computeFishVitality(f, resources, plants, waterVolume, tankCapacity, config);
    const newHealth = result.newCondition;

    if (newHealth <= 0) {
      // Distinguish age-driven death in the log so the player can tell
      // "my fish got old" from "my water went bad." Past maxAge the
      // age stressor is on, so attribute death to age when that's the
      // dominant signal.
      const overAge = f.age > speciesData.maxAge;
      deadFishNames.push(overAge ? `${speciesData.name} (old age)` : speciesData.name);
      deathWaste += f.mass * config.deathDecayFactor;
      continue;
    }

    // Surplus accumulates on the fish for future use (breeding). The
    // storage path is wired so future fish-breeding work can read it
    // directly when it lands.
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
