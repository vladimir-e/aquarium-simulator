/**
 * Fish health system — runs on the unified Vitality engine.
 *
 * Each tick a fish's environment is decomposed into damage and benefit
 * factors, fed through {@link computeVitality}, and the result drives
 * `health` (the fish-side name for vitality's `condition`). Income at full
 * health banks on `Fish.surplus`; the bank heals health below 100 at
 * {@link fishHealingRate}, falling with age, and a full one is what a female
 * broods on (see `livestock/breeding.ts`).
 *
 * Stressors, hardened here before they reach the vitality engine:
 * - Temperature, pH, GH, hunger, water level, flow and predation are scaled
 *   by `1 − fishHardiness`.
 * - Free NH3, nitrite, nitrate and oxygen instead carry hardiness on the
 *   concentration axis: it moves where harm starts, not how steeply it grows.
 * - Wear, rising with age on a Gompertz curve, is intrinsic: no hardiness
 *   shields it, only the individual's vigour scales it (see {@link fishWear}).
 *
 * Benefit factors (peaks tunable via `LivestockConfig`), every one earned on
 * what the fish digested — its nourishment, half at its maintenance ration:
 * - pH, full at the band centre and zero at its edges
 * - Oxygen, rising from `OXYGEN_EDGE` to full at `OXYGEN_COMFORT`
 * - Plant presence (saturating at `plantBenefitSaturationPoint`)
 *
 * At default calibration and full nourishment, pH at its band centre, the
 * abiotic two sum to ≈ 0.7 %/h and the plant benefit adds up to 0.2 %/h.
 */

import type { Fish, Plant, Resources } from '../state.js';
import { getPh } from '../core/carbonate.js';
import { FISH_SPECIES_DATA, type FishSpecies } from '../livestock/species.js';
import { getDgh, getPpm } from '../resources/index.js';
import type { LivestockConfig } from '../config/livestock.js';
import { freeAmmoniaPpm } from './nitrogen-cycle.js';
import { maintenance, nourishment, shareOut, swallow } from './digestion.js';
import { getPlantPower } from './plant-power.js';
import { sum } from '../core/sum.js';
import { fishSize } from './fish-growth.js';
import {
  FREE_AMMONIA_EDGE,
  NITRATE_EDGE,
  NITRITE_EDGE,
  OXYGEN_COMFORT,
  OXYGEN_EDGE,
  OXYGEN_LOG_OFFSET,
  toleranceFactor,
} from '../livestock/tolerance.js';
import {
  bandComfort,
  computeVitality,
  eFoldsPast,
  eFoldsUnder,
  hardened,
  outsideBand,
  shortfall,
  type VitalityFactor,
  type VitalityResult,
} from './vitality.js';

export interface HealthResult {
  /** Fish that survived this tick */
  survivingFish: Fish[];
  /** Names of fish that died */
  deadFishNames: string[];
  /** Waste the dead leave: their share of body mass, their guts and the broods they carried, less what the survivors ate */
  deathWaste: number;
  /** Each fish's vitality this tick, in the order handed in, the dead included */
  vitalities: VitalityResult[];
}

/**
 * Hardiness clamped to [0.1, 0.95], so no offset makes an organism
 * invincible or instantly doomed.
 */
export function speciesHardiness(species: FishSpecies, offset = 0): number {
  return Math.max(0.1, Math.min(0.95, FISH_SPECIES_DATA[species].hardiness + offset));
}

export function fishHardiness(fish: Pick<Fish, 'species' | 'hardinessOffset'>): number {
  return speciesHardiness(fish.species, fish.hardinessOffset);
}

interface FishFactorContext {
  fish: Fish;
  resources: Resources;
  plants: Plant[];
  waterVolume: number;
  tankCapacity: number;
  config: LivestockConfig;
  hardiness: number;
  /** Grams its gut digested this hour. */
  digested: number;
  /** Grams it had to digest this hour to hold its condition. */
  need: number;
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
 * choice. Algae vitality reads the same `getPlantPower` primitive for
 * its allelopathy, so the two consumers stay consistent.
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
 * hardiness moving their edge instead. Fish and their clutches both read it.
 */
export function waterStressors(
  species: FishSpecies,
  hardiness: number,
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

  // Only the unionized NH3 fraction is acutely toxic.
  const freeNH3Ppm = freeAmmoniaPpm({ ...resources, water: waterVolume });
  const ammoniaStress = config.ammoniaStressSeverity * eFoldsPast(freeNH3Ppm, FREE_AMMONIA_EDGE * tolerance);
  const nitriteStress =
    config.nitriteStressSeverity * eFoldsPast(getPpm(resources.nitrite, waterVolume), NITRITE_EDGE * tolerance);
  const nitrateStress =
    config.nitrateStressSeverity * eFoldsPast(getPpm(resources.nitrate, waterVolume), NITRATE_EDGE * tolerance);
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
    { key: 'ammonia', label: 'Free NH3', amount: ammoniaStress },
    { key: 'nitrite', label: 'Nitrite', amount: nitriteStress },
    { key: 'nitrate', label: 'Nitrate', amount: nitrateStress },
    { key: 'oxygen', label: 'Oxygen', amount: oxygenStress },
  ];
}

