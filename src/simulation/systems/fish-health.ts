/**
 * Fish health — the damage axis of a fish whose body is its energy budget.
 *
 * Each hour a fish's environment is decomposed into damage and benefit
 * factors. Benefits raise health and damage lowers it; on top, the fish
 * repairs a share of its deficit at `healingRate`, paying `healingCost` hours
 * of upkeep a point from its reserve inside the budget step. Health above 100
 * is lost. A fish dies at 0, or of old age when its survival falls below the
 * threshold it drew.
 *
 * Stressors:
 * - Temperature, pH, GH, water level, flow, predation and starvation are
 *   scaled by `1 − fishHardiness`.
 * - Free NH3, nitrite, nitrate and oxygen instead carry hardiness on the
 *   concentration axis: it moves where harm starts, not how steeply it grows.
 *   The toxins read the load the hour carries the fish to, oxygen the water of
 *   this moment.
 * - Starvation is the hour's maintenance shortfall as a share of its upkeep.
 * - Age is the DEB hazard at `hazardSeverity`: intrinsic, no hardiness
 *   shields it.
 *
 * Benefit factors, every one earned on reserve density — a fish well fed
 * earns them in full:
 * - pH, full at the band centre and zero at its edges
 * - Oxygen, rising from `OXYGEN_EDGE` to full at `OXYGEN_COMFORT`
 * - Plant presence (saturating at `plantBenefitSaturationPoint`)
 */

