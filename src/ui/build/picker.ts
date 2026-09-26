/**
 * The construction pickers: every species the engine can stock, what it asks
 * of the tank, and how this tank would take it. A refusal is the engine's own
 * message — the capacity line and the substrate reason come from the actions
 * that would reject the commit, never from a paraphrase of them here.
 */

import {
  checkFishCapacity,
  checkPlantFootprint,
  FISH_SPECIES_DATA,
  getDgh,
  getMaxFishMass,
  getPh,
  getSubstrateIncompatibilityReason,
  isSubstrateCompatible,
  PLANT_SPECIES_DATA,
  totalFishMass,
  type FishSpeciesData,
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

/** Where the tank sits outside a band the species is stressed beyond, and by how many band-widths. */
interface Miss {
  text: string;
  by: number;
}

function outside(value: number, [low, high]: [number, number]): number {
  const span = high - low || 1;
  return value < low ? (low - value) / span : value > high ? (value - high) / span : 0;
}

/**
 * Every band the engine stresses this species past — temperature, pH, GH and
 * flow — read against the tank as it stands, the widest miss first.
 */
function misses(state: SimulationState, data: FishSpeciesData, units: UnitSystem): Miss[] {
  const r = state.resources;
  const temperature = r.temperature;
  const ph = getPh(r);
  const gh = getDgh(r.gh, r.water);
  const turnover = r.water > 0 ? r.flow / r.water : 0;
  const [phLow, phHigh] = data.phRange;
  const [ghLow, ghHigh] = data.ghRange;

  return [
    {
      text: `wants ${formatTemperatureRange(data.temperatureRange, units)} — tank holds ${formatTemperature(temperature, units)}`,
      by: outside(temperature, data.temperatureRange),
    },
    {
      text: `wants pH ${phLow.toFixed(1)}–${phHigh.toFixed(1)} — tank holds ${ph.toFixed(2)}`,
      by: outside(ph, data.phRange),
    },
    {
      text: `wants GH ${ghLow}–${ghHigh} — tank holds ${gh.toFixed(1)}`,
      by: outside(gh, data.ghRange),
    },
    {
      text: `wants flow to ${data.maxTurnover} ×/h — tank turns ${turnover.toFixed(1)} ×/h`,
      by: turnover > data.maxTurnover ? (turnover - data.maxTurnover) / data.maxTurnover : 0,
    },
  ]
    .filter((miss) => miss.by > 0)
    .sort((a, b) => b.by - a.by);
}

function fishOption(
  state: SimulationState,
  species: FishSpecies,
  count: number,
  units: UnitSystem
): PickerOption {
  const data = FISH_SPECIES_DATA[species];
  const [phLow, phHigh] = data.phRange;
  const [ghLow, ghHigh] = data.ghRange;
  const [worst] = misses(state, data, units);

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
      `GH ${ghLow}–${ghHigh} · ` +
      `flow to ${data.maxTurnover} ×/h`,
    fit: worst ? worst.text : `in band · bioload ${load.ratio.toFixed(1)}× after`,
    status: worst ? 'warn' : load.status === 'ok' ? 'neutral' : load.status,
    headroom,
    refusal: capacity.ok ? null : capacity.message,
  };
}

function plantOption(state: SimulationState, species: PlantSpecies): PickerOption {
  const data = PLANT_SPECIES_DATA[species];
  const substrate = state.equipment.substrate.type;
  const compatible = isSubstrateCompatible(species, substrate);
  const footprint = checkPlantFootprint(state.plants, species, state.tank.capacity);
  const headroom = Math.floor(footprint.free / footprint.needed);
  const reason = getSubstrateIncompatibilityReason(species, substrate);

  return {
    species,
    name: data.name,
    demand: `${data.nutrientDemand} demand · ${lightTier(species)} light · ${data.co2Requirement} CO₂`,
    fit: compatible ? `${Math.floor(footprint.free)} cm² of floor free` : (reason ?? ''),
    status: compatible && footprint.ok ? 'neutral' : 'warn',
    headroom: compatible ? headroom : 0,
    refusal: !compatible ? reason : footprint.ok ? null : footprint.message,
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