/** How hard a fish hunts a prey: the grams by which it outweighs it, none between equals. */
export function predatorWeight(predator: Pick<Fish, 'mass'>, prey: Pick<Fish, 'mass'>): number {
  return Math.max(0, predator.mass - prey.mass);
}

/** Each fish's predator mass: every other fish's predator weight on it, summed, in one sort. */
export function predatorMasses(fish: readonly Pick<Fish, 'mass'>[]): number[] {
  const order = fish.map((_, i) => i).sort((a, b) => fish[a].mass - fish[b].mass);
  const masses = new Array<number>(fish.length);
  let heavier = 0;
  for (let k = order.length - 1; k >= 0; k--) {
    const { mass } = fish[order[k]];
    masses[order[k]] = Math.max(0, heavier - (order.length - 1 - k) * mass);
    heavier += mass;
  }
  return masses;
}

/** How exposed a fish of this size is to predators: whole at no size, falling smoothly to none at adult size. */
export function preyVulnerability(size: number, config: LivestockConfig): number {
  return Math.max(0, 1 - size / 100) ** config.preyVulnerabilityExponent;
}

/** Damage, before hardiness, that its predator mass per litre does a fish an hour. */
export function predationStress(
  prey: Pick<Fish, 'species' | 'mass'>,
  predatorMass: number,
  waterVolume: number,
  config: LivestockConfig
): number {
  if (waterVolume <= 0) return 0;
  return ((config.predationRate * predatorMass) / waterVolume) * preyVulnerability(fishSize(prey), config);
}

const MAX_WEAR_DOUBLINGS = 64;

/**
 * Damage a fish's age does it an hour, Gompertz: `wearAtLifespan` at its
 * species lifespan, doubling every `wearDoublingShare` of it, so negligible in
 * youth. Species hardiness never shields it; a fish hardier than its species
 * wears slower in proportion, which staggers a cohort's deaths.
 */
export function fishWear(fish: Pick<Fish, 'species' | 'age' | 'hardinessOffset'>, config: LivestockConfig): number {
  if (config.wearAtLifespan <= 0) return 0;
  const { lifespan, hardiness } = FISH_SPECIES_DATA[fish.species];
  const vigour = fishHardiness(fish) / hardiness;
  const doublings = (fish.age - lifespan) / (config.wearDoublingShare * lifespan);
  return (config.wearAtLifespan / vigour) * 2 ** Math.min(doublings, MAX_WEAR_DOUBLINGS);
}

/**
 * Build the hardened stressor list for a fish: the water's, then its own
 * body's, scaled by hardiness. Inactive stressors are emitted with
 * `amount: 0` so the breakdown shape stays stable for downstream UI / tests
 * that look up by name.
 */
function buildStressors(ctx: FishFactorContext): VitalityFactor[] {
  const { fish, waterVolume, tankCapacity, config, resources } = ctx;
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

  const hungerStress = config.hungerSeverity * shortfall(ctx.digested, ctx.need);
  const huntedStress = predationStress(fish, ctx.predatorMass, waterVolume, config);

  return [
    ...waterStressors(fish.species, ctx.hardiness, resources, waterVolume, config),
    ...hardened(
      [
        { key: 'hunger', label: 'Hunger', amount: hungerStress },
        { key: 'waterLevel', label: 'Water level', amount: waterLevelStress },
        { key: 'flow', label: 'Flow', amount: flowStress },
        { key: 'hunted', label: 'Hunted', amount: huntedStress },
      ],
      ctx.hardiness
    ),
    { key: 'wear', label: 'Wear', amount: fishWear(fish, config) },
  ];
}

/**
 * Build the benefit list for a fish, every channel earned on its nourishment.
 * All three are emitted every tick, even at zero — UI filters; the simulation
 * doesn't have to.
 */
