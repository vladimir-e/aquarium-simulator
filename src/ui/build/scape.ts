/**
 * Scape model: substrate surface math, what each bed holds for roots, the
 * light tier a species asks for, and the hardscape rows with the surface and
 * pH effect the engine gives each piece.
 */

import {
  getHardscapeName,
  getHardscapeHardnessEffect,
  getHardscapeSurface,
  getSubstrateNutrients,
  PLANT_SPECIES_DATA,
  type HardscapeItem,
  type HardscapeType,
  type PlantSpecies,
  type SubstrateType,
} from '../../simulation/index.js';

export const SUBSTRATE_TYPES: SubstrateType[] = ['none', 'sand', 'gravel', 'aqua_soil'];

export const SUBSTRATE_NAME: Record<SubstrateType, string> = {
  none: 'Bare',
  sand: 'Sand',
  gravel: 'Gravel',
  aqua_soil: 'Aqua Soil',
};

export const HARDSCAPE_TYPES: HardscapeType[] = [
  'neutral_rock',
  'calcite_rock',
  'driftwood',
  'plastic_decoration',
];

/** What a bed holds for the plants that feed through their roots — the consequence of switching it. */
export function substrateConsequence(type: SubstrateType): string {
  if (type === 'none') return 'Bare bottom — nothing for roots, takes no tabs';
  const charged = Object.values(getSubstrateNutrients(type, 1)).some((mg) => mg > 0);
  return charged ? 'Comes charged — feeds roots for months' : 'Starts empty — roots need tabs';
}

export interface HardscapeRow {
  id: string;
  name: string;
  /** Bacteria surface this piece adds (cm²). */
  surface: number;
  /** How it moves pH, in the engine's words; null for inert pieces. */
  effect: string | null;
}

export function hardscapeRows(items: HardscapeItem[]): HardscapeRow[] {
  return items.map((item) => ({
    id: item.id,
    name: getHardscapeName(item.type),
    surface: getHardscapeSurface(item.type),
    effect: getHardscapeHardnessEffect(item.type),
  }));
}

/**
 * The hobby's light tier for a species, read off where its tolerable band opens
 * — the PAR it wants on its leaves, against the hobby's own cuts.
 */
export function lightTier(species: PlantSpecies): 'low' | 'medium' | 'high' {
  const [wants] = PLANT_SPECIES_DATA[species].tolerableLight;
  if (wants < 15) return 'low';
  return wants < 25 ? 'medium' : 'high';
}
