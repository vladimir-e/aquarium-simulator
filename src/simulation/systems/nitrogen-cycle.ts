/**
 * Nitrogen Cycle System
 *
 * Models the biological nitrogen cycle that converts toxic ammonia into less harmful nitrate.
 * Three-stage process:
 * 1. Waste → Ammonia (direct conversion)
 * 2. Ammonia → Nitrite (via AOB bacteria)
 * 3. Nitrite → Nitrate (via NOB bacteria)
 *
 * Bacterial populations grow based on food availability and surface area constraints.
 */

import type { Effect } from '../core/effects.js';
import type { Resources, SimulationState } from '../state.js';
import type { System } from './types.js';

// ============================================================================
// Constants (calibrated for 25-day cycling test with 40L tank + 1g food)
// ============================================================================

// Waste → Ammonia conversion
/** Maximum waste converted per hour (g) - limits conversion rate */
export const MAX_WASTE_CONVERSION_PER_HOUR = 0.1;
/** Fraction of waste mass that becomes ammonia (g ammonia / g waste) */
export const WASTE_TO_AMMONIA_FACTOR = 0.15;

// Chemical conversion ratios
/** Stoichiometric ratio: NH3 → NO2 produces more nitrite by mass */
export const NH3_TO_NO2_RATIO = 2.7;
/** Stoichiometric ratio: NO2 → NO3 (approximately 1:1 by mass) */
export const NO2_TO_NO3_RATIO = 1.0;

// Bacterial conversion rates
/** ppm ammonia processed per bacteria unit per hour */
export const AOB_CONVERSION_RATE = 0.05;
/** ppm nitrite processed per bacteria unit per hour */
export const NOB_CONVERSION_RATE = 0.05;

// Bacterial dynamics
/** Hours for bacteria population to double when well-fed */
export const BACTERIA_DOUBLING_TIME = 24;
/** Growth rate derived from doubling time (ln(2)/24 ≈ 0.029) */
export const BACTERIA_GROWTH_RATE = Math.log(2) / BACTERIA_DOUBLING_TIME;
/** Days bacteria survives without food */
export const BACTERIA_STARVATION_DAYS = 5;
/** Death rate when starving (1/(5*24) ≈ 0.0083 per hour) */
export const BACTERIA_DEATH_RATE = 1 / (BACTERIA_STARVATION_DAYS * 24);

// Food thresholds (ppm)
/** Minimum ammonia to sustain AOB (below this = starvation) */
export const MIN_FOOD_AOB = 0.01;
/** Minimum nitrite to sustain NOB (below this = starvation) */
export const MIN_FOOD_NOB = 0.01;
/** Ammonia threshold for AOB to spawn (bacteria omnipresent in nature) */
export const SPAWN_THRESHOLD_AOB = 0.5;
/** Nitrite threshold for NOB to spawn */
export const SPAWN_THRESHOLD_NOB = 0.5;
/** Initial bacteria population when spawning */
export const INITIAL_BACTERIA_SPAWN = 0.01;

// Surface area → bacteria capacity
/** Bacteria units per cm² of surface area */
export const BACTERIA_PER_CM2 = 0.001;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate maximum bacteria capacity based on available surface area.
 */
export function calculateMaxBacteriaCapacity(surfaceArea: number): number {
  return surfaceArea * BACTERIA_PER_CM2;
}

/**
 * Convert waste (grams) to ammonia (ppm) based on water volume.
 * @param wasteGrams - Amount of waste to convert (grams)
 * @param waterLiters - Tank water volume (liters)
 * @returns Ammonia produced in ppm
 */
export function wasteToAmmoniaPPM(wasteGrams: number, waterLiters: number): number {
  if (wasteGrams <= 0 || waterLiters <= 0) return 0;
  // waste (g) → ammonia (g) → mg → ppm
  const ammoniaGrams = wasteGrams * WASTE_TO_AMMONIA_FACTOR;
  const ammoniaMg = ammoniaGrams * 1000;
  return ammoniaMg / waterLiters;
}

/**
 * Calculate bacterial growth rate with food and capacity factors.
 * Uses logistic growth: slows as population approaches capacity.
 */
