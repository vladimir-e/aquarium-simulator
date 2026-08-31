/**
 * Plant spending — the bank, and the ladder it is spent down.
 *
 * Each plant's vitality banks what its income left after upkeep, on
 * `Plant.surplus` and capped at `surplusCap`. This module spends it:
 * every lit tick a plant mobilises `growthDrawRate` of the bank and puts
 * it into condition first and new tissue second. Repair before growth is
 * the ladder vitality has always run — a stressed organism cannot make
 * progress until the deficit is paid down — with the bank as the pool
 * both rungs draw from, which is what leaves a recovering plant with
 * something to pay the night with.
 *
 * Both rungs are junior to upkeep, so both stop at the same floor damage
 * stops at: the withdrawal comes out of `spendableSurplus`, never out of
 * the survival rations. Without that a lit plant under mild stress hands
 * the ration back through repair — damage stops at the floor and takes
 * condition, repair reaches under the floor and gives the condition back,
 * and the plant starves a tick later having paid twice for one hour.
 *
 * Only what was spent leaves the bank — a plant at full condition and at
 * its ceiling converts nothing and pays nothing, so its whole income
 * banks instead of burning. That reserve is what rides out a dark spell,
 * and what propagation will spend on runners. The docs portal, Plants
 * § The bank and the ladder carries why the draw is a share of the bank
 * rather than a flat per-tick ceiling.
 *
 * No tank-wide overgrowth penalty, no biomass redistribution, no
 * 200 % waste-dump backstop. Each plant runs against its own bank and
 * its own ceiling.
 */

import type { Plant } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
import { PLANT_SPECIES_DATA } from '../plants/species.js';
import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';
import { spendableSurplus } from './vitality.js';

/**
 * Get the growth rate for a plant species. Per-species multiplier on
 * surplus → size conversion (slow Anubias 0.3, fast Monte Carlo 1.8).
 */
export function getSpeciesGrowthRate(species: PlantSpecies): number {
  return PLANT_SPECIES_DATA[species].growthRate;
}

/** Per-species size ceiling. */
export function getSpeciesMaxSize(species: PlantSpecies): number {
  return PLANT_SPECIES_DATA[species].maxSize;
}

/**
 * Asymptotic growth throttle: `factor = max(0, 1 - size / maxSize)`.
 * The share of mobilised surplus a plant can still turn into size — 1
 * at size 0, decaying to 0 at `maxSize`, so each plant self-limits to
 * its species ceiling and the rest stays banked.
 */
export function asymptoticGrowthFactor(size: number, maxSize: number): number {
  if (maxSize <= 0) return 0;
  return Math.max(0, 1 - size / maxSize);
}

export function spendSurplus(
  plant: Plant,
  reserved: number,
  config: PlantsConfig = plantsDefaults
): Plant {
  const spendable = spendableSurplus(plant.surplus, reserved);
  if (spendable <= 0) return plant;

  // The spendable bank bounds the withdrawal whatever the config says the rate
  // is: a restored save carries any finite `growthDrawRate`, and one above 1
  // would otherwise drive the bank negative and latch it there.
  const mobilised = Math.min(spendable, plant.surplus * config.growthDrawRate);

  // A bank unit is a condition point — the bank accrued out of the same
  // %/h the condition deficit is measured in.
  const repaired = Math.min(mobilised, 100 - plant.condition);
  const converted =
    (mobilised - repaired) *
    asymptoticGrowthFactor(plant.size, getSpeciesMaxSize(plant.species));

  return {
    ...plant,
    condition: plant.condition + repaired,
    size: plant.size + converted * getSpeciesGrowthRate(plant.species) * config.sizePerSurplus,
    surplus: plant.surplus - repaired - converted,
  };
}
