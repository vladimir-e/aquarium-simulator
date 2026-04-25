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
 * - Temperature, pH, free NH3, nitrite, nitrate, hunger, oxygen,
 *   water level, flow.
 *
 * Benefits, summing to ≈ 1.0 %/h in a bare tank with everything in
 * range, and up to ≈ 1.2 %/h with mature planting:
 * - pH in species range — 0.4 %/h
 * - Hunger satisfied (≤ 30, ramped to 0 at hunger 50) — up to 0.3 %/h
 * - Oxygen ≥ 5 mg/L — 0.3 %/h
 * - Plant presence (saturating) — up to 0.2 %/h
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
 * Per-stressor stress contribution (%/hr) for a single fish.
 *
 * Each field is the damage rate that stressor adds to the fish this
 * tick, already scaled by the fish's effective hardiness. The named-
 * field shape is the addressable view UI panels and tests use to
 * index the breakdown by stressor key.
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

const ZERO_BREAKDOWN: StressBreakdown = {
  temperature: 0,
  ph: 0,
  ammonia: 0,
  nitrite: 0,
  nitrate: 0,
  hunger: 0,
  oxygen: 0,
  waterLevel: 0,
  flow: 0,
  total: 0,
};

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

/**
 * Linear-ramp benefit: peak when `value ≤ peakAt`, zero when
 * `value ≥ zeroAt`, linearly interpolated in between. Currently used
 * for hunger (peak when hunger ≤ 30, zero at hunger 50). The ramp
 * direction is fixed because every consumer has so far wanted the
 * "lower is better" shape; if an "ascending ramp" turns up later it
 * can move into vitality.ts alongside `inRangeBenefit`.
 */
function rampBenefit(value: number, zeroAt: number, peakAt: number, peak: number): number {
  if (value >= zeroAt) return 0;
  if (value <= peakAt) return peak;
  return peak * ((zeroAt - value) / (zeroAt - peakAt));
}

/** Peak benefit magnitudes (%/h) — see module-level note for total budget. */
const FISH_BENEFIT_PEAKS = {
  ph: 0.4,
  hunger: 0.3,
  oxygen: 0.3,
  plants: 0.2,
} as const;

/**
 * Plant-presence saturation point. The contribution from each plant is
 * `(size / 100) × (condition / 100)` (units: "full healthy plants"), and
 * the benefit hits its peak once the sum reaches `PLANT_BENEFIT_SAT_POINT`.
 * Three full-grown healthy plants of biomass saturate the benefit;
 * beyond that adding more plants doesn't keep boosting fish vitality,
 * which keeps the surplus economy bounded.
 */
const PLANT_BENEFIT_SAT_POINT = 3.0;

/**
 * Hunger thresholds (%): full benefit at ≤30, zero at the 50% stress
 * line. The 50 mark also activates the hunger stressor — same threshold,
 * continuous transition (lose benefit as you start gaining damage).
 */
const HUNGER_FULL = 30;
const HUNGER_NONE = 50;

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
 * regardless of overplanting — see `PLANT_BENEFIT_SAT_POINT` for the
 * calibration choice.
 */
function plantBenefitAmount(plants: Plant[]): number {
  if (plants.length === 0) return 0;
  let total = 0;
  for (const plant of plants) {
    total += (plant.size / 100) * (plant.condition / 100);
  }
  const saturation = Math.min(1, total / PLANT_BENEFIT_SAT_POINT);
  return FISH_BENEFIT_PEAKS.plants * saturation;
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

  // Nitrate stress (above 40 ppm)
  let nitrateStress = 0;
  const nitratePpm = waterVolume > 0 ? resources.nitrate / waterVolume : (resources.nitrate > 0 ? 100 : 0);
  if (nitratePpm > 40) {
    nitrateStress = config.nitrateStressSeverity * (nitratePpm - 40);
  }

  // Hunger stress (above 50%)
  let hungerStress = 0;
  if (fish.hunger > 50) {
    hungerStress = config.hungerStressSeverity * (fish.hunger - 50);
  }

  // Oxygen stress (below 5 mg/L)
  let oxygenStress = 0;
  if (resources.oxygen < 5) {
    oxygenStress = config.oxygenStressSeverity * (5 - resources.oxygen);
  }

  // Water level stress (below 50% capacity)
  let waterLevelStress = 0;
  const waterPercent = tankCapacity > 0 ? (waterVolume / tankCapacity) * 100 : 100;
  if (waterPercent < 50) {
    waterLevelStress = config.waterLevelStressSeverity * (50 - waterPercent);
  }

  // Flow stress (above species max tolerance)
  let flowStress = 0;
  if (resources.flow > speciesData.maxFlow) {
    flowStress = config.flowStressSeverity * (resources.flow - speciesData.maxFlow);
  }

  return [
    { key: 'temperature', label: 'Temperature', amount: tempStress },
    { key: 'ph', label: 'pH', amount: phStress },
    { key: 'ammonia', label: 'Free NH3', amount: ammoniaStress },
    { key: 'nitrite', label: 'Nitrite', amount: nitriteStress },
    { key: 'nitrate', label: 'Nitrate', amount: nitrateStress },
    { key: 'hunger', label: 'Hunger', amount: hungerStress },
    { key: 'oxygen', label: 'Oxygen', amount: oxygenStress },
    { key: 'waterLevel', label: 'Water level', amount: waterLevelStress },
    { key: 'flow', label: 'Flow', amount: flowStress },
  ];
}