export function calculateBacteriaGrowth(
  population: number,
  foodLevel: number,
  minFood: number,
  maxCapacity: number
): number {
  if (population <= 0 || foodLevel < minFood || population >= maxCapacity) {
    return 0;
  }

  // Food factor: more food = faster growth (capped at 1.0)
  const foodFactor = Math.min(1.0, foodLevel / minFood);

  // Capacity factor: logistic growth slows near capacity
  const capacityFactor = (maxCapacity - population) / maxCapacity;

  return BACTERIA_GROWTH_RATE * foodFactor * capacityFactor * population;
}

/**
 * Calculate bacterial death rate when food is scarce.
 */
export function calculateBacteriaDeath(
  population: number,
  foodLevel: number,
  minFood: number
): number {
  if (population <= 0 || foodLevel >= minFood) {
    return 0;
  }
  return BACTERIA_DEATH_RATE * population;
}

// ============================================================================
// Stage Processors
// ============================================================================

/**
 * Stage 1: Waste → Ammonia conversion
 */
function convertWasteToAmmonia(resources: Resources): Effect[] {
  if (resources.waste <= 0) return [];

  const wasteToConvert = Math.min(resources.waste, MAX_WASTE_CONVERSION_PER_HOUR);
  const ammoniaPPM = wasteToAmmoniaPPM(wasteToConvert, resources.water);

  if (ammoniaPPM <= 0) return [];

  return [
    { tier: 'passive', resource: 'waste', delta: -wasteToConvert, source: 'nitrogen-cycle' },
    { tier: 'passive', resource: 'ammonia', delta: ammoniaPPM, source: 'nitrogen-cycle' },
  ];
}

/**
 * Bacteria spawning when food threshold reached.
 * Models omnipresent bacteria colonizing when conditions allow.
 */
function spawnBacteria(resources: Resources): Effect[] {
  const effects: Effect[] = [];

  // Spawn AOB when ammonia reaches threshold
  if (resources.aob === 0 && resources.ammonia >= SPAWN_THRESHOLD_AOB) {
    effects.push({
      tier: 'passive',
      resource: 'aob',
      delta: INITIAL_BACTERIA_SPAWN,
      source: 'nitrogen-cycle',
    });
  }

  // Spawn NOB when nitrite reaches threshold
  if (resources.nob === 0 && resources.nitrite >= SPAWN_THRESHOLD_NOB) {
    effects.push({
      tier: 'passive',
      resource: 'nob',
      delta: INITIAL_BACTERIA_SPAWN,
      source: 'nitrogen-cycle',
    });
  }

  return effects;
}

/**
 * Stage 2: AOB convert ammonia → nitrite
 */
function processAOB(resources: Resources): Effect[] {
  if (resources.aob <= 0 || resources.ammonia <= 0) return [];

  // How much ammonia can AOB process this hour?
  const maxProcessing = resources.aob * AOB_CONVERSION_RATE;
  const ammoniaProcessed = Math.min(resources.ammonia, maxProcessing);

  if (ammoniaProcessed <= 0) return [];

  const nitriteProduced = ammoniaProcessed * NH3_TO_NO2_RATIO;

  return [
    { tier: 'passive', resource: 'ammonia', delta: -ammoniaProcessed, source: 'aob' },
    { tier: 'passive', resource: 'nitrite', delta: nitriteProduced, source: 'aob' },
  ];
}

/**
 * Stage 3: NOB convert nitrite → nitrate
 */
function processNOB(resources: Resources): Effect[] {
  if (resources.nob <= 0 || resources.nitrite <= 0) return [];

  // How much nitrite can NOB process this hour?
  const maxProcessing = resources.nob * NOB_CONVERSION_RATE;
  const nitriteProcessed = Math.min(resources.nitrite, maxProcessing);

  if (nitriteProcessed <= 0) return [];

  const nitrateProduced = nitriteProcessed * NO2_TO_NO3_RATIO;

  return [
    { tier: 'passive', resource: 'nitrite', delta: -nitriteProcessed, source: 'nob' },
    { tier: 'passive', resource: 'nitrate', delta: nitrateProduced, source: 'nob' },
  ];
}

