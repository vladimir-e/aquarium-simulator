/**
 * Plant management actions - add and remove plants from the tank.
 */

import { produce } from 'immer';
import type { SimulationState, PlantSpecies, SubstrateType } from '../state.js';
import { PLANT_SPECIES_DATA } from '../state.js';
import { createLog } from '../core/logging.js';
import type { ActionResult, AddPlantAction, RemovePlantAction } from './types.js';

/** Liters per 5 gallons (basis for plant limit calculation) */
const LITERS_PER_5_GALLONS = 18.927;

/** Plants allowed per 5 gallons */
const PLANTS_PER_5_GALLONS = 3;

/**
 * Calculate maximum number of plants allowed for a given tank capacity.
 * Limit is 3 plants per 5 gallons, minimum 1 plant.
 */
export function getMaxPlants(tankCapacity: number): number {
  if (tankCapacity <= 0) return 0;
  // 3 plants per 5 gallons, minimum 1
  return Math.max(1, Math.floor((tankCapacity / LITERS_PER_5_GALLONS) * PLANTS_PER_5_GALLONS));
}

/**
 * Check if more plants can be added to the tank.
 */
export function canAddPlant(state: SimulationState): boolean {
  const maxPlants = getMaxPlants(state.tank.capacity);
  return state.plants.length < maxPlants;
}

/** Generate a unique plant ID */
function generatePlantId(): string {
  return `plant_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Check if a plant species is compatible with the current substrate.
 * - Plants with 'none' substrate requirement can always be added (attach to hardscape)
 * - Plants with 'sand' requirement need sand or aqua_soil substrate
 * - Plants with 'aqua_soil' requirement need aqua_soil substrate
 */
export function isSubstrateCompatible(
  plantSpecies: PlantSpecies,
  substratetype: SubstrateType
): boolean {
  const requirement = PLANT_SPECIES_DATA[plantSpecies].substrateRequirement;

  switch (requirement) {
    case 'none':
      // Epiphytes attach to hardscape, no substrate needed
      return true;
    case 'sand':
      // Needs at least sand, aqua_soil also works
      return substratetype === 'sand' || substratetype === 'aqua_soil';
    case 'aqua_soil':
      // Needs nutrient-rich substrate
      return substratetype === 'aqua_soil';
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
 * Add a plant to the tank.
 */
export function addPlant(
  state: SimulationState,
  action: AddPlantAction
): ActionResult {
  const { species, initialSize = 50 } = action;

  // Validate species
  if (!PLANT_SPECIES_DATA[species]) {
    return {
      state,
      message: `Unknown plant species: ${species}`,
    };
  }

  // Check plant capacity
  const maxPlants = getMaxPlants(state.tank.capacity);
  if (state.plants.length >= maxPlants) {
    return {
      state,
      message: `Tank at plant capacity (${maxPlants} plants max)`,
    };
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
  const plantId = generatePlantId();

  const newState = produce(state, (draft) => {
    draft.plants.push({
      id: plantId,
      species,
      size: initialSize,
    });

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
 * Remove a plant from the tank.
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
