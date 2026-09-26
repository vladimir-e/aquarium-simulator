/**
 * Plant management actions - add and remove plants from the tank.
 */

import { produce } from 'immer';
import { calculateFloorArea, type Plant, type SimulationState } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
import type { SubstrateType } from '../equipment/substrate.js';
import { PLANT_SPECIES_DATA, growthFormOf } from '../plants/species.js';
import { plantedFootprint } from '../plants/canopy.js';
import { createLog } from '../core/logging.js';
import { createPlant, DEFAULT_PLANT_SIZE } from '../plants/create-plant.js';
import { disturbBed } from '../equipment/index.js';
import { plantsDefaults, type PlantsConfig } from '../config/plants.js';
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
      : `Not enough floor: ${Math.round(free)} cm² free, ${PLANT_SPECIES_DATA[species].name} needs ${needed}`,
    free,
    needed,
  };
}

export function canAddPlant(state: SimulationState, species: PlantSpecies): boolean {
  return checkPlantFootprint(state.plants, species, state.tank.capacity).ok;
}

/**
 * Check if a plant species is compatible with the current substrate.
 * - Plants with 'none' substrate requirement can always be added (attach to hardscape)
 * - Plants with 'sand' requirement need sand or aqua_soil substrate
 * - Plants with 'aqua_soil' requirement need aqua_soil substrate
 */
export function isSubstrateCompatible(
  plantSpecies: PlantSpecies,
  substrateType: SubstrateType
): boolean {
  const requirement = PLANT_SPECIES_DATA[plantSpecies].substrateRequirement;

  switch (requirement) {
    case 'none':
      // Epiphytes attach to hardscape, no substrate needed
      return true;
    case 'sand':
      // Needs at least sand, aqua_soil also works
      return substrateType === 'sand' || substrateType === 'aqua_soil';
    case 'aqua_soil':
      // Needs nutrient-rich substrate
      return substrateType === 'aqua_soil';
    default:
      return false;
  }
}

/**
 * Get a human-readable explanation of why a plant is incompatible.
 */
export function getSubstrateIncompatibilityReason(
  plantSpecies: PlantSpecies,
  substrateType: SubstrateType
): string | null {
  if (isSubstrateCompatible(plantSpecies, substrateType)) {
    return null;
  }

  const plantData = PLANT_SPECIES_DATA[plantSpecies];
  const requirement = plantData.substrateRequirement;

  if (requirement === 'sand') {
    return `${plantData.name} requires sand or aqua soil substrate`;
  }
  if (requirement === 'aqua_soil') {
    return `${plantData.name} requires nutrient-rich aqua soil substrate`;
  }
  return `${plantData.name} is not compatible with current substrate`;
}

/**
 * Add a plant to the tank, at a size between the death floor and a full unit.
 */
export function addPlant(
  state: SimulationState,
  action: AddPlantAction,
  plantsConfig: PlantsConfig = plantsDefaults
): ActionResult {
  const { species, initialSize = DEFAULT_PLANT_SIZE } = action;

  // Validate species
  if (!PLANT_SPECIES_DATA[species]) {
    return {
      state,
      message: `Unknown plant species: ${species}`,
    };
  }

  const minSize = plantsConfig.deathSizeThreshold;
  if (!(initialSize > 0 && initialSize >= minSize && initialSize <= 100)) {
    return {
      state,
      message: `Invalid initial size: ${initialSize}% (must be ${minSize}–100%)`,
    };
  }

  const footprint = checkPlantFootprint(state.plants, species, state.tank.capacity);
  if (!footprint.ok) {
    return { state, message: footprint.message };
  }

  // Check substrate compatibility
  const substrateType = state.equipment.substrate.type;
  if (!isSubstrateCompatible(species, substrateType)) {
    const reason = getSubstrateIncompatibilityReason(species, substrateType);
    return {
      state,
      message: reason ?? 'Plant is not compatible with current substrate',
    };
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
    if (plantData.substrateRequirement !== 'none') {
      disturbBed(
        draft,
        growthFormOf(plant.species).footprintCm2 / calculateFloorArea(draft.tank.capacity)
      );
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