/**
 * Update bacterial population (growth and death).
 */
function updateBacterialPopulation(resources: Resources, maxCapacity: number): Effect[] {
  const effects: Effect[] = [];

  // AOB growth/death
  if (resources.aob > 0) {
    if (resources.ammonia >= MIN_FOOD_AOB && resources.aob < maxCapacity) {
      // Growth (doubles daily when well-fed)
      const growth = calculateBacteriaGrowth(
        resources.aob,
        resources.ammonia,
        MIN_FOOD_AOB,
        maxCapacity
      );
      if (growth > 0) {
        effects.push({ tier: 'passive', resource: 'aob', delta: growth, source: 'nitrogen-cycle' });
      }
    } else if (resources.ammonia < MIN_FOOD_AOB) {
      // Death (starves slowly over days)
      const death = calculateBacteriaDeath(resources.aob, resources.ammonia, MIN_FOOD_AOB);
      if (death > 0) {
        effects.push({
          tier: 'passive',
          resource: 'aob',
          delta: -death,
          source: 'nitrogen-cycle',
        });
      }
    }
  }

  // NOB growth/death (same pattern)
  if (resources.nob > 0) {
    if (resources.nitrite >= MIN_FOOD_NOB && resources.nob < maxCapacity) {
      const growth = calculateBacteriaGrowth(
        resources.nob,
        resources.nitrite,
        MIN_FOOD_NOB,
        maxCapacity
      );
      if (growth > 0) {
        effects.push({ tier: 'passive', resource: 'nob', delta: growth, source: 'nitrogen-cycle' });
      }
    } else if (resources.nitrite < MIN_FOOD_NOB) {
      const death = calculateBacteriaDeath(resources.nob, resources.nitrite, MIN_FOOD_NOB);
      if (death > 0) {
        effects.push({
          tier: 'passive',
          resource: 'nob',
          delta: -death,
          source: 'nitrogen-cycle',
        });
      }
    }
  }

  return effects;
}

/**
 * Cap bacteria to surface area capacity.
 * When surface area decreases (e.g., filter removed), bacteria die off immediately.
 */
function capBacteriaToSurface(resources: Resources, maxCapacity: number): Effect[] {
  const effects: Effect[] = [];

  if (resources.aob > maxCapacity) {
    effects.push({
      tier: 'passive',
      resource: 'aob',
      delta: maxCapacity - resources.aob,
      source: 'nitrogen-cycle',
    });
  }

  if (resources.nob > maxCapacity) {
    effects.push({
      tier: 'passive',
      resource: 'nob',
      delta: maxCapacity - resources.nob,
      source: 'nitrogen-cycle',
    });
  }

  return effects;
}

// ============================================================================
// Main System
// ============================================================================

/**
 * Update nitrogen cycle for one tick.
 * Processes all stages and bacterial dynamics.
 */
export function updateNitrogenCycle(state: SimulationState): Effect[] {
  const effects: Effect[] = [];
  const { resources } = state;
  const maxCapacity = calculateMaxBacteriaCapacity(resources.surface);

  // 1. Waste → Ammonia conversion
  effects.push(...convertWasteToAmmonia(resources));

  // 2. Bacteria spawning (if needed)
  effects.push(...spawnBacteria(resources));

  // 3. AOB: Ammonia → Nitrite conversion
  effects.push(...processAOB(resources));

  // 4. NOB: Nitrite → Nitrate conversion
  effects.push(...processNOB(resources));

  // 5. Bacterial growth/death
  effects.push(...updateBacterialPopulation(resources, maxCapacity));

  // 6. Cap bacteria to surface capacity
  effects.push(...capBacteriaToSurface(resources, maxCapacity));

  return effects;
}

/**
 * Nitrogen Cycle System
 *
 * Runs in PASSIVE tier, processing waste decomposition and bacterial dynamics.
 */
export const nitrogenCycleSystem: System = {
  id: 'nitrogen-cycle',
  tier: 'passive',
  update: updateNitrogenCycle,
};
