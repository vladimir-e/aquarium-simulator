/**
 * Nitrogen Cycle System - The biological process that converts toxic ammonia
 * into less harmful nitrate through bacterial action.
 *
 * Three-stage process:
 * 1. Waste -> Ammonia (direct conversion)
 * 2. Ammonia -> Nitrite (via AOB bacteria)
 * 3. Nitrite -> Nitrate (via NOB bacteria)
 *
 * Runs in PASSIVE tier.
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { System } from './types.js';

// ============================================================================
// Constants (calibrated from research on real aquarium cycling)
// ============================================================================

/** Waste to ammonia conversion rate (g waste -> g NH3 per hour) */
export const WASTE_TO_AMMONIA_RATE = 0.1;

/** AOB conversion rate (g NH3 -> g NO2 per bacteria-unit per hour) */
export const AOB_CONVERSION_RATE = 0.00012;

/** NOB conversion rate (g NO2 -> g NO3 per bacteria-unit per hour) */
export const NOB_CONVERSION_RATE = 0.0001;

/** Stoichiometric conversion ratio for NH3 to NO2 */
export const NH3_TO_NO2_RATIO = 2.7;

/** AOB growth rate (~10h doubling time = ln(2)/10h) */
export const AOB_GROWTH_RATE = 0.069;

/** NOB growth rate (~30h doubling time = ln(2)/30h) */
export const NOB_GROWTH_RATE = 0.023;

/** AOB death rate (~58h half-life when starving) */
export const AOB_DEATH_RATE = 0.012;

/** NOB death rate (~46h half-life when starving) */
export const NOB_DEATH_RATE = 0.015;

/** Minimum ammonia (g) to sustain AOB */
export const MIN_FOOD_AOB = 0.001;

/** Minimum nitrite (g) to sustain NOB */
export const MIN_FOOD_NOB = 0.001;

/** Bacteria units per cm² of surface area */
export const BACTERIA_PER_CM2 = 0.0001;

/** Initial AOB seed population (absolute units) */
export const INITIAL_AOB = 0.0001;

/** Initial NOB seed population (absolute units) */
export const INITIAL_NOB = 0.00005;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate max bacteria capacity based on available surface area.
 * Surface area comes from filter media, substrate, hardscape, and tank glass.
 */
export function calculateMaxBacteriaCapacity(surfaceArea: number): number {
  return surfaceArea * BACTERIA_PER_CM2;
}

/**
 * Calculate food availability factor (0-1 scale).
 * Returns 1.0 when food is sufficient, scales down to 0 as food depletes.
 */
export function calculateFoodFactor(currentFood: number, minFood: number): number {
  if (minFood <= 0) return 1.0;
  return Math.min(1.0, currentFood / minFood);
}

/**
 * Calculate capacity factor for logistic growth (0-1 scale).
 * Returns 1.0 when population is 0, decreases to 0 as population approaches max.
 */
export function calculateCapacityFactor(
  population: number,
  maxCapacity: number
): number {
  if (maxCapacity <= 0) return 0;
  return Math.max(0, 1 - population / maxCapacity);
}

/**
 * Calculate waste -> ammonia conversion for this tick.
 * Returns amount of waste consumed.
 */
export function calculateWasteConversion(waste: number): number {
  if (waste <= 0) return 0;

  // Convert waste to ammonia based on rate
  const conversion = waste * WASTE_TO_AMMONIA_RATE;

  // Can't convert more than available
  return Math.min(conversion, waste);
}

/**
 * Calculate ammonia -> nitrite conversion by AOB.
 * Returns amount of ammonia consumed.
 * @param ammonia - ammonia in grams
 * @param aobPopulation - absolute bacteria count (not percentage)
 */
export function calculateAOBConversion(
  ammonia: number,
  aobPopulation: number
): number {
  if (ammonia <= 0 || aobPopulation <= 0) return 0;

  // Conversion rate is proportional to actual bacteria count
  const conversion = AOB_CONVERSION_RATE * aobPopulation;

  // Can't consume more ammonia than available
  return Math.min(conversion, ammonia);
}

/**
 * Calculate nitrite -> nitrate conversion by NOB.
 * Returns amount of nitrite consumed.
 * @param nitrite - nitrite in grams
 * @param nobPopulation - absolute bacteria count (not percentage)
 */
export function calculateNOBConversion(
  nitrite: number,
  nobPopulation: number
): number {
  if (nitrite <= 0 || nobPopulation <= 0) return 0;

  // Conversion rate is proportional to actual bacteria count
  const conversion = NOB_CONVERSION_RATE * nobPopulation;

  // Can't consume more nitrite than available
  return Math.min(conversion, nitrite);
}

/**
 * Calculate net bacteria population change (growth - death).
 * Uses logistic growth model with food dependency.
 * @param population - absolute bacteria count
 * @param food - available food in grams
 * @param minFood - minimum food threshold for sustenance
 * @param growthRate - base growth rate per hour
 * @param deathRate - base death rate per hour
 * @param maxCapacity - maximum bacteria capacity from surface area
 */
