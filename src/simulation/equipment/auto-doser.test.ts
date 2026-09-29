import { describe, it, expect } from 'vitest';
import {
  shouldDose,
  shouldResetDosedToday,
  autoDoserUpdate,
  type AutoDoser,
} from './auto-doser.js';
import { createSimulation, type SimulationState } from '../state.js';
import { NUTRIENTS, nutrientsDefaults, type FertilizerFormula } from '../config/nutrients.js';

const FORMULA = nutrientsDefaults.fertilizerFormula;

function tankAt(tick: number, doser: Partial<AutoDoser> = {}): SimulationState {
  const state = createSimulation({ tankCapacity: 40 });
  return {
    ...state,
    tick,
    equipment: {
      ...state.equipment,
      autoDoser: {
        enabled: true,
        doseAmountMl: 2,
        startHour: 8,
        dosedToday: false,
        ...doser,
      },
    },
  };
}

describe('shouldDose', () => {
  it('fires only at its hour, once a day', () => {
    expect(shouldDose(8, 8, false)).toBe(true);
    expect(shouldDose(8, 8, true)).toBe(false);
    for (const hour of [0, 7, 9, 23]) expect(shouldDose(hour, 8, false)).toBe(false);
  });
});

describe('shouldResetDosedToday', () => {
  it('resets only at midnight', () => {
    expect(shouldResetDosedToday(0)).toBe(true);
    for (const hour of [1, 12, 23]) expect(shouldResetDosedToday(hour)).toBe(false);
  });
});

describe('autoDoserUpdate', () => {
  it('does nothing when disabled', () => {
    const result = autoDoserUpdate(createSimulation({ tankCapacity: 40 }), FORMULA);

    expect(result.effects).toHaveLength(0);
    expect(result.dosed).toBe(false);
  });

  it('adds dose × formula of every nutrient at the scheduled hour and marks the day dosed', () => {
    const formula: FertilizerFormula = { nitrate: 100, phosphate: 10, potassium: 50, iron: 2 };
    const result = autoDoserUpdate(tankAt(8, { doseAmountMl: 3 }), formula);

    expect(result.dosed).toBe(true);
    expect(result.state.equipment.autoDoser.dosedToday).toBe(true);
    for (const nutrient of NUTRIENTS) {
      const effect = result.effects.find((e) => e.resource === nutrient);
      expect(effect).toMatchObject({ source: 'auto-doser', delta: 3 * formula[nutrient] });
    }
  });

  it('holds off outside its hour and after it has dosed', () => {
    expect(autoDoserUpdate(tankAt(10), FORMULA).effects).toHaveLength(0);
    expect(autoDoserUpdate(tankAt(8, { dosedToday: true }), FORMULA).effects).toHaveLength(0);
  });

  it('clears the dosed flag at midnight', () => {
    const result = autoDoserUpdate(tankAt(24, { dosedToday: true }), FORMULA);
    expect(result.state.equipment.autoDoser.dosedToday).toBe(false);
  });
});
