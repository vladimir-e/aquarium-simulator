/**
 * Scape model: substrate surface math, the substrate's plant-compatibility
 * consequence, the substrate-gated plant options, and the hardscape rows with
 * the surface and pH effect the engine gives each piece.
 */

import {
  getHardscapeName,
  getHardscapePHEffect,
  getHardscapeSurface,
  isSubstrateCompatible,
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

const HARDSCAPE_SHORT: Record<HardscapeType, string> = {
  neutral_rock: 'rock',
  calcite_rock: 'calcite',
  driftwood: 'driftwood',
  plastic_decoration: 'decor',
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

export function hardscapeSummary(items: HardscapeItem[]): string {
  const counts = new Map<HardscapeType, number>();
  for (const item of items) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  return [...counts]
    .map(([type, n]) => (n > 1 ? `${HARDSCAPE_SHORT[type]} ×${n}` : HARDSCAPE_SHORT[type]))
    .join(' + ');
}

export function scapeSummary(substrate: SubstrateType, items: HardscapeItem[]): string {
  return items.length
    ? `${SUBSTRATE_NAME[substrate]} + ${hardscapeSummary(items)}`
    : SUBSTRATE_NAME[substrate];
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

export interface PlantOption {
  species: PlantSpecies;
  name: string;
  compatible: boolean;
  /** Demand tier when it can go in; the substrates that would take it when it cannot. */
  hint: string;
  /** What the species wants from the two devices you would set for it. */
  facts: string;
}

/** Every plant species with its compatibility against the current substrate. */
export function plantOptions(substrate: SubstrateType): PlantOption[] {
  return (Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[]).map((species) => {
    const data = PLANT_SPECIES_DATA[species];
    const compatible = isSubstrateCompatible(species, substrate);
    const takes = SUBSTRATE_TYPES.filter((type) => isSubstrateCompatible(species, type)).map(
      (type) => SUBSTRATE_NAME[type].toLowerCase()
    );
    return {
      species,
      name: data.name,
      compatible,
      hint: compatible ? `${data.nutrientDemand} demand` : `needs ${takes.join(' or ')}`,
      facts: `${lightTier(species)} light · ${data.co2Requirement} CO₂`,
    };
  });
}
