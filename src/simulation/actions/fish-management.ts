/**
 * Fish management actions - add and remove fish from the tank.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { FISH_SPECIES_DATA } from '../state.js';
import { createLog } from '../core/logging.js';
import { createFish } from '../livestock/create-fish.js';
import type { ActionResult, AddFishAction, RemoveFishAction } from './types.js';

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
