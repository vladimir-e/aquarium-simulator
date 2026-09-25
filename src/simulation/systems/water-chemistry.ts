/**
 * Water Chemistry System - what the scape does to alkalinity.
 * Runs in PASSIVE tier.
 *
 * Calcite rock dissolves and adds KH, faster the more acidic the water.
 * Driftwood leaches tannic acid that spends KH at a steady rate. An aqua soil
 * bed takes up a share of the tank's KH every hour. pH is never stored: it is
 * read off CO₂ and KH wherever it is needed (see `core/carbonate.ts`).
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { HardscapeItem } from '../equipment/hardscape.js';
import type { SubstrateType } from '../equipment/substrate.js';
import type { System } from './types.js';
import type { TunableConfig } from '../config/index.js';
import { type WaterChemistryConfig, waterChemistryDefaults } from '../config/water-chemistry.js';
import { getPh } from '../core/carbonate.js';

function countOf(items: HardscapeItem[], type: HardscapeItem['type']): number {
  return items.filter((item) => item.type === type).length;
}

/** mg of CaCO3 the calcite rocks dissolve this tick — proportional to [H⁺], one at pH 7. */
export function calculateCalciteDissolution(
  rocks: number,
  ph: number,
  config: WaterChemistryConfig = waterChemistryDefaults
): number {
  return rocks * config.calciteDissolutionRate * Math.pow(10, 7 - ph);
}

/** mg of CaCO3 the driftwood's acid neutralises this tick. */
export function calculateDriftwoodAcid(
  pieces: number,
  config: WaterChemistryConfig = waterChemistryDefaults
): number {
  return pieces * config.driftwoodAcidRate;
}

/** mg of CaCO3 the bed takes out of the water this tick. */
export function calculateSubstrateKhUptake(
  khMass: number,
  substrate: SubstrateType,
  config: WaterChemistryConfig = waterChemistryDefaults
): number {
  return substrate === 'aqua_soil' ? khMass * config.aquaSoilKhUptake : 0;
}

export const waterChemistrySystem: System = {
  id: 'water-chemistry',
  tier: 'passive',

  update(state: SimulationState, config: TunableConfig): Effect[] {
    const { resources, equipment } = state;
    if (resources.water <= 0) return [];

    const chemistry = config.waterChemistry;
    const { items } = equipment.hardscape;
    const flows: Array<[source: string, delta: number]> = [
      [
        'calcite-dissolution',
        calculateCalciteDissolution(countOf(items, 'calcite_rock'), getPh(resources), chemistry),
      ],
      ['driftwood-acid', -calculateDriftwoodAcid(countOf(items, 'driftwood'), chemistry)],
      [
        'substrate-buffer',
        -calculateSubstrateKhUptake(resources.kh, equipment.substrate.type, chemistry),
      ],
    ];

    return flows
      .filter(([, delta]) => delta !== 0)
      .map(([source, delta]) => ({ tier: 'passive', resource: 'kh', delta, source }));
  },
};
