import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  calculateCalciteDissolution,
  calculateDriftwoodAcid,
  calculateSubstrateKhUptake,
  waterChemistrySystem,
} from './water-chemistry.js';
import { createSimulation, type SimulationState } from '../state.js';
import type { HardscapeType } from '../equipment/hardscape.js';
import type { SubstrateType } from '../equipment/substrate.js';
import { DEFAULT_CONFIG } from '../config/index.js';

describe('calculateCalciteDissolution', () => {
  it('scales with the number of rocks', () => {
    expect(calculateCalciteDissolution(3, 7)).toBeCloseTo(3 * calculateCalciteDissolution(1, 7), 10);
    expect(calculateCalciteDissolution(0, 6)).toBe(0);
  });

  it('runs ten times faster a pH unit lower', () => {
    expect(calculateCalciteDissolution(1, 6.5)).toBeCloseTo(10 * calculateCalciteDissolution(1, 7.5), 10);
  });
});

describe('calculateDriftwoodAcid', () => {
  it('scales with the number of pieces', () => {
    expect(calculateDriftwoodAcid(4)).toBeCloseTo(4 * calculateDriftwoodAcid(1), 10);
    expect(calculateDriftwoodAcid(0)).toBe(0);
  });
});

describe('calculateSubstrateKhUptake', () => {
  it('takes a share of the KH on aqua soil, and nothing on an inert bed', () => {
    expect(calculateSubstrateKhUptake(2000, 'aqua_soil')).toBeCloseTo(
      2 * calculateSubstrateKhUptake(1000, 'aqua_soil'),
      10
    );
    for (const bed of ['none', 'sand', 'gravel'] as SubstrateType[]) {
      expect(calculateSubstrateKhUptake(2000, bed)).toBe(0);
    }
  });
});

describe('waterChemistrySystem', () => {
  const tank = (hardscape: HardscapeType[], substrate: SubstrateType = 'gravel'): SimulationState =>
    createSimulation({
      tankCapacity: 100,
      tapKh: 4,
      substrate: { type: substrate },
      hardscape: { items: hardscape.map((type, i) => ({ id: String(i), type })) },
    });

  const khDelta = (state: SimulationState): number =>
    waterChemistrySystem
      .update(state, DEFAULT_CONFIG)
      .filter((effect) => effect.resource === 'kh')
      .reduce((sum, effect) => sum + effect.delta, 0);

  it('leaves KH alone in an inert tank', () => {
    expect(khDelta(tank(['neutral_rock', 'plastic_decoration']))).toBe(0);
  });

  it('adds KH for calcite and spends it for driftwood and soil', () => {
    expect(khDelta(tank(['calcite_rock']))).toBeGreaterThan(0);
    expect(khDelta(tank(['driftwood']))).toBeLessThan(0);
    expect(khDelta(tank([], 'aqua_soil'))).toBeLessThan(0);
  });

  it('does nothing in a drained tank', () => {
    const drained = produce(tank(['calcite_rock', 'driftwood'], 'aqua_soil'), (draft) => {
      draft.resources.water = 0;
    });
    expect(waterChemistrySystem.update(drained, DEFAULT_CONFIG)).toEqual([]);
  });
});
