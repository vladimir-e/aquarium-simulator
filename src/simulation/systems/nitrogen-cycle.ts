/**
 * Nitrogen Cycle System - biological conversion of waste to ammonia to nitrite to nitrate.
 * Runs in PASSIVE tier.
 *
 * Three stages:
 * 1. Waste → Ammonia (mineralization)
 * 2. Ammonia → Nitrite (AOB bacteria)
 * 3. Nitrite → Nitrate (NOB bacteria)
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { System } from './types.js';

// ============================================================================
// Constants
// ============================================================================

// Waste → Ammonia conversion
/** Fraction of waste converted to ammonia per tick */
export const WASTE_CONVERSION_RATE = 0.3;

// Bacterial processing rates
/** ppm processed per bacteria unit per tick */
export const BACTERIA_PROCESSING_RATE = 0.002;

// Spawning
/** ppm ammonia to trigger AOB spawn */
export const AOB_SPAWN_THRESHOLD = 0.5;
/** ppm nitrite to trigger NOB spawn */
export const NOB_SPAWN_THRESHOLD = 0.5;
/** Initial bacteria when spawning */
export const SPAWN_AMOUNT = 10;

// Growth (logistic)
/** AOB growth rate per tick (~doubles per day) */
export const AOB_GROWTH_RATE = 0.03;
/** NOB growth rate per tick (slower than AOB) */
export const NOB_GROWTH_RATE = 0.025;
/** Max bacteria per cm² surface */
export const BACTERIA_PER_CM2 = 0.1;

// Death
/** Fraction of bacteria that die per tick without food */
export const BACTERIA_DEATH_RATE = 0.02;
/** Min ammonia to sustain AOB */
export const AOB_FOOD_THRESHOLD = 0.01;
/** Min nitrite to sustain NOB */
export const NOB_FOOD_THRESHOLD = 0.01;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate maximum bacteria population based on surface area.
 */
