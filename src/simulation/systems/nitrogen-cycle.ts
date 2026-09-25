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
 * Concentration (ppm) derived as mass/water where a reading needs one.
 *
 * Stoichiometry: N-mass is conserved across the chain (same number of
 * nitrogen atoms before and after). Compound mass grows with molecular
 * weight: NH3 (17.03) → NO2⁻ (46.01) → NO3⁻ (62.00). So 1 mg NH3
 * oxidised yields 2.702 mg NO2⁻, and 1 mg NO2⁻ oxidised yields 1.348 mg
 * NO3⁻. Equivalently, 0.823 mg of elemental N passes through each step.
 *
 * Both oxidations are aerobic, and pay for themselves in oxygen: 4.57 mg of
 * O2 per mg of nitrogen carried the whole way, three quarters of it spent on
 * the first step. The colonies are as oxygen-limited as they are
 * temperature-limited, NOB the more sensitive of the two, which is why a tank
 * short of oxygen stands nitrite while its ammonia still falls.
 */

import type { Effect } from '../core/effects.js';
import type { Resources, SimulationState } from '../state.js';
import type { System } from './types.js';
import type { TunableConfig } from '../config/index.js';
import {
  AIR_SATURATED_O2,
  type NitrogenCycleConfig,
  nitrogenCycleDefaults,
} from '../config/nitrogen-cycle.js';
import { monodFactor, monodUptake, q10Factor } from '../core/kinetics.js';
import {
  CACO3_PER_NH3_NITRIFIED,
  NH3_TO_NO2_MASS_RATIO,
  NO2_TO_NO3_MASS_RATIO,
  O2_PER_NH3_OXIDIZED,
  O2_PER_NO2_OXIDIZED,
} from '../core/chemistry.js';
import { getPpm } from '../resources/index.js';
import { getPh } from '../core/carbonate.js';

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

/** Unionized NH₃ in the water right now, ppm — the share of total ammonia that poisons. */
export function freeAmmoniaPpm(
  resources: Pick<Resources, 'ammonia' | 'water' | 'temperature' | 'co2' | 'kh'>
): number {
  return (
    getPpm(resources.ammonia, resources.water) *
    unionizedAmmoniaFraction(getPh(resources), resources.temperature)
  );
}

/**
 * How fast nitrifiers live at this temperature, against the reference their
 * rates are quoted at.
 *
 * Applies to all three of a colony's rates — oxidation, growth and maintenance
 * — because they are one metabolism. The visible consequence is that a cold
 * tank needs a larger colony to clear the same load and takes longer to build
 * it, while the utilization the colony rests at does not move.
 */
export function nitrificationFactor(
  temperature: number,
  config: NitrogenCycleConfig = nitrogenCycleDefaults
): number {
  return q10Factor(temperature, config.q10, config.referenceTemp);
}

/**
 * How fast a nitrifier colony works at this oxygen level, against the
 * saturating water its rates are quoted in.
 *
 * Scales oxidation and growth alike — a colony cannot divide on a reaction it
 * cannot run — but not maintenance decay, which is what makes an anoxic tank
 * lose its biofilter rather than merely pause it.
 */
export function nitrifierOxygenFactor(
  stage: 'aob' | 'nob',
  oxygen: number,
  config: NitrogenCycleConfig = nitrogenCycleDefaults
): number {
  return monodFactor(
    oxygen,
    stage === 'aob' ? config.aobOxygenHalfSaturation : config.nobOxygenHalfSaturation
  );
}

