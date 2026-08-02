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
 *
 * Stoichiometry: N-mass is conserved across the chain (same number of
 * nitrogen atoms before and after). Compound mass grows with molecular
 * weight: NH3 (17.03) → NO2⁻ (46.01) → NO3⁻ (62.00). So 1 mg NH3
 * oxidised yields 2.702 mg NO2⁻, and 1 mg NO2⁻ oxidised yields 1.348 mg
 * NO3⁻. Equivalently, 0.823 mg of elemental N passes through each step.
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { System } from './types.js';
import type { TunableConfig } from '../config/index.js';
import { type NitrogenCycleConfig, nitrogenCycleDefaults } from '../config/nitrogen-cycle.js';
import { getPpm } from '../resources/index.js';

// Molecular weights (g/mol) — physics constants, not tunable config.
/** Elemental nitrogen. */
export const MW_N = 14.01;
/** Ammonia. */
export const MW_NH3 = 17.03;
/** Nitrite (NO2⁻). */
export const MW_NO2 = 46.01;
/** Nitrate (NO3⁻). */
export const MW_NO3 = 62.0;

/** Mass of NH3 produced per unit mass of N (going from N-mass to compound mass). ≈ 1.216. */
export const N_TO_NH3_MASS_RATIO = MW_NH3 / MW_N;
/** Mass of NO2⁻ produced per mg of NH3 oxidised. ≈ 2.702. */
export const NH3_TO_NO2_MASS_RATIO = MW_NO2 / MW_NH3;
/** Mass of NO3⁻ produced per mg of NO2⁻ oxidised. ≈ 1.348. */
export const NO2_TO_NO3_MASS_RATIO = MW_NO3 / MW_NO2;

/**
 * NOB per-bacterium processing rate multiplier relative to AOB.
 *
 * N-mass is conserved across the chain, but compound mass is not — AOB
 * consume NH3 and produce NO2 with a mass gain of MW_NO2 / MW_NH3 ≈ 2.702.
 * If AOB and NOB had the same per-bacterium "compound mass processed per
 * tick" rate, NOB could clear only 1 / 2.702 ≈ 37 % of the NO2 mass AOB
 * produce, and nitrite would run away.
 *
 * Scaling NOB's effective rate by MW_NO2 / MW_NH3 keeps per-atom N
 * throughput equal between the two steps — i.e. at population parity the
 * NO3 produced per tick equals the NH3 consumed per tick in N-atom terms.
 *
 * Biologically legitimate: real NOB (Nitrobacter / Nitrospira) are
 * faster per cell than AOB (Nitrosomonas / Nitrosospira). The engine
 * exposes a single `bacteriaProcessingRate` knob as the AOB baseline;
 * NOB inherits `rate × multiplier`.
 */
export const NOB_PROCESSING_RATE_MULTIPLIER = MW_NO2 / MW_NH3;

/**
 * Fraction of total ammonia (TAN = NH3 + NH4⁺) that exists as unionized
 * NH3 at the given pH and temperature. The unionized form is what
 * actually crosses gills and poisons fish; NH4⁺ is one to two orders
 * of magnitude less toxic.
 *
 * Emerson et al. (1975): pKa = 0.09018 + 2729.92 / T_K.
 *   f_NH3 = 1 / (1 + 10^(pKa - pH))
 *
 * Physics constant, not tunable — this is chemistry. Reference values
 * at 25 °C: pH 6.5 → 0.18 %; pH 7.0 → 0.56 %; pH 7.5 → 1.77 %;
 * pH 8.0 → 5.37 %; pH 8.5 → 15.3 %. A tank running at pH 6.5 carries
 * ~30× less toxic NH3 than the same TAN at pH 8.0.
 */
export function unionizedAmmoniaFraction(ph: number, temperatureC: number): number {
  const tempK = temperatureC + 273.15;
  const pKa = 0.09018 + 2729.92 / tempK;
  return 1 / (1 + Math.pow(10, pKa - ph));
}

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
 * A colony's two flows for one tick: growth and maintenance decay.
 *
 * Growth is the logistic form scaled by `utilization` — the share of its
 * processing capacity the colony actually used this tick.
 *
 * Utilization is dimensionless (consumed / capacity) and that is load-bearing:
 * capacity carries the tank's litres, so the ratio cancels them and per-capita
 * growth is the same in a nano and in a 150 L.
 *
 * Decay is unconditional. Bacteria do not starve to death the moment a meal
 * ends — they fade over weeks, which is why a tank survives a holiday.
 */