export function calculateBacteriaChange(
  population: number,
  food: number,
  minFood: number,
  growthRate: number,
  deathRate: number,
  maxCapacity: number
): number {
  if (population <= 0) return 0;
  if (maxCapacity <= 0) return -population; // All bacteria die if no surface

  // If population exceeds current capacity (surface decreased), bacteria die off
  if (population > maxCapacity) {
    // Immediate die-off to match capacity
    return maxCapacity - population;
  }

  const foodFactor = calculateFoodFactor(food, minFood);
  const capacityFactor = calculateCapacityFactor(population, maxCapacity);

  // Logistic growth when food available and space exists
  const growth = growthRate * foodFactor * capacityFactor * population;

  // Death when food is scarce
  const death = deathRate * (1 - foodFactor) * population;

  return growth - death;
}

// ============================================================================
// Nitrogen Cycle System
// ============================================================================

/**
 * Update nitrogen cycle for one tick.
 * Processes all three stages and bacterial dynamics.
 */
function updateNitrogenCycle(state: SimulationState): Effect[] {
  const effects: Effect[] = [];
  const { resources, passiveResources } = state;

  // Calculate max bacteria capacity from surface area
  const maxCapacity = calculateMaxBacteriaCapacity(passiveResources.surface);

  // ============================================
  // Stage 1: Waste -> Ammonia
  // ============================================
  if (resources.waste > 0) {
    const wasteConverted = calculateWasteConversion(resources.waste);
    if (wasteConverted > 0) {
      const ammoniaProduced = wasteConverted * WASTE_TO_AMMONIA_RATE;

      effects.push({
        tier: 'passive',
        resource: 'waste',
        delta: -wasteConverted,
        source: 'nitrogen-cycle',
      });

      effects.push({
        tier: 'passive',
        resource: 'ammonia',
        delta: ammoniaProduced,
        source: 'nitrogen-cycle',
      });
    }
  }

  // ============================================
  // Stage 2: Ammonia -> Nitrite (AOB)
  // ============================================
  // Use current ammonia + any ammonia that will be produced this tick
  const currentAmmonia = resources.ammonia;
  if (currentAmmonia > 0 && resources.aob > 0) {
    const ammoniaConverted = calculateAOBConversion(
      currentAmmonia,
      resources.aob
    );

    if (ammoniaConverted > 0) {
      effects.push({
        tier: 'passive',
        resource: 'ammonia',
        delta: -ammoniaConverted,
        source: 'aob',
      });

      // Nitrite produced is proportional to ammonia consumed
      const nitriteProduced = ammoniaConverted * NH3_TO_NO2_RATIO;
      effects.push({
        tier: 'passive',
        resource: 'nitrite',
        delta: nitriteProduced,
        source: 'aob',
      });
    }
  }

  // ============================================
  // Stage 3: Nitrite -> Nitrate (NOB)
  // ============================================
  const currentNitrite = resources.nitrite;
  if (currentNitrite > 0 && resources.nob > 0) {
    const nitriteConverted = calculateNOBConversion(
      currentNitrite,
      resources.nob
    );

    if (nitriteConverted > 0) {
      effects.push({
        tier: 'passive',
        resource: 'nitrite',
        delta: -nitriteConverted,
        source: 'nob',
      });

      // Nitrate produced 1:1 with nitrite consumed
      effects.push({
        tier: 'passive',
        resource: 'nitrate',
        delta: nitriteConverted,
        source: 'nob',
      });
    }
  }

  // ============================================
  // Bacterial Population Dynamics
  // ============================================

  // AOB growth/death based on ammonia availability
  const aobChange = calculateBacteriaChange(
    resources.aob,
    resources.ammonia,
    MIN_FOOD_AOB,
    AOB_GROWTH_RATE,
    AOB_DEATH_RATE,
    maxCapacity
  );

  if (aobChange !== 0) {
    effects.push({
      tier: 'passive',
      resource: 'aob',
      delta: aobChange,
      source: 'nitrogen-cycle',
    });
  }

  // NOB growth/death based on nitrite availability
  const nobChange = calculateBacteriaChange(
    resources.nob,
    resources.nitrite,
    MIN_FOOD_NOB,
    NOB_GROWTH_RATE,
    NOB_DEATH_RATE,
    maxCapacity
  );

  if (nobChange !== 0) {
    effects.push({
      tier: 'passive',
      resource: 'nob',
      delta: nobChange,
      source: 'nitrogen-cycle',
    });
  }

  return effects;
}

/**
 * Nitrogen Cycle System - registered in PASSIVE tier
 */
export const nitrogenCycleSystem: System = {
  id: 'nitrogen-cycle',
  tier: 'passive',
  update: updateNitrogenCycle,
};

// ============================================================================
// Utility Functions for Display
// ============================================================================

/**
 * Convert grams to ppm (parts per million) for display.
 * ppm = (grams / liters) * 1000
 */
export function gramsToPpm(grams: number, liters: number): number {
  if (liters <= 0) return 0;
  return (grams / liters) * 1000;
}

/**
 * Convert ppm to grams for calculations.
 * grams = (ppm / 1000) * liters
 */
export function ppmToGrams(ppm: number, liters: number): number {
  return (ppm / 1000) * liters;
}