/**
 * How much more compound mass a NOB cell puts through than an AOB one.
 *
 * N-mass is conserved across the chain, but compound mass is not — AOB consume
 * NH3 and produce NO2 at `NH3_TO_NO2_MASS_RATIO` ≈ 2.702. On one shared
 * per-bacterium rate NOB could clear only 1 / 2.702 ≈ 37 % of the NO2 mass AOB
 * produce, and nitrite would run away. Scaling by that ratio is what puts the
 * two steps in per-atom N balance at population parity.
 *
 * Both rates are Monod maxima, though, and `bacteriaProcessingRate` is divided
 * back up by *AOB's* factor in air-saturated water. The mass ratio alone would
 * hand NOB that correction on top of their own and leave them 8.4 % under the
 * parity it exists to hold, so the ratio is re-quoted through each guild's own
 * factor: the balance sits in the water both figures were measured in, and
 * below it the K gap opens and nitrite stands. Read off the config rather than
 * frozen at the defaults, so the balance survives a tuned half-saturation
 * constant — and so neutralising both of them reproduces an engine with no
 * oxygen term at all.
 *
 * Biologically legitimate: real NOB (Nitrobacter / Nitrospira) are faster per
 * cell than AOB (Nitrosomonas / Nitrosospira).
 */
export function nobProcessingRateMultiplier(
  config: NitrogenCycleConfig = nitrogenCycleDefaults
): number {
  return (
    (NH3_TO_NO2_MASS_RATIO * nitrifierOxygenFactor('aob', AIR_SATURATED_O2, config)) /
    nitrifierOxygenFactor('nob', AIR_SATURATED_O2, config)
  );
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
 * Nitrifiers settling into the tank each tick, out of the water and the air
 * above it — a trickle that never stops, so a guild is always present and
 * grows the moment it has something to oxidise.
 *
 * Per litre of standing water rather than per cm² of surface, which is also the
 * only form that holds the cycling clock volume-independent: glass area grows
 * with the square of a tank's linear size and filter media is a flat cm² per
 * filter type, so a seed quoted per cm² would hand a nano nearly twice the head
 * start per litre a stock tank gets.
 */
export function calculateSeeding(
  water: number,
  config: NitrogenCycleConfig = nitrogenCycleDefaults
): number {
  return Math.max(0, water) * config.seedingRate;
}

/**
 * A colony's two flows for one tick: gain and maintenance decay.
 *
 * Gain is the seeding trickle plus logistic growth scaled by `utilization` —
 * the share of its processing capacity the colony actually used this tick —
 * and never carries the colony past its surface ceiling.
 *
 * Utilization is dimensionless (consumed / capacity), so per-capita growth reads
 * how hard the colony is working rather than how big it or the tank is.
 *
 * Decay is unconditional. Bacteria do not starve to death the moment a meal
 * ends — they fade over weeks, which is why a tank survives a holiday.
 */
export function calculateColonyFlows(
  population: number,
  utilization: number,
  growthRate: number,
  deathRate: number,
  maxPopulation: number,
  seeding: number
): { growth: number; death: number } {
  const death = population * deathRate;
  if (maxPopulation <= 0) return { growth: 0, death };

  const logistic = population * growthRate * utilization * (1 - population / maxPopulation);
  return {
    growth: Math.max(0, Math.min(population + seeding + logistic, maxPopulation) - population),
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
 * The most NH₃, in mg, an AOB colony can put through in one tick — population ×
 * the throughput of a bacterium × how fast this temperature and this oxygen let
 * it work. What it actually oxidises is a Monod share of this, set by how much
 * ammonia the water holds.
 *
 * A property of the cells and the water they sit in, not of the tank's size:
 * the same colony clears the same mass in 10 L as in 1000 L, which is what
 * makes a ppm reading fall with volume the way it does in a real tank.
 */
export function aobCapacity(
  population: number,
  temperature: number,
  oxygen: number,
  config: NitrogenCycleConfig = nitrogenCycleDefaults
): number {
  return (
    population *
    config.bacteriaProcessingRate *
    nitrificationFactor(temperature, config) *
    nitrifierOxygenFactor('aob', oxygen, config)
  );
}

/**
 * The most NO₂⁻, in mg, a NOB colony can put through in one tick — the same gauge
 * scaled by `nobProcessingRateMultiplier`, which is what keeps the two stages
 * in stoichiometric balance at population parity in air-saturated water.
 * Thinner water is where they part, NOB first.
 *
 * Spelled out rather than composed as `aobCapacity(…) × multiplier`: that
 * reassociates the product and lands on a different float for roughly a third
 * of the (population, temperature) pairs, and the cycling anchors are pinned to
 * this order of operations.
 */
export function nobCapacity(
  population: number,
  temperature: number,
  oxygen: number,
  config: NitrogenCycleConfig = nitrogenCycleDefaults
): number {
  return (
    population *
    config.bacteriaProcessingRate *
    nobProcessingRateMultiplier(config) *
    nitrificationFactor(temperature, config) *
    nitrifierOxygenFactor('nob', oxygen, config)
  );
}

/**
 * Calculate ammonia to nitrite conversion by AOB bacteria.
 *
 * The colony's capacity is a Monod maximum on total ammonia as well as on
 * oxygen: at `aobAmmoniaHalfSaturation` it runs at half of it, so a mature
 * colony holds a trace of ammonia rather than none, and a pulse stands until
 * the colony has worked it down. Nothing is oxidised in a tank with no water.
 *
 * N-mass is conserved; compound mass scales with MW. NO2⁻ produced =
 * NH3 consumed × MW_NO2 / MW_NH3 ≈ 2.702.
 *
 * @returns mg consumed, mg of nitrite produced, mg of O2 and of alkalinity
 *          (as CaCO3) spent, and the fraction of capacity used
 */
export function calculateAmmoniaToNitrite(
  ammoniaMass: number,
  water: number,
  aobPopulation: number,
  temperature: number,
  oxygen: number,
  config: NitrogenCycleConfig = nitrogenCycleDefaults
): {
  ammoniaConsumed: number;
  nitriteProduced: number;
  oxygenConsumedMg: number;
  alkalinityConsumedMg: number;
  utilization: number;
} {
  const capacity = aobCapacity(aobPopulation, temperature, oxygen, config);
  const ammoniaConsumed =
    water > 0 ? monodUptake(ammoniaMass, capacity, config.aobAmmoniaHalfSaturation * water) : 0;
  return {
    ammoniaConsumed,
    nitriteProduced: ammoniaConsumed * NH3_TO_NO2_MASS_RATIO,
    oxygenConsumedMg: ammoniaConsumed * O2_PER_NH3_OXIDIZED,
    alkalinityConsumedMg: ammoniaConsumed * CACO3_PER_NH3_NITRIFIED,
    utilization: capacity > 0 ? ammoniaConsumed / capacity : 0,
  };
}

/**
 * Calculate nitrite to nitrate conversion by NOB bacteria — the same Monod
 * uptake on nitrite at `nobNitriteHalfSaturation`.
 *
 * N-mass is conserved; compound mass scales with MW. NO3⁻ produced =
 * NO2⁻ consumed × MW_NO3 / MW_NO2 ≈ 1.348.
 *
 * @returns mg consumed, mg of nitrate produced, mg of O2 spent, and the
 *          fraction of capacity used
 */
export function calculateNitriteToNitrate(
  nitriteMass: number,
  water: number,
  nobPopulation: number,
  temperature: number,
  oxygen: number,
  config: NitrogenCycleConfig = nitrogenCycleDefaults
): {
  nitriteConsumed: number;
  nitrateProduced: number;
  oxygenConsumedMg: number;
  utilization: number;
} {
  const capacity = nobCapacity(nobPopulation, temperature, oxygen, config);
  const nitriteConsumed =
    water > 0 ? monodUptake(nitriteMass, capacity, config.nobNitriteHalfSaturation * water) : 0;
  return {
    nitriteConsumed,
    nitrateProduced: nitriteConsumed * NO2_TO_NO3_MASS_RATIO,
    oxygenConsumedMg: nitriteConsumed * O2_PER_NO2_OXIDIZED,
    utilization: capacity > 0 ? nitriteConsumed / capacity : 0,
  };
}

// ============================================================================
// System Implementation
// ============================================================================

/** A colony's per-cell growth and maintenance-decay rates at this temperature and oxygen. */
export function colonyRates(
  stage: 'aob' | 'nob',
  temperature: number,
  oxygen: number,
  config: NitrogenCycleConfig = nitrogenCycleDefaults
): { growthRate: number; deathRate: number } {
  const temperatureFactor = nitrificationFactor(temperature, config);
  return {
    growthRate:
      (stage === 'aob' ? config.aobGrowthRate : config.nobGrowthRate) *
      temperatureFactor *
      nitrifierOxygenFactor(stage, oxygen, config),
    deathRate: config.bacteriaDeathRate * temperatureFactor,
  };
}

/**
 * The population a colony settles at on a steady supply of its substrate, mg a
 * tick: where the logistic growth that supply's utilization drives meets
 * maintenance decay. The seeding trickle is left out — it is orders of
 * magnitude under either flow at any colony that is doing work.
 */
export function restingColony(
  stage: 'aob' | 'nob',
  supply: number,
  temperature: number,
  oxygen: number,
  maxPopulation: number,
  config: NitrogenCycleConfig = nitrogenCycleDefaults
): number {
  if (supply <= 0 || maxPopulation <= 0) return 0;
  const capacity = stage === 'aob' ? aobCapacity : nobCapacity;
  const capacityPerCell = capacity(1, temperature, oxygen, config);
  const { growthRate, deathRate } = colonyRates(stage, temperature, oxygen, config);
  const unbounded = (supply * growthRate) / (capacityPerCell * deathRate);
  return unbounded / (1 + unbounded / maxPopulation);
}

function colonyEffects(
  resource: 'aob' | 'nob',
  population: number,
  utilization: number,
  temperature: number,
  oxygen: number,
  maxPopulation: number,
  seeding: number,
  config: NitrogenCycleConfig
): Effect[] {
  const { growthRate, deathRate } = colonyRates(resource, temperature, oxygen, config);
  const { growth, death } = calculateColonyFlows(
    population,
    utilization,
    growthRate,
    deathRate,
    maxPopulation,
    seeding
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
    const temperature = resources.temperature;
    const oxygen = resources.oxygen;

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
    const aobStage = calculateAmmoniaToNitrite(
      currentAmmonia,
      waterVolume,
      currentAob,
      temperature,
      oxygen,
      ncConfig
    );
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

      // Oxygen is the one resource here stored as a concentration.
      effects.push({
        tier: 'passive',
        resource: 'oxygen',
        delta: -getPpm(aobStage.oxygenConsumedMg, waterVolume),
        source: 'nitrogen-cycle-aob',
      });

      effects.push({
        tier: 'passive',
        resource: 'kh',
        delta: -aobStage.alkalinityConsumedMg,
        source: 'nitrogen-cycle-aob',
      });
    }

    // ========================================================================
    // Stage 3: Nitrite → Nitrate (NOB Bacteria)
    // Processes nitrite mass (mg), produces nitrate mass (mg).
    // N-mass is conserved; compound mass grows by MW_NO3 / MW_NO2 ≈ 1.348.
    // ========================================================================
    const nobStage = calculateNitriteToNitrate(
      currentNitrite,
      waterVolume,
      currentNob,
      temperature,
      oxygen,
      ncConfig
    );
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

      effects.push({
        tier: 'passive',
        resource: 'oxygen',
        delta: -getPpm(nobStage.oxygenConsumedMg, waterVolume),
        source: 'nitrogen-cycle-nob',
      });
    }

    // ========================================================================
    // Bacterial Dynamics: Seeding, growth and maintenance decay
    // ========================================================================
    const seeding = calculateSeeding(waterVolume, ncConfig);
    effects.push(
      ...colonyEffects(
        'aob',
        currentAob,
        aobStage.utilization,
        temperature,
        oxygen,
        maxBacteria,
        seeding,
        ncConfig
      ),
      ...colonyEffects(
        'nob',
        currentNob,
        nobStage.utilization,
        temperature,
        oxygen,
        maxBacteria,
        seeding,
        ncConfig
      )
    );

    return effects;
  },
};
