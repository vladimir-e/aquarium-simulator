/**
 * Fish management actions - add and remove fish from the tank.
 */

import { produce } from 'immer';
import type { SimulationState, Fish } from '../state.js';
import type { FishSpecies } from '../livestock/species.js';
import { FISH_SPECIES_DATA } from '../livestock/species.js';
import { createLog } from '../core/logging.js';
import { createFish, isStockableSize, STOCKED_FISH_SIZE, unstockableSizeMessage } from '../livestock/create-fish.js';
import { countFry, fishLifeStage, massAtSize } from '../systems/fish-growth.js';
import { sum } from '../core/sum.js';
import { clutchesWithMothers } from '../systems/clutch.js';
import type { LivestockConfig } from '../config/livestock.js';
import type { ActionResult, AddFishAction, RemoveFishAction } from './types.js';

/**
 * Fish are near-neutrally buoyant — the swim bladder trims body density
 * to roughly that of water — so 1 g of fish displaces ≈ 1 mL of water.
 */
const FISH_GRAMS_PER_ML = 1.0;

/**
 * Physical plausibility ceiling for {@link addFish}: stocked fish may
 * occupy at most this fraction of the tank's water volume.
 *
 * This is deliberately *not* a husbandry cap. Overstocking is a valid
 * (and punished) player choice — 50 fish crammed into a nano tank is
 * physically possible, so it's allowed, and the vitality engine plays
 * out the bioload consequences (ammonia, oxygen, waste). The cap only
 * blocks the physically *impossible*: a tank that is more solid fish
 * than water. At 0.5 the fish would fill half the water volume — already
 * absurd for living animals — so any realistic overstocking mistake sits
 * far below it while a nonsense request (a thousand fish in a nano cube)
 * is rejected. Breeding and hatching are exempt; ecology self-regulates.
 */
const MAX_FISH_VOLUME_FRACTION = 0.5;

/** Milliliters per liter — capacity is stored in liters, density in mL. */
const ML_PER_LITER = 1000;

/**
 * Maximum total fish body mass (grams) a tank of the given capacity can
 * physically hold, derived from {@link MAX_FISH_VOLUME_FRACTION} and
 * fish-vs-water density.
 */
export function getMaxFishMass(tankCapacity: number): number {
  if (tankCapacity <= 0) return 0;
  return MAX_FISH_VOLUME_FRACTION * tankCapacity * ML_PER_LITER * FISH_GRAMS_PER_ML;
}

/** Current total body mass (grams) of a set of fish, fry included. */
export function totalFishMass(fish: Fish[]): number {
  return sum(fish.map((f) => f.mass));
}

export interface FishCapacityResult {
  /** True if one more fish of the species fits under the physical ceiling. */
  ok: boolean;
  /** Rejection message when `!ok`; empty string when it fits. */
  message: string;
}

/**
 * Single source of truth for whether {@link addFish} stocks a fish — a known
 * species, a stockable size, room under the ceiling — and its rejection
 * message. Both the action (via {@link canAddFish}) and the demo UI call
 * this, so the math and the message can't drift apart. Mirrors {@link checkPlantFootprint}'s floor budget.
 */
export function checkFishCapacity(
  fish: Fish[],
  tankCapacity: number,
  species: FishSpecies,
  size: number = STOCKED_FISH_SIZE
): FishCapacityResult {
  if (!FISH_SPECIES_DATA[species]) {
    return { ok: false, message: `Unknown fish species: ${species}` };
  }
  if (!isStockableSize(species, size)) {
    return { ok: false, message: unstockableSizeMessage(species) };
  }
  const maxMass = getMaxFishMass(tankCapacity);
  const ok = totalFishMass(fish) + massAtSize(species, size) <= maxMass;
  return {
    ok,
    message: ok ? '' : `Tank at fish capacity (~${Math.floor(maxMass)}g of fish max)`,
  };
}

/**
 * Whether one more fish of `species` fits under the physical stocking
 * ceiling. Thin state-based wrapper over {@link checkFishCapacity}.
 */
export function canAddFish(state: SimulationState, species: FishSpecies, size?: number): boolean {
  return checkFishCapacity(state.fish, state.tank.capacity, species, size).ok;
}

/**
 * Add a fish to the tank at a size — grown when none is named. The
 * individual variation — sex, hardiness offset, health jitter — is sampled by
 * the shared {@link createFish} factory, the same one breeding uses for fry.
 */
export function addFish(
  state: SimulationState,
  action: AddFishAction,
  config: LivestockConfig
): ActionResult {
  const { species, size = STOCKED_FISH_SIZE } = action;

  const capacity = checkFishCapacity(state.fish, state.tank.capacity, species, size);
  if (!capacity.ok) {
    return { state, message: capacity.message };
  }
  const speciesData = FISH_SPECIES_DATA[species];

  const newState = produce(state, (draft) => {
    const fish = createFish({ species, size, rng: draft.rng, config });
    draft.fish.push(fish);

    draft.logs.push(
      createLog(
        draft.tick,
        'user',
        'info',
        `Added ${speciesData.name} (${Number(fish.mass.toFixed(2))}g, ${fish.sex})`
      )
    );
  });

  return {
    state: newState,
    message: `Added ${speciesData.name}`,
  };
}

/**
 * Remove a fish from the tank, and the brood she carries with her.
 */
export function removeFish(
  state: SimulationState,
  action: RemoveFishAction
): ActionResult {
  const { fishId } = action;

  // Find the fish
  const fishIndex = state.fish.findIndex((f) => f.id === fishId);
  if (fishIndex === -1) {
    return {
      state,
      message: 'Fish not found',
    };
  }

  const fish = state.fish[fishIndex];
  const speciesData = FISH_SPECIES_DATA[fish.species];

  const newState = produce(state, (draft) => {
    draft.fish.splice(fishIndex, 1);
    draft.clutches = clutchesWithMothers(draft.clutches, draft.fish);

    draft.logs.push(
      createLog(
        draft.tick,
        'user',
        'info',
        `Removed ${speciesData.name}`
      )
    );
  });

  return {
    state: newState,
    message: `Removed ${speciesData.name}`,
  };
}

/**
 * Sell (remove) every fish that reads as fry at once — the population-management
 * pressure valve for a tank that has bred past what the player wants to
 * keep. The engine is money-free, so "sell" carries no economic effect
 * here; it removes the fry and logs a `fry-sold` event for game-side
 * consumers to price. Adults are untouched.
 */
export function sellFry(state: SimulationState): ActionResult {
  const fryCount = countFry(state.fish);

  if (fryCount === 0) {
    return {
      state,
      message: 'No fry to sell',
    };
  }

  const newState = produce(state, (draft) => {
    draft.fish = draft.fish.filter((f) => fishLifeStage(f) !== 'fry');
    draft.clutches = clutchesWithMothers(draft.clutches, draft.fish);

    draft.logs.push(
      createLog(
        draft.tick,
        'user',
        'info',
        `Sold ${fryCount} fry`,
        'fry-sold',
        fryCount
      )
    );
  });

  return {
    state: newState,
    message: `Sold ${fryCount} fry`,
  };
}