export function calculateColonyFlows(
  population: number,
  utilization: number,
  growthRate: number,
  deathRate: number,
  maxPopulation: number
): { growth: number; death: number } {
  if (population <= 0) return { growth: 0, death: 0 };

  const death = population * deathRate;
  if (maxPopulation <= 0) return { growth: 0, death };

  const logistic = population * growthRate * utilization * (1 - population / maxPopulation);
  return {
    growth: Math.max(0, Math.min(population + logistic, maxPopulation) - population),
    death,
  };
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
 *
 * N-mass is conserved; compound mass scales with MW. NO2⁻ produced =
 * NH3 consumed × MW_NO2 / MW_NH3 ≈ 2.702.
 *
 * @param ammoniaMass - Current ammonia mass in mg
 * @param aobPopulation - AOB bacteria population
 * @param waterVolume - Water volume in liters (needed to calculate processing capacity)
 * @returns mg consumed, mg of nitrite produced, and the fraction of capacity used
 */
export function calculateAmmoniaToNitrite(
  ammoniaMass: number,
  aobPopulation: number,
  waterVolume: number,
  config: NitrogenCycleConfig = nitrogenCycleDefaults
): { ammoniaConsumed: number; nitriteProduced: number; utilization: number } {
  if (ammoniaMass <= 0 || aobPopulation <= 0 || waterVolume <= 0) {
    return { ammoniaConsumed: 0, nitriteProduced: 0, utilization: 0 };
  }
  // Processing rate is defined per ppm, multiply by water to get mass capacity
  const canProcessMass = aobPopulation * config.bacteriaProcessingRate * waterVolume;
  const ammoniaConsumed = Math.min(canProcessMass, ammoniaMass);
  return {
    ammoniaConsumed,
    nitriteProduced: ammoniaConsumed * NH3_TO_NO2_MASS_RATIO,
    utilization: canProcessMass > 0 ? ammoniaConsumed / canProcessMass : 0,
  };
}

/**
 * Calculate nitrite to nitrate conversion by NOB bacteria.
 *
 * N-mass is conserved; compound mass scales with MW. NO3⁻ produced =
 * NO2⁻ consumed × MW_NO3 / MW_NO2 ≈ 1.348.
 *
 * NOB's per-bacterium throughput is scaled by
 * `NOB_PROCESSING_RATE_MULTIPLIER` relative to AOB so the two steps are
 * in stoichiometric balance at population parity — see that constant's
 * docstring.
 *
 * @param nitriteMass - Current nitrite mass in mg
 * @param nobPopulation - NOB bacteria population
 * @param waterVolume - Water volume in liters (needed to calculate processing capacity)
 * @returns mg consumed, mg of nitrate produced, and the fraction of capacity used
 */
export function calculateNitriteToNitrate(
  nitriteMass: number,
  nobPopulation: number,
  waterVolume: number,
  config: NitrogenCycleConfig = nitrogenCycleDefaults
): { nitriteConsumed: number; nitrateProduced: number; utilization: number } {
  if (nitriteMass <= 0 || nobPopulation <= 0 || waterVolume <= 0) {
    return { nitriteConsumed: 0, nitrateProduced: 0, utilization: 0 };
  }
  // Processing rate is defined per ppm, multiply by water to get mass capacity.
  // NOB runs at `rate × NOB_PROCESSING_RATE_MULTIPLIER` to match AOB's
  // compound-mass output (MW_NO2 / MW_NH3 heavier than NH3 consumed).
  const canProcessMass =
    nobPopulation *
    config.bacteriaProcessingRate *
    NOB_PROCESSING_RATE_MULTIPLIER *
    waterVolume;
  const nitriteConsumed = Math.min(canProcessMass, nitriteMass);
  return {
    nitriteConsumed,
    nitrateProduced: nitriteConsumed * NO2_TO_NO3_MASS_RATIO,
    utilization: canProcessMass > 0 ? nitriteConsumed / canProcessMass : 0,
  };
}

// ============================================================================
// System Implementation
// ============================================================================

function colonyEffects(
  resource: 'aob' | 'nob',
  population: number,
  utilization: number,
  maxPopulation: number,
  config: NitrogenCycleConfig
): Effect[] {
  const { growth, death } = calculateColonyFlows(
    population,
    utilization,
    resource === 'aob' ? config.aobGrowthRate : config.nobGrowthRate,
    config.bacteriaDeathRate,
    maxPopulation
  );

  const effects: Effect[] = [];
  if (growth > 0) {
    effects.push({ tier: 'passive', resource, delta: growth, source: 'nitrogen-cycle-growth' });
  }
  if (death > 0) {
    effects.push({ tier: 'passive', resource, delta: -death, source: 'nitrogen-cycle-death' });
  }
  return effects;
}

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
    // Processes ammonia mass (mg), produces nitrite mass (mg).
    // N-mass is conserved; compound mass grows by MW_NO2 / MW_NH3 ≈ 2.702.
    // ========================================================================
    const aobStage = calculateAmmoniaToNitrite(currentAmmonia, currentAob, waterVolume, ncConfig);
    if (aobStage.ammoniaConsumed > 0) {
      effects.push({
        tier: 'passive',
        resource: 'ammonia',
        delta: -aobStage.ammoniaConsumed, // mg
        source: 'nitrogen-cycle-aob',
      });
      currentAmmonia -= aobStage.ammoniaConsumed;

      effects.push({
        tier: 'passive',
        resource: 'nitrite',
        delta: aobStage.nitriteProduced, // mg, scaled by MW ratio
        source: 'nitrogen-cycle-aob',
      });
      currentNitrite += aobStage.nitriteProduced;
    }

    // ========================================================================
    // Stage 3: Nitrite → Nitrate (NOB Bacteria)
    // Processes nitrite mass (mg), produces nitrate mass (mg).
    // N-mass is conserved; compound mass grows by MW_NO3 / MW_NO2 ≈ 1.348.
    // ========================================================================
    const nobStage = calculateNitriteToNitrate(currentNitrite, currentNob, waterVolume, ncConfig);
    if (nobStage.nitriteConsumed > 0) {
      effects.push({
        tier: 'passive',
        resource: 'nitrite',
        delta: -nobStage.nitriteConsumed, // mg
        source: 'nitrogen-cycle-nob',
      });
      currentNitrite -= nobStage.nitriteConsumed;

      effects.push({
        tier: 'passive',
        resource: 'nitrate',
        delta: nobStage.nitrateProduced, // mg, scaled by MW ratio
        source: 'nitrogen-cycle-nob',
      });
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
    // Bacterial Dynamics: Growth and maintenance decay
    // ========================================================================
    effects.push(
      ...colonyEffects('aob', currentAob, aobStage.utilization, maxBacteria, ncConfig),
      ...colonyEffects('nob', currentNob, nobStage.utilization, maxBacteria, ncConfig)
    );

    return effects;
  },
};
