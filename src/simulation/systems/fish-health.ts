/**
 * Fish health system — runs on the unified Vitality engine.
 *
 * Each tick a fish's environment is decomposed into damage and benefit
 * factors, fed through {@link computeVitality}, and the result drives
 * `health` (the fish-side name for vitality's `condition`). Income at full
 * health banks on `Fish.surplus`; the bank heals health below 100 at
 * {@link fishHealingRate}, and a full one is what a female spawns on (see
 * `livestock/breeding.ts`).
 *
 * Stressors, hardened here before they reach the vitality engine:
 * - Temperature, pH, GH, satiation (hunger side), water level, flow, age
 *   (past species `maxAge`) are scaled by `1 − effectiveHardiness`.
 * - Free NH3, nitrite, nitrate and oxygen instead carry hardiness on the
 *   concentration axis: it moves where harm starts, not how steeply it grows.
 *
 * Benefit factors (peaks tunable via `LivestockConfig`):
 * - pH, full at the band centre and zero at its edges
 * - Satiation in well-fed band (peak around mid-well-fed, zero at
 *   the band edges)
 * - Oxygen, rising from `OXYGEN_EDGE` to full at `OXYGEN_COMFORT`
 * - Plant presence (saturating at `plantBenefitSaturationPoint`)
 *
 * At default calibration, pH at its band centre, the abiotic three sum
 * to ≈ 1.0 %/h and the plant benefit adds up to 0.2 %/h on top.
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
 * health with a positive net rate, banking surplus on `Fish.surplus`.
 */

import type { Fish, Plant, Resources } from '../state.js';
import { getPh } from '../core/carbonate.js';
import { FISH_SPECIES_DATA } from '../livestock/species.js';
import { getDgh, getPpm } from '../resources/index.js';
import type { LivestockConfig } from '../config/livestock.js';
import { freeAmmoniaPpm } from './nitrogen-cycle.js';
import { satiationContribution, SATIATION_BAND_LABEL } from './satiation.js';
import { getPlantPower } from './plant-power.js';
import {
  FREE_AMMONIA_EDGE,
  NITRATE_EDGE,
  NITRITE_EDGE,
  OXYGEN_COMFORT,
  OXYGEN_EDGE,
  OXYGEN_LOG_OFFSET,
  toleranceFactor,
} from '../livestock/tolerance.js';
import {
  bandComfort,
  computeVitality,
  eFoldsPast,
  eFoldsUnder,
  hardened,
  outsideBand,
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
  hardiness: number;
}

/**
 * Aggregate plant-presence contribution → saturated benefit (linear ramp).
 *
 * Plant power is `Σ (plant.size / 100) × (plant.condition / 100)` (see
 * `getPlantPower`). The sum runs through `min(1, power / SAT)` so the
 * benefit tops out at `peak` regardless of overplanting — see
 * `plantBenefitSaturationPoint` in `LivestockConfig` for the calibration
 * choice. Algae vitality reads the same `getPlantPower` primitive for
 * its suppression stressor, so the two consumers stay consistent.
 */
function plantBenefitAmount(plants: Plant[], config: LivestockConfig): number {
  const power = getPlantPower(plants);
  if (power <= 0) return 0;
  const saturation = Math.min(1, power / config.plantBenefitSaturationPoint);
  return config.plantBenefitPeak * saturation;
}

/**
 * Build the hardened stressor list for a fish: water-quality channels move
 * their edge by hardiness, the rest are scaled by it. Inactive stressors are
 * emitted with `amount: 0` so the breakdown shape stays stable for downstream
 * UI / tests that look up by name.
 */
