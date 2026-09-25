/**
 * Hardscape equipment: surface for the biofilm, and what each piece does to
 * the water's hardness. Calcite dissolves into Ca²⁺ and carbonate, adding GH
 * and KH alike, faster the more acidic the water. Driftwood leaches tannic
 * acid that spends KH, tapering as its tannins run out.
 */

import { produce } from 'immer';
import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import { type WaterChemistryConfig, waterChemistryDefaults } from '../config/water-chemistry.js';
import { getPh } from '../core/carbonate.js';

export type HardscapeType = 'neutral_rock' | 'calcite_rock' | 'driftwood' | 'plastic_decoration';

export interface HardscapeItem {
  /** Unique ID for this item (for add/remove operations) */
  id: string;
  /** Type determines surface area and what the piece does to KH */
  type: HardscapeType;
  /** KH the piece's tannic acid can still neutralise, mg of CaCO3 — leaches out and never refills */
  tannins: number;
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

/** Tannins a fresh piece carries, as the mg of CaCO3 its acid can neutralise. */
export const HARDSCAPE_TANNINS: Record<HardscapeType, number> = {
  neutral_rock: 0,
  calcite_rock: 0,
  driftwood: 3000,
  plastic_decoration: 0,
};

/** A piece as a keeper names it: what it is, not what is left in it. */
export type HardscapeItemSpec = Pick<HardscapeItem, 'id' | 'type'>;

/** A piece of this type straight out of the shop. */
export function createHardscapeItem(id: string, type: HardscapeType): HardscapeItem {
  return { id, type, tannins: HARDSCAPE_TANNINS[type] };
}

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

export interface HardscapeCapacityResult {
  /** True if one more piece fits in the tank's slots. */
  ok: boolean;
  /** Rejection message when `!ok`; empty string when it fits. */
  message: string;
}

/**
 * Single source of truth for the hardscape slot ceiling — the comparison and
 * its rejection message, so an "add" the tank has no room for is refused in
 * one set of words wherever it is attempted.
 */
export function checkHardscapeCapacity(
  items: HardscapeItem[],
  slots: number
): HardscapeCapacityResult {
  const ok = items.length < slots;
  return { ok, message: ok ? '' : `Tank at hardscape capacity (${slots} slots max)` };
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
 * What a piece does to the water's hardness, in words.
 */
export function getHardscapeHardnessEffect(type: HardscapeType): string | null {
  const effects: Record<HardscapeType, string | null> = {
    neutral_rock: null,
    calcite_rock: 'Adds KH and GH',
    driftwood: 'Spends KH',
    plastic_decoration: null,
  };
  return effects[type];
}

/**
 * mg of CaCO3 the calcite rocks dissolve this tick — proportional to [H⁺], one
 * at pH 7. Each mg lands twice: as GH from the calcium, as KH from the carbonate.
 */
export function calculateCalciteDissolution(
  rocks: number,
  ph: number,
  config: WaterChemistryConfig = waterChemistryDefaults
): number {
  return rocks * config.calciteDissolutionRate * Math.pow(10, 7 - ph);
}

/**
 * mg of CaCO3 a piece's tannic acid neutralises this tick — a fixed fraction
 * of the tannins it has left, so the acid tapers as the wood is spent.
 */
export function calculateTanninLeach(
  tannins: number,
  config: WaterChemistryConfig = waterChemistryDefaults
): number {
  if (tannins <= 0) return 0;
  return Math.min(tannins, tannins * config.tanninLeachRate);
}

export interface HardscapeUpdateResult {
  state: SimulationState;
  effects: Effect[];
}

export function hardscapeUpdate(
  state: SimulationState,
  config: WaterChemistryConfig = waterChemistryDefaults
): HardscapeUpdateResult {
  const { items } = state.equipment.hardscape;
  if (state.resources.water <= 0 || items.length === 0) return { state, effects: [] };

  const rocks = items.filter((item) => item.type === 'calcite_rock').length;
  const dissolved = calculateCalciteDissolution(rocks, getPh(state.resources), config);
  const leached = items.map((item) => calculateTanninLeach(item.tannins, config));
  const acid = leached.reduce((sum, mg) => sum + mg, 0);

  const effects: Effect[] = [];
  if (dissolved > 0) {
    effects.push(
      { tier: 'immediate', resource: 'kh', delta: dissolved, source: 'calcite-dissolution' },
      { tier: 'immediate', resource: 'gh', delta: dissolved, source: 'calcite-dissolution' }
    );
  }
  if (acid > 0) {
    effects.push({ tier: 'immediate', resource: 'kh', delta: -acid, source: 'driftwood-acid' });
  }

  return {
    state:
      acid > 0
        ? produce(state, (draft) => {
            draft.equipment.hardscape.items.forEach((item, i) => {
              item.tannins -= leached[i];
            });
          })
        : state,
    effects,
  };
}
