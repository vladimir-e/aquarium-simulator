/**
 * Scape & Flora column model: substrate surface math, the substrate's
 * plant-compatibility consequence, and the substrate-gated plant options.
 * Pure — the surface-area math and gating live only in Build.
 */

import {
  isSubstrateCompatible,
  PLANT_SPECIES_DATA,
  SUBSTRATE_SURFACE_PER_LITER,
  type PlantSpecies,
  type SubstrateType,
} from '../../simulation/index.js';
import { gallonsToLiters } from '../utils/units';
import type { UnitSystem } from '../hooks/useUnits';

export interface SubstrateSurface {
  /** Bacteria surface per display unit (cm²/gal imperial, cm²/L metric). */
  perUnit: number;
  unitLabel: string;
  /** Bacteria surface across the whole tank (cm²). */
  total: number;
}

export function substrateSurface(
  type: SubstrateType,
  tankCapacity: number,
  units: UnitSystem
): SubstrateSurface {
  const perLiter = SUBSTRATE_SURFACE_PER_LITER[type];
  const perUnit = units === 'imperial' ? Math.round(perLiter * gallonsToLiters(1)) : perLiter;
  return {
    perUnit,
    unitLabel: units === 'imperial' ? 'cm²/gal' : 'cm²/L',
    total: perLiter * tankCapacity,
  };
}

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

export interface PlantOption {
  species: PlantSpecies;
  name: string;
  compatible: boolean;
}

/** Every plant species with its compatibility against the current substrate. */
export function plantOptions(substrate: SubstrateType): PlantOption[] {
  return (Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[]).map((species) => ({
    species,
    name: PLANT_SPECIES_DATA[species].name,
    compatible: isSubstrateCompatible(species, substrate),
  }));
}
