/**
 * Hardscape equipment helper functions.
 * Provides surface area calculations and metadata for hardscape items.
 */

export type HardscapeType = 'neutral_rock' | 'calcite_rock' | 'driftwood' | 'plastic_decoration';

export interface HardscapeItem {
  /** Unique ID for this item (for add/remove operations) */
  id: string;
  /** Type determines surface area and pH effect (future) */
  type: HardscapeType;
}

export interface Hardscape {
  /** Array of hardscape items in the tank */
  items: HardscapeItem[];
}

export const DEFAULT_HARDSCAPE: Hardscape = {
  items: [],
};

/** Hardscape bacteria surface area by type (cm²) */
export const HARDSCAPE_SURFACE: Record<HardscapeType, number> = {
  neutral_rock: 400,
  calcite_rock: 400,
  driftwood: 650,
  plastic_decoration: 100,
};

/**
 * Get bacteria surface area for a hardscape type (cm²).
 */
export function getHardscapeSurface(type: HardscapeType): number {
  return HARDSCAPE_SURFACE[type];
}

/**
 * Calculate total bacteria surface from all hardscape items.
 */
export function calculateHardscapeTotalSurface(items: HardscapeItem[]): number {
  return items.reduce((total, item) => {
    return total + getHardscapeSurface(item.type);
  }, 0);
}

/**
 * Get human-readable name for hardscape type.
 */
export function getHardscapeName(type: HardscapeType): string {
  const names: Record<HardscapeType, string> = {
    neutral_rock: 'Neutral Rock',
    calcite_rock: 'Calcite Rock',
    driftwood: 'Driftwood',
    plastic_decoration: 'Plastic Decoration',
  };
  return names[type];
}

/**
 * Get pH effect description (for future implementation).
 */
export function getHardscapePHEffect(type: HardscapeType): string | null {
  const effects: Record<HardscapeType, string | null> = {
    neutral_rock: null,
    calcite_rock: 'Raises pH',
    driftwood: 'Lowers pH',
    plastic_decoration: null,
  };
  return effects[type];
}
