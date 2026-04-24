/**
 * Fish health system.
 *
 * Handles:
 * - Stressor calculations (temperature, pH, ammonia, nitrite, nitrate, hunger, oxygen, water level, flow)
 * - Health recovery in good conditions
 * - Health degradation from stressors (modified by hardiness)
 * - Death from health reaching 0
 * - Death from old age (probabilistic after max age)
 */

import type { Fish, Resources } from '../state.js';
import { FISH_SPECIES_DATA } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';
import { unionizedAmmoniaFraction } from './nitrogen-cycle.js';

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
 * tick, already scaled by the fish's effective hardiness — these are
 * the actionable numbers the UI shows and together they sum to
 * `total`, which matches `calculateStress`'s return value.
 *
 * Inactive stressors are `0`, not omitted, so callers can iterate the
 * shape without optional-chaining each field.
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

/**
 * Calculate a per-stressor breakdown of stress on a single fish.
 *
 * Each field is already multiplied by the effective hardiness factor,
 * so values are directly the %/hr damage each stressor contributes.
 * `total` is the sum and matches what `calculateStress` returns — the
 * two functions share this implementation so `processHealth` cannot
 * drift from the UI's displayed numbers.
 */
export function calculateStressBreakdown(
  fish: Fish,
  resources: Resources,
  waterVolume: number,
  tankCapacity: number,
  config: LivestockConfig
): StressBreakdown {
  const speciesData = FISH_SPECIES_DATA[fish.species];
  // Apply per-fish hardiness offset on top of the species baseline,
  // clamped to a sane range so extreme offsets (or legacy data) can't
  // push fish into invincible or instantly-dying territory.
  const effectiveHardiness = Math.max(
    0.1,
    Math.min(0.95, speciesData.hardiness + fish.hardinessOffset)
  );
  const hardinessFactor = 1 - effectiveHardiness;

  // Temperature stress
  let temperature = 0;
  const temp = resources.temperature;
  const [tempMin, tempMax] = speciesData.temperatureRange;
  if (temp < tempMin) {
    temperature = config.temperatureStressSeverity * (tempMin - temp) * hardinessFactor;
  } else if (temp > tempMax) {
    temperature = config.temperatureStressSeverity * (temp - tempMax) * hardinessFactor;
  }

  // pH stress
  let ph = 0;
  const phVal = resources.ph;
  const [phMin, phMax] = speciesData.phRange;
  if (phVal < phMin) {
    ph = config.phStressSeverity * (phMin - phVal) * hardinessFactor;
  } else if (phVal > phMax) {
    ph = config.phStressSeverity * (phVal - phMax) * hardinessFactor;
  }

  // Ammonia stress — only the unionized NH3 fraction (not NH4⁺) is
  // acutely toxic. f_NH3 depends strongly on pH and temperature: at
  // pH 6.5 / 25 °C barely 0.18 % of TAN is the toxic form, at pH 8 it
  // is ~5 %. `ammoniaStressSeverity` is expressed per ppm of free NH3.
  //
  // Zero-volume branch is a max-stress sentinel for degenerate states
  // (tank fully drained with fish still present — shouldn't happen in
  // normal play, but keep the defensive fallback so stress stays
  // finite and fish aren't silently fine in a dry tank). We clamp the
  // apparent concentration to 100 ppm and skip Emerson unionization
  // since pH/temperature are meaningless without water.
  let ammonia = 0;
  const totalAmmoniaPpm =
    waterVolume > 0 ? resources.ammonia / waterVolume : resources.ammonia > 0 ? 100 : 0;
  if (totalAmmoniaPpm > 0) {
    const freeNH3Ppm =
      waterVolume > 0
        ? totalAmmoniaPpm * unionizedAmmoniaFraction(resources.ph, resources.temperature)
        : totalAmmoniaPpm; // zero-volume sentinel: max stress
    ammonia = config.ammoniaStressSeverity * freeNH3Ppm * hardinessFactor;
  }

  // Nitrite stress (any amount is harmful). Same zero-volume sentinel
  // pattern as ammonia above.
  let nitrite = 0;
  const nitritePpm = waterVolume > 0 ? resources.nitrite / waterVolume : (resources.nitrite > 0 ? 100 : 0);
  if (nitritePpm > 0) {
    nitrite = config.nitriteStressSeverity * nitritePpm * hardinessFactor;
  }

  // Nitrate stress (above 40 ppm)
  let nitrate = 0;
  const nitratePpm = waterVolume > 0 ? resources.nitrate / waterVolume : (resources.nitrate > 0 ? 100 : 0);
  if (nitratePpm > 40) {
    nitrate = config.nitrateStressSeverity * (nitratePpm - 40) * hardinessFactor;
  }

  // Hunger stress (above 50%)
  let hunger = 0;
  if (fish.hunger > 50) {
    hunger = config.hungerStressSeverity * (fish.hunger - 50) * hardinessFactor;
  }

  // Oxygen stress (below 5 mg/L)
  let oxygen = 0;
  if (resources.oxygen < 5) {
    oxygen = config.oxygenStressSeverity * (5 - resources.oxygen) * hardinessFactor;
  }

  // Water level stress (below 50% capacity)
  let waterLevel = 0;
  const waterPercent = tankCapacity > 0 ? (waterVolume / tankCapacity) * 100 : 100;
  if (waterPercent < 50) {
    waterLevel = config.waterLevelStressSeverity * (50 - waterPercent) * hardinessFactor;
  }

  // Flow stress (above species max tolerance)
  let flow = 0;
  const flowVal = resources.flow;
  if (flowVal > speciesData.maxFlow) {
    flow = config.flowStressSeverity * (flowVal - speciesData.maxFlow) * hardinessFactor;
  }

  const total =
    temperature + ph + ammonia + nitrite + nitrate + hunger + oxygen + waterLevel + flow;

  return { temperature, ph, ammonia, nitrite, nitrate, hunger, oxygen, waterLevel, flow, total };
}

/**
 * Calculate total stress for a single fish from all environmental stressors.
 * Thin wrapper over `calculateStressBreakdown` — identical numeric result.
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
 * Applies stressor damage, health recovery, and handles death.
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

    // Calculate total stress
    const stress = calculateStress(f, resources, waterVolume, tankCapacity, config);

    // Health change: recovery minus stress
    const healthChange = config.baseHealthRecovery - stress;
    const newHealth = Math.min(100, Math.max(0, f.health + healthChange));

    // Check death from health
    if (newHealth <= 0) {
      deadFishNames.push(speciesData.name);
      deathWaste += f.mass * config.deathDecayFactor;
      continue;
    }

    // Check death from old age
    if (f.age >= speciesData.maxAge) {
      if (random() < config.oldAgeDeathChance) {
        deadFishNames.push(`${speciesData.name} (old age)`);
        deathWaste += f.mass * config.deathDecayFactor;
        continue;
      }
    }

    survivingFish.push({
      ...f,
      health: newHealth,
    });
  }

  return {
    survivingFish,
    deadFishNames,
    deathWaste,
  };
}