/**
 * Build the benefit list for a fish. All four configured factors are
 * emitted every tick, even when they contribute zero — UI filters; the
 * simulation doesn't have to.
 */
function buildBenefits(ctx: FishFactorContext): VitalityFactor[] {
  const { fish, resources, plants } = ctx;
  const speciesData = FISH_SPECIES_DATA[fish.species];
  const [phMin, phMax] = speciesData.phRange;

  return [
    {
      key: 'ph',
      label: 'pH',
      amount: inRangeBenefit(resources.ph, phMin, phMax, FISH_BENEFIT_PEAKS.ph),
    },
    {
      key: 'hunger',
      label: 'Well-fed',
      amount: rampBenefit(fish.hunger, HUNGER_NONE, HUNGER_FULL, FISH_BENEFIT_PEAKS.hunger),
    },
    {
      // Oxygen ≥ 5 mg/L is the stressor's safe side; the benefit is a
      // one-sided "above threshold" peak (`hi = Infinity`) tying directly
      // to the same cutoff. Tighter than a strict aerobic ideal (≥8) on
      // purpose — most healthy tanks sit in the 6–8 mg/L band, and the
      // shared threshold keeps the net recovery rate stable across the
      // safe-but-not-supersaturated zone.
      key: 'oxygen',
      label: 'Oxygen',
      amount: inRangeBenefit(resources.oxygen, 5, Infinity, FISH_BENEFIT_PEAKS.oxygen),
    },
    {
      key: 'plants',
      label: 'Plants',
      amount: plantBenefitAmount(plants),
    },
  ];
}

/**
 * Translate a vitality breakdown back into the named-field shape that
 * `StressBreakdown` consumers index by key. Values are post-hardiness
 * damage rates — the same numbers `processHealth` is acting on.
 */
function toStressBreakdown(result: VitalityResult): StressBreakdown {
  const breakdown: StressBreakdown = { ...ZERO_BREAKDOWN };
  let total = 0;
  for (const stressor of result.breakdown.stressors) {
    if (stressor.key in breakdown) {
      (breakdown as unknown as Record<string, number>)[stressor.key] = stressor.amount;
    }
    total += stressor.amount;
  }
  breakdown.total = total;
  return breakdown;
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
 * Per-stressor breakdown for the UI / tests. Hardiness already applied.
 */
export function calculateStressBreakdown(
  fish: Fish,
  resources: Resources,
  plants: Plant[],
  waterVolume: number,
  tankCapacity: number,
  config: LivestockConfig
): StressBreakdown {
  return toStressBreakdown(
    computeFishVitality(fish, resources, plants, waterVolume, tankCapacity, config)
  );
}

/**
 * Total stress for a single fish — thin convenience wrapper over the
 * breakdown. Identical numeric result.
 */
export function calculateStress(
  fish: Fish,
  resources: Resources,
  plants: Plant[],
  waterVolume: number,
  tankCapacity: number,
  config: LivestockConfig
): number {
  return calculateStressBreakdown(fish, resources, plants, waterVolume, tankCapacity, config).total;
}

/**
 * Process health for all fish in one tick.
 * Applies vitality, captures surplus, and handles death.
 */
export function processHealth(
  fish: Fish[],
  resources: Resources,
  plants: Plant[],
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

    const result = computeFishVitality(f, resources, plants, waterVolume, tankCapacity, config);
    const newHealth = result.newCondition;

    // Death from health
    if (newHealth <= 0) {
      deadFishNames.push(speciesData.name);
      deathWaste += f.mass * config.deathDecayFactor;
      continue;
    }

    // Death from old age (probabilistic)
    if (f.age >= speciesData.maxAge) {
      if (random() < config.oldAgeDeathChance) {
        deadFishNames.push(`${speciesData.name} (old age)`);
        deathWaste += f.mass * config.deathDecayFactor;
        continue;
      }
    }

    // Surplus accumulates on the fish for future use (breeding,
    // growth). The storage path is wired so those features can read
    // it directly when they land.
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
