/**
 * The span every stocked species tolerates, for the readings the engine has no
 * threshold of its own on. Outside it `fish-health` charges a temperature or pH
 * stressor against the species named here, so this is the tank's own band and
 * not a comfort range invented for a panel. An unstocked tank has none.
 */

import { FISH_SPECIES_DATA, type FishSpeciesData, type SimulationState } from '../../simulation/index.js';
import type { Status } from './status.js';

export interface StockedBand {
  min: number;
  max: number;
  minSpecies: string;
  maxSpecies: string;
}

export function stockedBand(
  state: SimulationState,
  range: (data: FishSpeciesData) => [number, number]
): StockedBand | null {
  let band: StockedBand | null = null;
  for (const fish of state.fish) {
    const data = FISH_SPECIES_DATA[fish.species];
    const [min, max] = range(data);
    if (band === null) {
      band = { min, max, minSpecies: data.name, maxSpecies: data.name };
      continue;
    }
    if (min > band.min) band = { ...band, min, minSpecies: data.name };
    if (max < band.max) band = { ...band, max, maxSpecies: data.name };
  }
  return band;
}

export function toleranceStatus(value: number, band: StockedBand | null): Status {
  if (band === null) return 'neutral';
  return value < band.min || value > band.max ? 'warn' : 'neutral';
}
