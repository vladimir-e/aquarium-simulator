/**
 * Fish health system.
 *
 * Handles:
 * - Stressor calculations (temperature, pH, ammonia, nitrite, nitrate, hunger, oxygen, water level)
 * - Health recovery in good conditions
 * - Health degradation from stressors (modified by hardiness)
 * - Death from health reaching 0
 * - Death from old age (probabilistic after max age)
 */

import type { Fish, Resources } from '../state.js';
import { FISH_SPECIES_DATA } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';

export interface HealthResult {
  /** Fish that survived this tick */
  survivingFish: Fish[];
  /** Names of fish that died */
  deadFishNames: string[];
  /** Total waste produced from dead fish */
  deathWaste: number;
}

/**
 * Calculate total stress for a single fish from all environmental stressors.
 */
export function calculateStress(
  fish: Fish,
  resources: Resources,
  waterVolume: number,
  tankCapacity: number,
  config: LivestockConfig
): number {
  const speciesData = FISH_SPECIES_DATA[fish.species];
  const hardinessFactor = 1 - speciesData.hardiness;
  let stress = 0;

  // Temperature stress
  const temp = resources.temperature;
  const [tempMin, tempMax] = speciesData.temperatureRange;
  if (temp < tempMin) {
    stress += config.temperatureStressSeverity * (tempMin - temp) * hardinessFactor;
  } else if (temp > tempMax) {
    stress += config.temperatureStressSeverity * (temp - tempMax) * hardinessFactor;
  }

  // pH stress
  const ph = resources.ph;
  const [phMin, phMax] = speciesData.phRange;
  if (ph < phMin) {
    stress += config.phStressSeverity * (phMin - ph) * hardinessFactor;
  } else if (ph > phMax) {
    stress += config.phStressSeverity * (ph - phMax) * hardinessFactor;
  }

  // Ammonia stress (any amount is harmful)
  const ammoniaPpm = waterVolume > 0 ? resources.ammonia / waterVolume : 0;
  if (ammoniaPpm > 0) {
    stress += config.ammoniaStressSeverity * ammoniaPpm * hardinessFactor;
  }

  // Nitrite stress (any amount is harmful)
  const nitritePpm = waterVolume > 0 ? resources.nitrite / waterVolume : 0;
  if (nitritePpm > 0) {
    stress += config.nitriteStressSeverity * nitritePpm * hardinessFactor;
  }

  // Nitrate stress (above 40 ppm)
  const nitratePpm = waterVolume > 0 ? resources.nitrate / waterVolume : 0;
  if (nitratePpm > 40) {
    stress += config.nitrateStressSeverity * (nitratePpm - 40) * hardinessFactor;
  }

  // Hunger stress (above 50%)
  if (fish.hunger > 50) {
    stress += config.hungerStressSeverity * (fish.hunger - 50) * hardinessFactor;
  }

  // Oxygen stress (below 5 mg/L)
  if (resources.oxygen < 5) {
    stress += config.oxygenStressSeverity * (5 - resources.oxygen) * hardinessFactor;
  }

  // Water level stress (below 50% capacity)
  const waterPercent = tankCapacity > 0 ? (waterVolume / tankCapacity) * 100 : 100;
  if (waterPercent < 50) {
    stress += config.waterLevelStressSeverity * (50 - waterPercent) * hardinessFactor;
  }

  return stress;
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
