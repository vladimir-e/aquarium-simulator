/**
 * Hardscape equipment helper functions.
 * Provides surface area calculations and metadata for hardscape items.
 */

import type { HardscapeType, HardscapeItem } from '../state.js';
import { HARDSCAPE_SURFACE } from '../state.js';

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