function buildStressors(ctx: FishFactorContext): VitalityFactor[] {
  const { fish, resources, waterVolume, tankCapacity, config } = ctx;
  const speciesData = FISH_SPECIES_DATA[fish.species];
  const tolerance = toleranceFactor(ctx.hardiness);

  const tempStress =
    config.temperatureStressSeverity * outsideBand(resources.temperature, speciesData.temperatureRange);
  const ph = getPh(resources);
  const phStress = config.phStressSeverity * outsideBand(ph, speciesData.phRange);
  const ghStress =
    config.ghStressSeverity * outsideBand(getDgh(resources.gh, waterVolume), speciesData.ghRange);

  // Only the unionized NH3 fraction is acutely toxic.
  const freeNH3Ppm = freeAmmoniaPpm({ ...resources, water: waterVolume });
  const ammoniaStress = config.ammoniaStressSeverity * eFoldsPast(freeNH3Ppm, FREE_AMMONIA_EDGE * tolerance);
  const nitriteStress =
    config.nitriteStressSeverity * eFoldsPast(getPpm(resources.nitrite, waterVolume), NITRITE_EDGE * tolerance);
  const nitrateStress =
    config.nitrateStressSeverity * eFoldsPast(getPpm(resources.nitrate, waterVolume), NITRATE_EDGE * tolerance);

  // Satiation stressor — band-aware label (Overfed / Hungry / Starving)
  // depending on which side of the well-fed peak the fish is sitting
  // on. The amount comes from the single piecewise-linear
  // `satiationContribution` curve; the well-fed benefit is emitted in
  // `buildBenefits` from the same call. When the fish is in a non-
  // stressing band (well-fed or peckish) the entry is still emitted at
  // amount 0 so the breakdown shape stays stable; the label falls back
  // to the neutral channel name "Satiation" so a UI introspecting the
  // inactive entry doesn't see a misleading band name.
  const satiation = satiationContribution(fish.satiation, config);
  const satiationStressLabel =
    satiation.band === 'overfed' || satiation.band === 'hungry' || satiation.band === 'starving'
      ? SATIATION_BAND_LABEL[satiation.band]
      : 'Satiation';

  const oxygenStress =
    config.oxygenStressSeverity * eFoldsUnder(resources.oxygen, OXYGEN_EDGE / tolerance, OXYGEN_LOG_OFFSET);

  // Water level stress (below the configured threshold of capacity)
  let waterLevelStress = 0;
  const waterPercent = tankCapacity > 0 ? (waterVolume / tankCapacity) * 100 : 100;
  if (waterPercent < config.waterLevelStressThreshold) {
    waterLevelStress = config.waterLevelStressSeverity * (config.waterLevelStressThreshold - waterPercent);
  }

  // A drained tank has no circulation to feel — the water-level
  // stressor owns that one.
  let flowStress = 0;
  const turnover = waterVolume > 0 ? resources.flow / waterVolume : 0;
  if (turnover > speciesData.maxTurnover) {
    flowStress = config.flowStressSeverity * (turnover - speciesData.maxTurnover);
  }

  // Age stress — past `maxAge` damage grows linearly with the excess,
  // through the same channel as every other stressor: a hardy species in
  // good conditions outlives a sensitive species at the same age, and
  // visible declining health gives the player a chance to react. Death
  // itself is the same `newHealth <= 0` check the other stressors share.
  let ageStress = 0;
  if (fish.age > speciesData.maxAge) {
    ageStress = config.ageStressSeverity * (fish.age - speciesData.maxAge);
  }

  return [
    ...hardened(
      [
        { key: 'temperature', label: 'Temperature', amount: tempStress },
        { key: 'ph', label: 'pH', amount: phStress },
        { key: 'gh', label: 'GH', amount: ghStress },
        { key: 'satiation', label: satiationStressLabel, amount: satiation.stressor },
        { key: 'waterLevel', label: 'Water level', amount: waterLevelStress },
        { key: 'flow', label: 'Flow', amount: flowStress },
        { key: 'age', label: 'Age', amount: ageStress },
      ],
      ctx.hardiness
    ),
    { key: 'ammonia', label: 'Free NH3', amount: ammoniaStress },
    { key: 'nitrite', label: 'Nitrite', amount: nitriteStress },
    { key: 'nitrate', label: 'Nitrate', amount: nitrateStress },
    { key: 'oxygen', label: 'Oxygen', amount: oxygenStress },
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

  return [
    {
      key: 'ph',
      label: 'pH',
      amount: config.phBenefitPeak * bandComfort(getPh(resources), speciesData.phRange),
    },
    {
      key: 'satiation',
      label: SATIATION_BAND_LABEL.wellFed,
      // Same `satiationContribution` curve as the stressor; only the
      // well-fed band emits a non-zero benefit, and the ramps either
      // side of the peak meet zero exactly at the band edges.
      amount: satiationContribution(fish.satiation, config).benefit,
    },
    {
      key: 'oxygen',
      label: 'Oxygen',
      amount:
        config.oxygenBenefitPeak *
        Math.min(1, eFoldsPast(resources.oxygen, OXYGEN_EDGE) / Math.log(OXYGEN_COMFORT / OXYGEN_EDGE)),
    },
    {
      key: 'plants',
      label: 'Plants',
      amount: plantBenefitAmount(plants, config),
    },
  ];
}

/**
 * Share of its bank a fish heals from per hour: `healingDrawRate` for a 1 g
 * fish, scaled by adult mass to the −¼ power, as mass-specific metabolism is.
 */
export function fishHealingRate(fish: Fish, config: LivestockConfig): number {
  return config.healingDrawRate * FISH_SPECIES_DATA[fish.species].adultMass ** -0.25;
}

/**
 * A vitality tick for one fish, without applying it — `processHealth` applies
 * it. A caller wanting the next tick's numbers reads it on the hour that tick
 * settles, with the fish as metabolism leaves them.
 */
export function computeFishVitality(
  fish: Fish,
  resources: Resources,
  plants: Plant[],
  waterVolume: number,
  tankCapacity: number,
  config: LivestockConfig
): VitalityResult {
  const hardiness = effectiveHardiness(fish);
  const ctx: FishFactorContext = { fish, resources, plants, waterVolume, tankCapacity, config, hardiness };
  return computeVitality({
    stressors: buildStressors(ctx),
    benefits: buildBenefits(ctx),
    condition: fish.health,
    surplus: fish.surplus,
    surplusCap: config.surplusCap,
    healingRate: fishHealingRate(fish, config),
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

    survivingFish.push({
      ...f,
      health: newHealth,
      surplus: result.surplus,
    });
  }

  return {
    survivingFish,
    deadFishNames,
    deathWaste,
  };
}
