/**
 * The construction pickers: every species the engine can stock, what it asks
 * of the tank, and how this tank would take it. A refusal is the engine's own
 * message — the capacity line and the substrate reason come from the actions
 * that would reject the commit, never from a paraphrase of them here.
 */

import {
  checkFishCapacity,
  checkPlantCapacity,
  FISH_SPECIES_DATA,
  getMaxFishMass,
  getMaxPlants,
  getSubstrateIncompatibilityReason,
  isSubstrateCompatible,
  PLANT_SPECIES_DATA,
  totalFishMass,
  type FishSpecies,
  type PlantSpecies,
  type SimulationState,
} from '../../simulation/index.js';
import type { Status } from '../run';
import { bioload } from './stocking.js';
import { lightTier } from './scape.js';
import {
  formatTemperature,
  formatTemperatureRange,
  type UnitSystem,
} from '../utils/units.js';

export type PickerKind = 'fish' | 'plant';

export interface PickerOption {
  species: FishSpecies | PlantSpecies;
  name: string;
  /** What the species wants — the bands a heater and a light get set by. */
  demand: string;
  /** How this tank suits it, in the tank's own figures. */
  fit: string;
  status: Status;
  /** How many more of these the tank can physically take. */
  headroom: number;
  /** Why none can go in, in the engine's words. */
  refusal: string | null;
}

export const FISH_SPECIES: FishSpecies[] = Object.keys(FISH_SPECIES_DATA) as FishSpecies[];
export const PLANT_SPECIES: PlantSpecies[] = Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[];

function fishOption(
  state: SimulationState,
  species: FishSpecies,
  count: number,
  units: UnitSystem
): PickerOption {
  const data = FISH_SPECIES_DATA[species];
  const [phLow, phHigh] = data.phRange;
  const [tempLow, tempHigh] = data.temperatureRange;
  const temperature = state.resources.temperature;
  const outside = temperature < tempLow || temperature > tempHigh;

  const capacity = checkFishCapacity(state.fish, state.tank.capacity, species);
  const headroom = Math.max(
    0,
    Math.floor((getMaxFishMass(state.tank.capacity) - totalFishMass(state.fish)) / data.adultMass)
  );

  const load = bioload(state.fish, state.tank.capacity, { species, count });

  return {
    species,
    name: data.name,
    demand:
      `${data.adultMass} g adult · pH ${phLow.toFixed(1)}–${phHigh.toFixed(1)} · ` +
      `flow to ${data.maxTurnover} ×/h`,
    fit: outside
      ? `wants ${formatTemperatureRange(data.temperatureRange, units)} — tank holds ` +
        `${formatTemperature(temperature, units)}`
      : `in band at ${formatTemperature(temperature, units)} · ` +
        `bioload ${load.ratio.toFixed(1)}× after`,
    status: outside ? 'warn' : load.status === 'ok' ? 'neutral' : load.status,
    headroom,
    refusal: capacity.ok ? null : capacity.message,
  };
}

function plantOption(state: SimulationState, species: PlantSpecies): PickerOption {
  const data = PLANT_SPECIES_DATA[species];
  const substrate = state.equipment.substrate.type;
  const compatible = isSubstrateCompatible(species, substrate);
  const max = getMaxPlants(state.tank.capacity);
  const free = Math.max(0, max - state.plants.length);
  const capacity = checkPlantCapacity(state.plants, state.tank.capacity);
  const reason = getSubstrateIncompatibilityReason(species, substrate);

  return {
    species,
    name: data.name,
    demand: `${data.nutrientDemand} demand · ${lightTier(species)} light · ${data.co2Requirement} CO₂`,
    fit: compatible ? `${free} of ${max} slots free` : (reason ?? ''),
    status: compatible && free > 0 ? 'neutral' : 'warn',
    headroom: compatible ? free : 0,
    refusal: !compatible ? reason : capacity.ok ? null : capacity.message,
  };
}

/** Every species of one kind, read against the tank as it stands. */
export function pickerOptions(
  kind: PickerKind,
  state: SimulationState,
  count: number,
  units: UnitSystem
): PickerOption[] {
  return kind === 'fish'
    ? FISH_SPECIES.map((species) => fishOption(state, species, count, units))
    : PLANT_SPECIES.map((species) => plantOption(state, species));
}
