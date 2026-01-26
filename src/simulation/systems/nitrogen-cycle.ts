/**
 * Nitrogen Cycle System - biological conversion of waste to ammonia to nitrite to nitrate.
 * Runs in PASSIVE tier.
 *
 * Three stages:
 * 1. Waste → Ammonia (mineralization) - produces mass in mg
 * 2. Ammonia → Nitrite (AOB bacteria) - processes mass in mg
 * 3. Nitrite → Nitrate (NOB bacteria) - processes mass in mg
 *
 * Storage model: Nitrogen compounds stored as mass (mg).
 * Concentration (ppm) derived as mass/water for threshold checks.
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { System } from './types.js';
import type { TunableConfig } from '../config/index.js';
import { type NitrogenCycleConfig, nitrogenCycleDefaults } from '../config/nitrogen-cycle.js';
import { getPpm } from '../resources/index.js';

/**
 * Calculate maximum bacteria population based on surface area.
 */
export function calculateMaxBacteria(
  surface: number,
  config: NitrogenCycleConfig = nitrogenCycleDefaults
): number {
  return surface * config.bacteriaPerCm2;
}

/**
 * Calculate bacterial growth using logistic formula.
 * Growth slows as population approaches carrying capacity.
 */
export function calculateBacterialGrowth(
  population: number,
  growthRate: number,
  maxPopulation: number
): number {
  if (population <= 0 || maxPopulation <= 0) return 0;
  // Logistic growth: growth = population * rate * (1 - population/max)
  return population * growthRate * (1 - population / maxPopulation);
}

/**
 * Calculate waste to ammonia conversion.
 * Returns wasteConsumed (g) and ammoniaProduced (mg).
 */
export function calculateWasteToAmmonia(
  waste: number,
  config: NitrogenCycleConfig = nitrogenCycleDefaults
): {
  wasteConsumed: number;
  ammoniaProduced: number;
} {
  if (waste <= 0) {
    return { wasteConsumed: 0, ammoniaProduced: 0 };
  }

  const wasteConsumed = waste * config.wasteConversionRate;
  // Convert grams waste to mg ammonia using ratio
  const ammoniaProduced = wasteConsumed * config.wasteToAmmoniaRatio;

  return { wasteConsumed, ammoniaProduced };
}

/**
 * Calculate ammonia to nitrite conversion by AOB bacteria.
 * Returns mass of ammonia processed (mg). 1:1 conversion to nitrite.
 *
 * @param ammoniaMass - Current ammonia mass in mg
 * @param aobPopulation - AOB bacteria population
 * @param waterVolume - Water volume in liters (needed to calculate processing capacity)
 */
export function calculateAmmoniaToNitrite(
  ammoniaMass: number,
  aobPopulation: number,
  waterVolume: number,
  config: NitrogenCycleConfig = nitrogenCycleDefaults
): number {
  if (ammoniaMass <= 0 || aobPopulation <= 0 || waterVolume <= 0) return 0;
  // Processing rate is defined per ppm, multiply by water to get mass capacity
  const canProcessMass = aobPopulation * config.bacteriaProcessingRate * waterVolume;
  return Math.min(canProcessMass, ammoniaMass);
}

/**
 * Calculate nitrite to nitrate conversion by NOB bacteria.
 * Returns mass of nitrite processed (mg). 1:1 conversion to nitrate.
 *
 * @param nitriteMass - Current nitrite mass in mg
 * @param nobPopulation - NOB bacteria population
 * @param waterVolume - Water volume in liters (needed to calculate processing capacity)
 */
export function calculateNitriteToNitrate(
  nitriteMass: number,
  nobPopulation: number,
  waterVolume: number,
  config: NitrogenCycleConfig = nitrogenCycleDefaults
): number {
  if (nitriteMass <= 0 || nobPopulation <= 0 || waterVolume <= 0) return 0;
  // Processing rate is defined per ppm, multiply by water to get mass capacity
  const canProcessMass = nobPopulation * config.bacteriaProcessingRate * waterVolume;
  return Math.min(canProcessMass, nitriteMass);
}

