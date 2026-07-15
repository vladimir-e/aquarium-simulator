/**
 * Fish management actions - add and remove fish from the tank.
 */

import { produce } from 'immer';
import type { SimulationState, FishSpecies } from '../state.js';
import { FISH_SPECIES_DATA } from '../state.js';
import { createLog } from '../core/logging.js';
import { createFish } from '../livestock/create-fish.js';
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

/** Current total body mass (grams) of every fish in the tank, fry included. */
export function totalFishMass(state: SimulationState): number {
  return state.fish.reduce((sum, f) => sum + f.mass, 0);
}

/**
 * Whether one more adult of `species` fits under the physical stocking
 * ceiling. Mirrors {@link canAddPlant} — the UI uses it to gate the Add
 * button, and {@link addFish} enforces it on the action itself.
 */
export function canAddFish(state: SimulationState, species: FishSpecies): boolean {
  const speciesData = FISH_SPECIES_DATA[species];
  if (!speciesData) return false;
  return totalFishMass(state) + speciesData.adultMass <= getMaxFishMass(state.tank.capacity);
}

/**
 * Add a fish to the tank. Stocked fish arrive as full-grown adults
 * (age 0, adult mass); the individual variation — sex, hardiness
 * offset, health jitter — is sampled by the shared {@link createFish}
 * factory, the same one breeding uses for fry.
 */
export function addFish(
  state: SimulationState,
  action: AddFishAction
): ActionResult {
  const { species } = action;

  // Validate species
  if (!FISH_SPECIES_DATA[species]) {
    return {
      state,
      message: `Unknown fish species: ${species}`,
    };
  }

  const speciesData = FISH_SPECIES_DATA[species];

  // Physical stocking ceiling — see MAX_FISH_VOLUME_FRACTION.
  if (!canAddFish(state, species)) {
    const maxMass = getMaxFishMass(state.tank.capacity);
    return {
      state,
      message: `Tank at fish capacity (~${Math.floor(maxMass)}g of fish max)`,
    };
  }

  const fish = createFish({ species, age: 0, stage: 'adult' });

  const newState = produce(state, (draft) => {
    draft.fish.push(fish);

    draft.logs.push(
      createLog(
        draft.tick,
        'user',
        'info',
        `Added ${speciesData.name} (${speciesData.adultMass}g, ${fish.sex})`
      )
    );
  });

  return {
    state: newState,
    message: `Added ${speciesData.name}`,
  };
}

/**
 * Remove a fish from the tank.
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
 * Sell (remove) every fry in the tank at once — the population-management
 * pressure valve for a tank that has bred past what the player wants to
 * keep. The engine is money-free, so "sell" carries no economic effect
 * here; it removes the fry and logs a `fry-sold` event for game-side
 * consumers to price. Adults are untouched.
 */
export function sellFry(state: SimulationState): ActionResult {
  const fryCount = state.fish.reduce((n, f) => n + (f.stage === 'fry' ? 1 : 0), 0);

  if (fryCount === 0) {
    return {
      state,
      message: 'No fry to sell',
    };
  }

  const newState = produce(state, (draft) => {
    draft.fish = draft.fish.filter((f) => f.stage !== 'fry');

    draft.logs.push(
      createLog(
        draft.tick,
        'user',
        'info',
        `Sold ${fryCount} fry`,
        'fry-sold'
      )
    );
  });

  return {
    state: newState,
    message: `Sold ${fryCount} fry`,
  };
}