export function calculateMaxBacteria(surface: number): number {
  return surface * BACTERIA_PER_CM2;
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
 * Returns [wasteConsumed, ammoniaProduced]
 */
export function calculateWasteToAmmonia(
  waste: number,
  waterVolume: number
): { wasteConsumed: number; ammoniaProduced: number } {
  if (waste <= 0 || waterVolume <= 0) {
    return { wasteConsumed: 0, ammoniaProduced: 0 };
  }

  const wasteConsumed = waste * WASTE_CONVERSION_RATE;
  // ammonia_per_gram = 1.0 / water_volume (ppm per gram)
  const ammoniaProduced = wasteConsumed * (1.0 / waterVolume);

  return { wasteConsumed, ammoniaProduced };
}

/**
 * Calculate ammonia to nitrite conversion by AOB bacteria.
 * Returns amount of ammonia processed (1:1 conversion to nitrite).
 */
export function calculateAmmoniaToNitrite(
  ammonia: number,
  aobPopulation: number
): number {
  if (ammonia <= 0 || aobPopulation <= 0) return 0;
  // Each bacteria unit processes a fixed amount per tick
  const canProcess = aobPopulation * BACTERIA_PROCESSING_RATE;
  return Math.min(canProcess, ammonia);
}

/**
 * Calculate nitrite to nitrate conversion by NOB bacteria.
 * Returns amount of nitrite processed (1:1 conversion to nitrate).
 */
export function calculateNitriteToNitrate(
  nitrite: number,
  nobPopulation: number
): number {
  if (nitrite <= 0 || nobPopulation <= 0) return 0;
  // Each bacteria unit processes a fixed amount per tick
  const canProcess = nobPopulation * BACTERIA_PROCESSING_RATE;
  return Math.min(canProcess, nitrite);
}

// ============================================================================
// System Implementation
// ============================================================================

export const nitrogenCycleSystem: System = {
  id: 'nitrogen-cycle',
  tier: 'passive',

  update(state: SimulationState): Effect[] {
    const effects: Effect[] = [];
    const { resources } = state;
    const maxBacteria = calculateMaxBacteria(resources.surface);

    // Track current values for calculations (effects accumulate)
    let currentWaste = resources.waste;
    let currentAmmonia = resources.ammonia;
    let currentNitrite = resources.nitrite;
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
    // ========================================================================
    if (currentWaste > 0) {
      const { wasteConsumed, ammoniaProduced } = calculateWasteToAmmonia(
        currentWaste,
        resources.water
      );

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
          delta: ammoniaProduced,
          source: 'nitrogen-cycle-mineralization',
        });
        currentAmmonia += ammoniaProduced;
      }
    }

    // ========================================================================
    // Stage 2: Ammonia → Nitrite (AOB Bacteria)
    // ========================================================================
    if (currentAob > 0 && currentAmmonia > 0) {
      const ammoniaProcessed = calculateAmmoniaToNitrite(currentAmmonia, currentAob);

      if (ammoniaProcessed > 0) {
        effects.push({
          tier: 'passive',
          resource: 'ammonia',
          delta: -ammoniaProcessed,
          source: 'nitrogen-cycle-aob',
        });
        currentAmmonia -= ammoniaProcessed;

        effects.push({
          tier: 'passive',
          resource: 'nitrite',
          delta: ammoniaProcessed, // 1:1 conversion
          source: 'nitrogen-cycle-aob',
        });
        currentNitrite += ammoniaProcessed;
      }
    }

    // ========================================================================
    // Stage 3: Nitrite → Nitrate (NOB Bacteria)
    // ========================================================================
    if (currentNob > 0 && currentNitrite > 0) {
      const nitriteProcessed = calculateNitriteToNitrate(currentNitrite, currentNob);

      if (nitriteProcessed > 0) {
        effects.push({
          tier: 'passive',
          resource: 'nitrite',
          delta: -nitriteProcessed,
          source: 'nitrogen-cycle-nob',
        });
        currentNitrite -= nitriteProcessed;

        effects.push({
          tier: 'passive',
          resource: 'nitrate',
          delta: nitriteProcessed, // 1:1 conversion
          source: 'nitrogen-cycle-nob',
        });
      }
    }

    // ========================================================================
    // Bacterial Dynamics: Spawning
    // ========================================================================
    // AOB spawns when ammonia reaches threshold and population is zero
    if (currentAob === 0 && currentAmmonia >= AOB_SPAWN_THRESHOLD) {
      effects.push({
        tier: 'passive',
        resource: 'aob',
        delta: SPAWN_AMOUNT,
        source: 'nitrogen-cycle-spawn',
      });
      currentAob = SPAWN_AMOUNT;
    }

    // NOB spawns when nitrite reaches threshold and population is zero
    if (currentNob === 0 && currentNitrite >= NOB_SPAWN_THRESHOLD) {
      effects.push({
        tier: 'passive',
        resource: 'nob',
        delta: SPAWN_AMOUNT,
        source: 'nitrogen-cycle-spawn',
      });
      currentNob = SPAWN_AMOUNT;
    }

    // ========================================================================
    // Bacterial Dynamics: Growth
    // ========================================================================
    // AOB grows if ammonia available
    if (currentAob > 0 && currentAmmonia >= AOB_FOOD_THRESHOLD) {
      const aobGrowth = calculateBacterialGrowth(currentAob, AOB_GROWTH_RATE, maxBacteria);
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

    // NOB grows if nitrite available
    if (currentNob > 0 && currentNitrite >= NOB_FOOD_THRESHOLD) {
      const nobGrowth = calculateBacterialGrowth(currentNob, NOB_GROWTH_RATE, maxBacteria);
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
    // Bacterial Dynamics: Death
    // ========================================================================
    // AOB dies if ammonia is scarce
    if (currentAob > 0 && currentAmmonia < AOB_FOOD_THRESHOLD) {
      const aobDeath = currentAob * BACTERIA_DEATH_RATE;
      if (aobDeath > 0) {
        effects.push({
          tier: 'passive',
          resource: 'aob',
          delta: -aobDeath,
          source: 'nitrogen-cycle-death',
        });
      }
    }

    // NOB dies if nitrite is scarce
    if (currentNob > 0 && currentNitrite < NOB_FOOD_THRESHOLD) {
      const nobDeath = currentNob * BACTERIA_DEATH_RATE;
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