// ============================================================================
// System Implementation
// ============================================================================

export const nitrogenCycleSystem: System = {
  id: 'nitrogen-cycle',
  tier: 'passive',

  update(state: SimulationState, config: TunableConfig): Effect[] {
    const effects: Effect[] = [];
    const { resources } = state;
    const ncConfig = config.nitrogenCycle;
    const maxBacteria = calculateMaxBacteria(resources.surface, ncConfig);
    const waterVolume = resources.water;

    // Track current values for calculations (effects accumulate)
    // Nitrogen compounds are stored as mass (mg)
    let currentWaste = resources.waste;
    let currentAmmonia = resources.ammonia; // mg
    let currentNitrite = resources.nitrite; // mg
    let currentAob = resources.aob;
    let currentNob = resources.nob;

    // ========================================================================
    // Step 0: Cap bacteria to current surface area (handle surface reduction)
    // ========================================================================
    if (currentAob > maxBacteria) {
      effects.push({
        tier: 'passive',
        resource: 'aob',
        delta: maxBacteria - currentAob,
        source: 'nitrogen-cycle-surface-cap',
      });
      currentAob = maxBacteria;
    }
    if (currentNob > maxBacteria) {
      effects.push({
        tier: 'passive',
        resource: 'nob',
        delta: maxBacteria - currentNob,
        source: 'nitrogen-cycle-surface-cap',
      });
      currentNob = maxBacteria;
    }

    // ========================================================================
    // Stage 1: Waste → Ammonia (Mineralization)
    // Produces ammonia mass (mg) from waste (g)
    // ========================================================================
    if (currentWaste > 0) {
      const { wasteConsumed, ammoniaProduced } = calculateWasteToAmmonia(currentWaste, ncConfig);

      if (wasteConsumed > 0) {
        effects.push({
          tier: 'passive',
          resource: 'waste',
          delta: -wasteConsumed,
          source: 'nitrogen-cycle-mineralization',
        });
        currentWaste -= wasteConsumed;

        effects.push({
          tier: 'passive',
          resource: 'ammonia',
          delta: ammoniaProduced, // mg
          source: 'nitrogen-cycle-mineralization',
        });
        currentAmmonia += ammoniaProduced;
      }
    }

    // ========================================================================
    // Stage 2: Ammonia → Nitrite (AOB Bacteria)
    // Processes ammonia mass (mg), produces nitrite mass (mg)
    // ========================================================================
    if (currentAob > 0 && currentAmmonia > 0) {
      const ammoniaProcessed = calculateAmmoniaToNitrite(
        currentAmmonia,
        currentAob,
        waterVolume,
        ncConfig
      );

      if (ammoniaProcessed > 0) {
        effects.push({
          tier: 'passive',
          resource: 'ammonia',
          delta: -ammoniaProcessed, // mg
          source: 'nitrogen-cycle-aob',
        });
        currentAmmonia -= ammoniaProcessed;

        effects.push({
          tier: 'passive',
          resource: 'nitrite',
          delta: ammoniaProcessed, // 1:1 conversion (mg)
          source: 'nitrogen-cycle-aob',
        });
        currentNitrite += ammoniaProcessed;
      }
    }

    // ========================================================================
    // Stage 3: Nitrite → Nitrate (NOB Bacteria)
    // Processes nitrite mass (mg), produces nitrate mass (mg)
    // ========================================================================
    if (currentNob > 0 && currentNitrite > 0) {
      const nitriteProcessed = calculateNitriteToNitrate(
        currentNitrite,
        currentNob,
        waterVolume,
        ncConfig
      );

      if (nitriteProcessed > 0) {
        effects.push({
          tier: 'passive',
          resource: 'nitrite',
          delta: -nitriteProcessed, // mg
          source: 'nitrogen-cycle-nob',
        });
        currentNitrite -= nitriteProcessed;

        effects.push({
          tier: 'passive',
          resource: 'nitrate',
          delta: nitriteProcessed, // 1:1 conversion (mg)
          source: 'nitrogen-cycle-nob',
        });
      }
    }

    // ========================================================================
    // Bacterial Dynamics: Spawning (thresholds in ppm, derived from mass)
    // ========================================================================
    // Derive ppm for threshold checks
    const ammoniaPpm = getPpm(currentAmmonia, waterVolume);
    const nitritePpm = getPpm(currentNitrite, waterVolume);

    // AOB spawns when ammonia reaches threshold and population is zero
    if (currentAob === 0 && ammoniaPpm >= ncConfig.aobSpawnThreshold) {
      effects.push({
        tier: 'passive',
        resource: 'aob',
        delta: ncConfig.spawnAmount,
        source: 'nitrogen-cycle-spawn',
      });
      currentAob = ncConfig.spawnAmount;
    }

    // NOB spawns when nitrite reaches threshold and population is zero
    if (currentNob === 0 && nitritePpm >= ncConfig.nobSpawnThreshold) {
      effects.push({
        tier: 'passive',
        resource: 'nob',
        delta: ncConfig.spawnAmount,
        source: 'nitrogen-cycle-spawn',
      });
      currentNob = ncConfig.spawnAmount;
    }

    // ========================================================================
    // Bacterial Dynamics: Growth (thresholds in ppm, derived from mass)
    // ========================================================================
    // AOB grows if ammonia available (check ppm threshold)
    if (currentAob > 0 && ammoniaPpm >= ncConfig.aobFoodThreshold) {
      const aobGrowth = calculateBacterialGrowth(currentAob, ncConfig.aobGrowthRate, maxBacteria);
      if (aobGrowth > 0) {
        const newAob = Math.min(currentAob + aobGrowth, maxBacteria);
        const actualGrowth = newAob - currentAob;
        if (actualGrowth > 0) {
          effects.push({
            tier: 'passive',
            resource: 'aob',
            delta: actualGrowth,
            source: 'nitrogen-cycle-growth',
          });
          currentAob = newAob;
        }
      }
    }

    // NOB grows if nitrite available (check ppm threshold)
    if (currentNob > 0 && nitritePpm >= ncConfig.nobFoodThreshold) {
      const nobGrowth = calculateBacterialGrowth(currentNob, ncConfig.nobGrowthRate, maxBacteria);
      if (nobGrowth > 0) {
        const newNob = Math.min(currentNob + nobGrowth, maxBacteria);
        const actualGrowth = newNob - currentNob;
        if (actualGrowth > 0) {
          effects.push({
            tier: 'passive',
            resource: 'nob',
            delta: actualGrowth,
            source: 'nitrogen-cycle-growth',
          });
          currentNob = newNob;
        }
      }
    }

    // ========================================================================
    // Bacterial Dynamics: Death (thresholds in ppm, derived from mass)
    // ========================================================================
    // AOB dies if ammonia is scarce (check ppm threshold)
    if (currentAob > 0 && ammoniaPpm < ncConfig.aobFoodThreshold) {
      const aobDeath = currentAob * ncConfig.bacteriaDeathRate;
      if (aobDeath > 0) {
        effects.push({
          tier: 'passive',
          resource: 'aob',
          delta: -aobDeath,
          source: 'nitrogen-cycle-death',
        });
      }
    }

    // NOB dies if nitrite is scarce (check ppm threshold)
    if (currentNob > 0 && nitritePpm < ncConfig.nobFoodThreshold) {
      const nobDeath = currentNob * ncConfig.bacteriaDeathRate;
      if (nobDeath > 0) {
        effects.push({
          tier: 'passive',
          resource: 'nob',
          delta: -nobDeath,
          source: 'nitrogen-cycle-death',
        });
      }
    }

    return effects;
  },
};