import type { Fish, Plant, Resources } from '../state.js';
import { getPh } from '../core/carbonate.js';
import { FISH_SPECIES_DATA, type FishSpecies } from '../livestock/species.js';
import { getDgh } from '../resources/index.js';
import { TOXIN_LABEL, type LivestockConfig, type ToxinVector } from '../config/livestock.js';
import { shareOut, swallow, type Pace } from './digestion.js';
import { getPlantPower } from './plant-power.js';
import { sum } from '../core/sum.js';
import { addOrganics, NO_ORGANICS, portion, type Organics } from '../core/organics.js';
import { pointsHealed, starvation, wellFed } from './reserve.js';
import { FISH_COMPOSITION, fishMass, fishOrganics, fishParams, fishSize } from './fish-body.js';
import type { FishHour } from './metabolism.js';
import {
  fishHardiness,
  OXYGEN_COMFORT,
  OXYGEN_EDGE,
  OXYGEN_LOG_OFFSET,
  toleranceFactor,
  toxinEFolds,
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

export interface HealthInput {
  fish: readonly Fish[];
  hours: readonly FishHour[];
  fed: readonly Fish[];
  resources: Resources;
  plants: Plant[];
  tankCapacity: number;
  config: LivestockConfig;
  carried: readonly number[];
}

export interface HealthResult {
  survivingFish: Fish[];
  deadFishNames: string[];
  /** Waste the dead leave: their bodies, their guts and the broods they carried, less what the survivors ate */
  deathWaste: Organics;
  /** Each fish's vitality this tick, in the order handed in, the dead included */
  vitalities: VitalityResult[];
}

interface FishFactorContext {
  /** The fish as the hour found it. */
  fish: Fish;
  hour: FishHour;
  resources: Resources;
  plants: Plant[];
  waterVolume: number;
  tankCapacity: number;
  config: LivestockConfig;
  hardiness: number;
  /** Grams by which the tank's larger fish outweigh it, summed. */
  predatorMass: number;
}

/**
 * Aggregate plant-presence contribution → saturated benefit (linear ramp).
 *
 * Plant power is each plant's rate units × `condition / 100`, summed (see
 * `getPlantPower`). The sum runs through `min(1, power / SAT)` so the
 * benefit tops out at `peak` regardless of overplanting — see
 * `plantBenefitSaturationPoint` in `LivestockConfig` for the calibration
 * choice. The blooms' allelopathy reads the same primitive through
 * `thrivingPlantDensity`, so the two consumers stay consistent.
 */
function plantBenefitAmount(plants: Plant[], config: LivestockConfig): number {
  const power = getPlantPower(plants);
  if (power <= 0) return 0;
  const saturation = Math.min(1, power / config.plantBenefitSaturationPoint);
  return config.plantBenefitPeak * saturation;
}

/**
 * What the water charges an organism of this species and hardiness, in %/h:
 * the tolerance bands scaled by `1 − hardiness`, the toxins and oxygen with
 * hardiness moving their edge instead; `toxins`: the levels it is exposed to.
 */
export function waterStressors(
  species: FishSpecies,
  hardiness: number,
  toxins: ToxinVector,
  resources: Resources,
  waterVolume: number,
  config: LivestockConfig
): VitalityFactor[] {
  const speciesData = FISH_SPECIES_DATA[species];
  const tolerance = toleranceFactor(hardiness);

  const tempStress =
    config.temperatureStressSeverity * outsideBand(resources.temperature, speciesData.temperatureRange);
  const phStress = config.phStressSeverity * outsideBand(getPh(resources), speciesData.phRange);
  const ghStress =
    config.ghStressSeverity * outsideBand(getDgh(resources.gh, waterVolume), speciesData.ghRange);

  const folds = toxinEFolds(toxins, hardiness);
  const oxygenStress =
    config.oxygenStressSeverity * eFoldsUnder(resources.oxygen, OXYGEN_EDGE / tolerance, OXYGEN_LOG_OFFSET);

  return [
    ...hardened(
      [
        { key: 'temperature', label: 'Temperature', amount: tempStress },
        { key: 'ph', label: 'pH', amount: phStress },
        { key: 'gh', label: 'GH', amount: ghStress },
      ],
      hardiness
    ),
    { key: 'ammonia', label: TOXIN_LABEL.ammonia, amount: config.ammoniaStressSeverity * folds.ammonia },
    { key: 'nitrite', label: TOXIN_LABEL.nitrite, amount: config.nitriteStressSeverity * folds.nitrite },
    { key: 'nitrate', label: TOXIN_LABEL.nitrate, amount: config.nitrateStressSeverity * folds.nitrate },
    { key: 'oxygen', label: 'Oxygen', amount: oxygenStress },
  ];
}

/** How hard a fish hunts a prey, by their weights: the grams by which it outweighs it, none between equals. */
export function predatorWeight(predatorMass: number, preyMass: number): number {
  return Math.max(0, predatorMass - preyMass);
}

/** Each fish's predator mass, from every fish's weight: every other fish's predator weight on it, summed, in one sort. */
export function predatorMasses(masses: readonly number[]): number[] {
  const order = masses.map((_, i) => i).sort((a, b) => masses[a] - masses[b]);
  const summed = new Array<number>(masses.length);
  let heavier = 0;
  for (let k = order.length - 1; k >= 0; k--) {
    const mass = masses[order[k]];
    summed[order[k]] = Math.max(0, heavier - (order.length - 1 - k) * mass);
    heavier += mass;
  }
  return summed;
}

/** How exposed a fish of this size is to predators: whole at no size, falling smoothly to none grown. */
export function preyVulnerability(size: number, config: LivestockConfig): number {
  return Math.max(0, 1 - size / 100) ** config.preyVulnerabilityExponent;
}

/** Damage, before hardiness, that its predator mass per litre does a fish of this size an hour. */
export function predationStress(
  preySize: number,
  predatorMass: number,
  waterVolume: number,
  config: LivestockConfig
): number {
  if (waterVolume <= 0) return 0;
  return ((config.predationRate * predatorMass) / waterVolume) * preyVulnerability(preySize, config);
}

/**
 * Build the hardened stressor list for a fish: the water's, then its own
 * body's, scaled by hardiness, then its age. Inactive stressors are emitted
 * with `amount: 0` so the breakdown shape stays stable for downstream UI /
 * tests that look up by name.
 */
function buildStressors(ctx: FishFactorContext): VitalityFactor[] {
  const { fish, hour, waterVolume, tankCapacity, config, resources } = ctx;
  const speciesData = FISH_SPECIES_DATA[fish.species];

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

  const huntedStress = predationStress(fishSize(fish), ctx.predatorMass, waterVolume, config);

  return [
    ...waterStressors(fish.species, ctx.hardiness, hour.fish.load, resources, waterVolume, config),
    ...hardened(
      [
        { key: 'starvation', label: 'Starvation', amount: config.starvationSeverity * starvation(hour) },
        { key: 'waterLevel', label: 'Water level', amount: waterLevelStress },
        { key: 'flow', label: 'Flow', amount: flowStress },
        { key: 'hunted', label: 'Hunted', amount: huntedStress },
      ],
      ctx.hardiness
    ),
    { key: 'age', label: 'Age', amount: config.hazardSeverity * fish.budget.hazard },
  ];
}

/**
 * Build the benefit list for a fish, every channel earned on its reserve
 * density. All three are emitted every tick, even at zero — UI filters; the
 * simulation doesn't have to.
 */
function buildBenefits(ctx: FishFactorContext): VitalityFactor[] {
  const { fish, resources, plants, config } = ctx;
  const speciesData = FISH_SPECIES_DATA[fish.species];
  const earning = wellFed(fish.budget, fishParams(fish));

  return [
    {
      key: 'ph',
      label: 'pH',
      amount: earning * config.phBenefitPeak * bandComfort(getPh(resources), speciesData.phRange),
    },
    {
      key: 'oxygen',
      label: 'Oxygen',
      amount:
        earning *
        config.oxygenBenefitPeak *
        Math.min(1, eFoldsPast(resources.oxygen, OXYGEN_EDGE) / Math.log(OXYGEN_COMFORT / OXYGEN_EDGE)),
    },
    {
      key: 'plants',
      label: 'Plants',
      amount: earning * plantBenefitAmount(plants, config),
    },
  ];
}

/**
 * A fish's health over the hour its budget ran, without applying it —
 * `processHealth` applies it. A caller wanting the next tick's numbers reads it
 * on the hour that tick settles, with the fish as the hour found it, the hour
 * its budget ran, and its predator mass.
 */
export function computeFishVitality(
  fish: Fish,
  hour: FishHour,
  resources: Resources,
  plants: Plant[],
  waterVolume: number,
  tankCapacity: number,
  config: LivestockConfig,
  predatorMass: number
): VitalityResult {
  const ctx: FishFactorContext = {
    fish,
    hour,
    resources,
    plants,
    waterVolume,
    tankCapacity,
    config,
    hardiness: fishHardiness(fish),
    predatorMass,
  };
  return computeVitality({
    stressors: buildStressors(ctx),
    benefits: buildBenefits(ctx),
    condition: fish.health,
    healed: pointsHealed(hour.fluxes.burned.healing, fish.budget, fishParams(fish), config),
  });
}

/** Share of a fish's damage this hour that one stressor did. */
function damageShare(vitality: VitalityResult, key: string): number {
  const { damageRate, stressors } = vitality.breakdown;
  const amount = stressors.find((factor) => factor.key === key)?.amount ?? 0;
  return damageRate > 0 ? amount / damageRate : 0;
}

/**
 * One hour of health for every fish its budget ran for: `fish` as the hour
 * found them, `hours` their budgets' hours and `fed` them fed after. A fish
 * dies when its health reaches 0 or its survival falls below its draw. What it
 * leaves — its body and the brood it carried, and its gut —
 * its predators eat in the share of its damage they did, by their weight on
 * it and as far as their guts have room; the rest is waste. `carried` is the
 * grams of brood each carries.
 */
export function processHealth({
  fish,
  hours,
  fed,
  resources,
  plants,
  tankCapacity,
  config,
  carried,
}: HealthInput): HealthResult {
  const deadFishNames: string[] = [];
  let deathWaste: Organics = NO_ORGANICS;
  const waterVolume = resources.water;
  const masses = fish.map(fishMass);
  const predatorMass = predatorMasses(masses);
  const vitalities = fish.map((f, i) =>
    computeFishVitality(f, hours[i], resources, plants, waterVolume, tankCapacity, config, predatorMass[i])
  );
  const oldAge = fed.map((f) => f.survival < f.survivalDraw);
  const dies = vitalities.map((vitality, i) => vitality.newCondition <= 0 || oldAge[i]);

  const living = fed.map((_, i) => i).filter((i) => !dies[i]);
  const survivingFish = living.map((i) => ({ ...fed[i], health: vitalities[i].newCondition }));
  const survivorPaces: Pace[] = living.map((i) => hours[i].pace);

  fed.forEach((f, i) => {
    if (!dies[i]) return;
    const remains = addOrganics(portion(FISH_COMPOSITION, fishOrganics(f) + carried[i]), f.gut);
    const weights = living.map((j) => predatorWeight(masses[j], masses[i]));
    const surviving = predatorMass[i] > 0 ? Math.min(1, sum(weights) / predatorMass[i]) : 0;
    const share = damageShare(vitalities[i], 'hunted') * surviving;

    const eaten = shareOut(weights, share * remains.grams);
    const swallowed = swallow(survivingFish, survivorPaces, eaten.taken);
    survivingFish.forEach((survivor, j) => {
      survivor.gut = addOrganics(survivor.gut, portion(remains, swallowed.taken[j]));
    });
    deathWaste = addOrganics(
      deathWaste,
      portion(remains, (1 - share) * remains.grams + eaten.overflow + swallowed.overflow)
    );

    const cause =
      oldAge[i] || damageShare(vitalities[i], 'age') > 0.5
        ? ' (old age)'
        : damageShare(vitalities[i], 'starvation') > 0.5
          ? ' (starved)'
          : share > 0.5
            ? ' (eaten)'
            : '';
    deadFishNames.push(`${FISH_SPECIES_DATA[f.species].name}${cause}`);
  });

  return { survivingFish, deadFishNames, deathWaste, vitalities };
}
