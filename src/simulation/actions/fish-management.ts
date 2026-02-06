/**
 * Fish management actions - add and remove fish from the tank.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { FISH_SPECIES_DATA } from '../state.js';
import { createLog } from '../core/logging.js';
import type { ActionResult, AddFishAction, RemoveFishAction } from './types.js';

/** Generate a unique fish ID */
function generateFishId(): string {
  return `fish_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Add a fish to the tank.
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
  const fishId = generateFishId();
  const sex = Math.random() < 0.5 ? 'male' : 'female';

  const newState = produce(state, (draft) => {
    draft.fish.push({
      id: fishId,
      species,
      mass: speciesData.adultMass,
      health: 100,
      age: 0,
      hunger: 30, // Slightly hungry on arrival
      sex,
    });

    draft.logs.push(
      createLog(
        draft.tick,
        'user',
        'info',
        `Added ${speciesData.name} (${speciesData.adultMass}g, ${sex})`
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