function buildBenefits(ctx: FishFactorContext): VitalityFactor[] {
  const { fish, resources, plants, config } = ctx;
  const speciesData = FISH_SPECIES_DATA[fish.species];
  const earning = nourishment(ctx.digested, ctx.need);

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
 * Rate a fish's bank heals it at, per hour: `healingDrawRate` for a young 1 g
 * fish, scaled by adult mass to the −¼ power, as mass-specific metabolism is,
 * and halving every `healingHalvingShare` of its species lifespan.
 */
export function fishHealingRate(fish: Pick<Fish, 'species' | 'age'>, config: LivestockConfig): number {
  const { adultMass, lifespan } = FISH_SPECIES_DATA[fish.species];
  return config.healingDrawRate * adultMass ** -0.25 * 2 ** (-fish.age / (config.healingHalvingShare * lifespan));
}

/**
 * A vitality tick for one fish, without applying it — `processHealth` applies
 * it. A caller wanting the next tick's numbers reads it on the hour that tick
 * settles, with the fish as metabolism leaves them, what its gut digested,
 * the metabolic factor it digested at and its predator mass.
 */
export function computeFishVitality(
  fish: Fish,
  resources: Resources,
  plants: Plant[],
  waterVolume: number,
  tankCapacity: number,
  config: LivestockConfig,
  digested: number,
  metabolicFactor: number,
  predatorMass: number
): VitalityResult {
  const ctx: FishFactorContext = {
    fish,
    resources,
    plants,
    waterVolume,
    tankCapacity,
    config,
    hardiness: fishHardiness(fish),
    digested,
    need: maintenance(fish, metabolicFactor, config),
    predatorMass,
  };
  return computeVitality({
    stressors: buildStressors(ctx),
    benefits: buildBenefits(ctx),
    condition: fish.health,
    surplus: fish.surplus,
    surplusCap: config.surplusCap,
    healingRate: fishHealingRate(fish, config),
  });
}

/** Share of a fish's damage this hour that one stressor did. */
function damageShare(vitality: VitalityResult, key: string): number {
  const { damageRate, stressors } = vitality.breakdown;
  const amount = stressors.find((factor) => factor.key === key)?.amount ?? 0;
  return damageRate > 0 ? amount / damageRate : 0;
}

/**
 * One tick of vitality for every fish; a fish whose condition reaches 0 dies.
 * What it leaves — its rotting body, its gut and the brood it carried — its
 * predators eat in the share of its damage they did, by their weight on it and
 * as far as their guts have room; the rest is waste.
 */
export function processHealth(
  fish: Fish[],
  resources: Resources,
  plants: Plant[],
  waterVolume: number,
  tankCapacity: number,
  config: LivestockConfig,
  digested: readonly number[],
  metabolicFactor: number,
  carried: readonly number[]
): HealthResult {
  const deadFishNames: string[] = [];
  let deathWaste = 0;
  const predatorMass = predatorMasses(fish);
  const vitalities = fish.map((f, i) =>
    computeFishVitality(
      f,
      resources,
      plants,
      waterVolume,
      tankCapacity,
      config,
      digested[i],
      metabolicFactor,
      predatorMass[i]
    )
  );

  const survivingFish = fish
    .map((f, i) => ({ ...f, health: vitalities[i].newCondition, surplus: vitalities[i].surplus }))
    .filter((f) => f.health > 0);

  fish.forEach((f, i) => {
    if (vitalities[i].newCondition > 0) return;
    const speciesData = FISH_SPECIES_DATA[f.species];
    const remains = f.mass * config.deathDecayFactor + f.gut + carried[i];
    const weights = survivingFish.map((survivor) => predatorWeight(survivor, f));
    const surviving = predatorMass[i] > 0 ? Math.min(1, sum(weights) / predatorMass[i]) : 0;
    const share = damageShare(vitalities[i], 'hunted') * surviving;

    const eaten = shareOut(weights, share * remains);
    const swallowed = swallow(survivingFish, eaten.taken, config);
    survivingFish.forEach((survivor, j) => {
      survivor.gut += swallowed.taken[j];
    });
    deathWaste += (1 - share) * remains + eaten.overflow + swallowed.overflow;

    const cause = damageShare(vitalities[i], 'wear') > 0.5 ? ' (old age)' : share > 0.5 ? ' (eaten)' : '';
    deadFishNames.push(`${speciesData.name}${cause}`);
  });

  return {
    survivingFish,
    deadFishNames,
    deathWaste,
    vitalities,
  };
}
