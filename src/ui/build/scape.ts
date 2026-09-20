/**
 * Scape model: substrate surface math, the substrate's plant-compatibility
 * consequence, the light tier a species asks for, and the hardscape rows with
 * the surface and pH effect the engine gives each piece.
 */

import {
  getHardscapeName,
  getHardscapePHEffect,
  getHardscapeSurface,
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

/** What a substrate lets you plant — the consequence of switching it. */
export function substrateConsequence(type: SubstrateType): string {
  switch (type) {
    case 'none':
      return 'Bare bottom — epiphytes only';
    case 'gravel':
      return 'Inert — epiphytes only';
    case 'sand':
      return 'Roots sand plants + epiphytes';
    case 'aqua_soil':
      return 'Nutrient-rich — supports every plant';
  }
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
    effect: getHardscapePHEffect(item.type),
  }));
}

/**
 * The hobby's light tier for a species, read off where its tolerable band opens
 * — the PAR it wants at the substrate, against the hobby's own cuts.
 */
export function lightTier(species: PlantSpecies): 'low' | 'medium' | 'high' {
  const [wants] = PLANT_SPECIES_DATA[species].tolerableLight;
  if (wants < 15) return 'low';
  return wants < 25 ? 'medium' : 'high';
}
