/**
 * Plant management actions - add and remove plants from the tank.
 */

import { produce } from 'immer';
import { calculateFloorArea, type Plant, type SimulationState } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
import { PLANT_SPECIES_DATA, growthFormOf } from '../plants/species.js';
import { floorShare, plantedFootprint } from '../plants/canopy.js';
import { createLog } from '../core/logging.js';
import { createPlant, DEFAULT_PLANT_SIZE, isPlantableSize, MIN_PLANTABLE_SIZE } from '../plants/create-plant.js';
import { disturbBed } from '../equipment/index.js';
import type { ActionResult, AddPlantAction, RemovePlantAction } from './types.js';

export interface PlantFootprintResult {
  ok: boolean;
  /** Rejection message when `!ok`; empty string when it fits. */
  message: string;
  /** Floor the planting leaves free, cm². */
  free: number;
  /** Floor one unit of the species claims, cm². */
  needed: number;
}

/**
 * Single source of truth for the {@link addPlant} floor budget — the comparison
 * and its rejection message. A unit fits when its footprint fits the floor the
 * planting leaves free; an epiphyte on the rock claims its plan view like any
 * other. Mirrors {@link checkFishCapacity}.
 */
export function checkPlantFootprint(
  plants: readonly Pick<Plant, 'species'>[],
  species: PlantSpecies,
  tankCapacity: number
): PlantFootprintResult {
  const free = Math.max(0, calculateFloorArea(tankCapacity) - plantedFootprint(plants));
  const needed = growthFormOf(species).footprintCm2;
  const ok = needed <= free;
  return {
    ok,
    message: ok
      ? ''
      : `Not enough floor: ${Math.floor(free)} cm² free, ${PLANT_SPECIES_DATA[species].name} needs ${needed}`,
    free,
    needed,
  };
}

export function canAddPlant(state: SimulationState, species: PlantSpecies): boolean {
  return checkPlantFootprint(state.plants, species, state.tank.capacity).ok;
}

/**
 * Add a plant to the tank, at a size between `MIN_PLANTABLE_SIZE` and a full unit.
 */
export function addPlant(state: SimulationState, action: AddPlantAction): ActionResult {
  const { species, initialSize = DEFAULT_PLANT_SIZE } = action;

  // Validate species
  if (!PLANT_SPECIES_DATA[species]) {
    return {
      state,
      message: `Unknown plant species: ${species}`,
    };
  }

  if (!isPlantableSize(initialSize)) {
    return {
      state,
      message: `Invalid initial size: ${initialSize}% (must be ${MIN_PLANTABLE_SIZE}–100%)`,
    };
  }

  const footprint = checkPlantFootprint(state.plants, species, state.tank.capacity);
  if (!footprint.ok) {
    return { state, message: footprint.message };
  }

  const plantData = PLANT_SPECIES_DATA[species];

  const newState = produce(state, (draft) => {
    draft.plants.push(createPlant({ species, size: initialSize, rng: draft.rng }));

    draft.logs.push(
      createLog(
        draft.tick,
        'user',
        'info',
        `Added ${plantData.name} (${initialSize}% size)`
      )
    );
  });

  return {
    state: newState,
    message: `Added ${plantData.name}`,
  };
}

/**
 * Remove a plant from the tank. Uprooting one disturbs its footprint's share of
 * the bed; an epiphyte comes off the hardscape without touching it.
 */
export function removePlant(
  state: SimulationState,
  action: RemovePlantAction
): ActionResult {
  const { plantId } = action;

  // Find the plant
  const plantIndex = state.plants.findIndex((p) => p.id === plantId);
  if (plantIndex === -1) {
    return {
      state,
      message: 'Plant not found',
    };
  }

  const plant = state.plants[plantIndex];
  const plantData = PLANT_SPECIES_DATA[plant.species];

  const newState = produce(state, (draft) => {
    draft.plants.splice(plantIndex, 1);
    if (plantData.growthForm !== 'attached') {
      disturbBed(draft, floorShare(plant.species, draft.tank.capacity));
    }

    draft.logs.push(
      createLog(
        draft.tick,
        'user',
        'info',
        `Removed ${plantData.name}`
      )
    );
  });

  return {
    state: newState,
    message: `Removed ${plantData.name}`,
  };
}
