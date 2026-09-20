import React from 'react';
import {
  FISH_SPECIES_DATA,
  PLANT_SPECIES_DATA,
  type FishSpecies,
  type PlantSpecies,
} from '../../../simulation/index.js';

/** Everything the roster draws a silhouette for: a species, or the algae. */
export type SpeciesKey = FishSpecies | PlantSpecies | 'algae';

/**
 * One 16 px monoline silhouette per species in the engine's tables, plus the
 * algae. Ink-2 strokes on nothing — the single place this instrument spends
 * personality, and the only way a row says *what* it is before you read it.
 *
 * Every path is drawn in a 16-unit square on the same 1.2 stroke, so a tetra
 * and a carpet plant weigh the same in a column of rows.
 */
const PATHS: Record<SpeciesKey, React.ReactNode> = {
  neon_tetra: (
    <>
      <path d="M2.2 8c2-2.6 5.6-2.6 7.6 0-2 2.6-5.6 2.6-7.6 0z" />
      <path d="M9.8 8 13.6 5.6v4.8z" />
      <path d="M3.4 7.4h5.6" />
    </>
  ),
  betta: (
    <>
      <path d="M2.6 8.2c1.6-2.4 4.4-2.4 6 0-1.6 2.4-4.4 2.4-6 0z" />
      <path d="M8.6 8.2c1.4-2.2 3.4-3.6 4.6-3 1 .6.6 2.2.2 3 .4.8.8 2.4-.2 3-1.2.6-3.2-.8-4.6-3z" />
      <path d="M5.4 10.2c-.2 1.4 0 2.6.6 3.4" />
    </>
  ),
  guppy: (
    <>
      <path d="M2.6 8c1.4-2.2 3.8-2.2 5.2 0-1.4 2.2-3.8 2.2-5.2 0z" />
      <path d="M8 8c1.6-2.8 4-4.4 5.8-4.4-1 2.8-1 6 0 8.8C12 12.4 9.6 10.8 8 8z" />
      <path d="M4.4 9.8c-.2 1.4 0 2.4.6 3" />
    </>
  ),
  angelfish: (
    <>
      <path d="M8 5.4c1.9.9 3 1.7 3 2.6s-1.1 1.7-3 2.6c-1.9-.9-3-1.7-3-2.6s1.1-1.7 3-2.6z" />
      <path d="M7.2 5.6 5.6 1.4M7.2 10.4 5.6 14.6" />
      <path d="M11 8h3.4" />
    </>
  ),
  corydoras: (
    <>
      <path d="M1.8 11.4h9.4c1.8 0 3-1 3.4-2.2-1.2-2.2-3.4-3.4-6-3.4-2.8 0-5.2 2-6.8 5.6z" />
      <path d="M8.4 5.8 7.6 2.8l3 3.4" />
      <path d="M2.4 10.2 1 9.2M2.6 11 1.2 11.6" />
    </>
  ),
  java_fern: (
    <>
      <path d="M8 14.6c-1.4-4.4-3.2-7.4-5.4-9.2" />
      <path d="M8 14.6V2.4" />
      <path d="M8 14.6c1.4-4.4 3.2-7.4 5.4-9.2" />
    </>
  ),
  anubias: (
    <>
      <path d="M8 14.6V8.4" />
      <path d="M8 8.4C5 8 3.6 6.2 3.8 3.6c2.8.2 4.4 1.8 4.2 4.8z" />
      <path d="M8 8.4c3-.4 4.4-2.2 4.2-4.8-2.8.2-4.4 1.8-4.2 4.8z" />
    </>
  ),
  amazon_sword: (
    <>
      <path d="M8 14.6c-1.4-2.8-1.4-7.6 0-11.4 1.4 3.8 1.4 8.6 0 11.4z" />
      <path d="M8 14.6C5.4 12.6 3.4 9 2.8 5.6c2.8 1.6 4.6 4.8 5.2 9z" />
      <path d="M8 14.6c2.6-2 4.6-5.6 5.2-9-2.8 1.6-4.6 4.8-5.2 9z" />
    </>
  ),
  dwarf_hairgrass: (
    <>
      <path d="M1.6 13.6h12.8" />
      <path d="M3.6 13.6c-.4-2.6-.8-4.2-1.4-5.6M6.4 13.6C6.2 9.8 6 7.6 5.6 5.4M9.6 13.6c.2-3.4.6-5.6 1-7.6M12.6 13.6c.4-2.4.8-4 1.4-5.4" />
    </>
  ),
  monte_carlo: (
    <>
      <path d="M1.6 13.6h12.8" />
      <path d="M4.4 13.6V11M8 13.6V9.4M11.6 13.6V11" />
      <circle cx="4.4" cy="9.8" r="1.5" />
      <circle cx="8" cy="8.2" r="1.7" />
      <circle cx="11.6" cy="9.8" r="1.5" />
    </>
  ),
  algae: (
    <>
      <path d="M3.4 14c1.4-1.4 1.8-3.4 1.2-5.8" />
      <path d="M7.6 14c.8-2 .4-4.8-.8-7.2" />
      <path d="M11.8 14c-.2-2.6.6-4.8 2.2-6.6" />
      <path d="M4.6 8.2c-.8-1-1.2-2-1.2-3.2M6.8 6.8c.6-1 .8-2 .8-3.2" />
    </>
  ),
};

/** Drawn for whatever the roster is asked to show before its glyph exists. */
const FALLBACK = <circle cx="8" cy="8" r="5.4" />;

/**
 * Every species the engine can stock, so a species added to a table without a
 * silhouette is a failing test rather than a blank cell.
 */
export const GLYPH_KEYS: SpeciesKey[] = [
  ...(Object.keys(FISH_SPECIES_DATA) as FishSpecies[]),
  ...(Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[]),
  'algae',
];

export function SpeciesGlyph({
  species,
  className = '',
}: {
  species: SpeciesKey;
  className?: string;
}): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`h-4 w-4 shrink-0 text-ink-2 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[species] ?? FALLBACK}
    </svg>
  );
}
