/**
 * Plant growth — the bank buys size, and a full bank buys an offshoot.
 *
 * Each plant's vitality banks the income it earns at full condition, on
 * `Plant.surplus` and capped at `surplusCap`. Every tick, day and night, a
 * plant draws `1 − e^−growthDrawRate` of the bank toward new tissue through the
 * taper `1 − size/100`, which closes the draw down as its unit fills. Only what
 * becomes size leaves the bank, so a filling unit keeps income banked against
 * a bad spell — and a nearly full one banks up to the cap, where the bank buys
 * a new unit of its family instead.
 *
 * Nothing clamps growth: within the tunables' bounds and the roster's growth
 * rates one tick buys at most 0.65 of what is left to 100, so the taper keeps
 * every plant below it.
 */

import type { Plant } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
import { PLANT_SPECIES_DATA, plantTraits } from '../plants/species.js';
import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';
import { bankFull } from './vitality.js';
import { bankConversion, bankDraw } from './flora.js';

/**
 * Get the growth rate for a plant species. Per-species multiplier on
 * surplus → size conversion (slow Anubias 0.3, fast Monte Carlo 1.8).
 */
export function getSpeciesGrowthRate(species: PlantSpecies): number {
  return PLANT_SPECIES_DATA[species].growthRate;
}

/** Size one condition point of bank buys: the conversion growth and offshoots both run at. */
function sizePerBank(plant: Plant, config: PlantsConfig): number {
  return bankConversion(plantTraits(plant.species), config);
}

export function spendSurplus(plant: Plant, config: PlantsConfig = plantsDefaults): Plant {
  const converted = bankDraw(plant.surplus, plant.size, config);
  if (converted <= 0) return plant;

  return {
    ...plant,
    size: plant.size + converted * sizePerBank(plant, config),
    surplus: plant.surplus - converted,
  };
}

export interface Propagation {
  parent: Plant;
  offshootSize: number;
}

/**
 * A full bank buys an offshoot, as a full bank buys a fish a brood. The offshoot
 * is the bank at the growth conversion, untapered, one full unit at most, and
 * the parent pays for exactly what it bought. Null while the bank is short of full.
 */
export function propagate(plant: Plant, config: PlantsConfig = plantsDefaults): Propagation | null {
  if (!bankFull(plant.surplus, config.surplusCap)) return null;

  const conversion = sizePerBank(plant, config);
  const spent = Math.min(plant.surplus, 100 / conversion);
  // (100 / c) · c can land a hair over 100.
  const offshootSize = Math.min(100, spent * conversion);

  return {
    parent: { ...plant, surplus: plant.surplus - spent },
    offshootSize,
  };
}

/** An hour's purchase as the bank asks for it, before the water supplies it. */
export interface Purchase {
  before: Plant;
  after: Plant;
  offshootSize: number;
}

/** What a plant's bank buys this hour at full supply: a full bank's offshoot first, then growth. */
export function purchase(plant: Plant, config: PlantsConfig = plantsDefaults): Purchase {
  const propagation = propagate(plant, config);
  return {
    before: plant,
    after: spendSurplus(propagation?.parent ?? plant, config),
    offshootSize: propagation?.offshootSize ?? 0,
  };
}

/** Size of new tissue a purchase asks for, the offshoot's included. */
export function sizeBought({ before, after, offshootSize }: Purchase): number {
  return after.size - before.size + offshootSize;
}

/** The purchase at the share of it the pools supplied. */
export function supply({ before, after, offshootSize }: Purchase, share: number): Purchase {
  return {
    before,
    after: {
      ...after,
      size: before.size + share * (after.size - before.size),
      surplus: before.surplus + share * (after.surplus - before.surplus),
    },
    offshootSize: share * offshootSize,
  };
}
