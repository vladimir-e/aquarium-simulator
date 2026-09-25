import { describe, it, expect } from 'vitest';
import {
  shouldDose,
  shouldResetDosedToday,
  autoDoserUpdate,
  applyAutoDoserSettings,
  MIN_DOSE_ML,
  MAX_DOSE_ML,
  type AutoDoser,
} from './auto-doser.js';
import { createSimulation, type SimulationState } from '../state.js';
import { nutrientsDefaults, type FertilizerFormula } from '../config/nutrients.js';

const FORMULA = nutrientsDefaults.fertilizerFormula;
const NUTRIENTS = ['nitrate', 'phosphate', 'potassium', 'iron'] as const;

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
        schedule: { startHour: 8, duration: 1 },
        dosedToday: false,
        ...doser,
      },
    },
  };
}

describe('shouldDose', () => {
  it('fires only at the scheduled hour, once a day', () => {
    const schedule = { startHour: 8, duration: 1 };

    expect(shouldDose(8, schedule, false)).toBe(true);
    expect(shouldDose(8, schedule, true)).toBe(false);
    for (const hour of [0, 7, 9, 23]) expect(shouldDose(hour, schedule, false)).toBe(false);
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

describe('applyAutoDoserSettings', () => {
  it('applies the settings it is given and keeps the dosed flag', () => {
    const state = tankAt(0, { enabled: false, dosedToday: true });
    const result = applyAutoDoserSettings(state, {
      enabled: true,
      doseAmountMl: 3,
      schedule: { startHour: 6, duration: 1 },
    });

    expect(result.equipment.autoDoser).toMatchObject({
      enabled: true,
      doseAmountMl: 3,
      schedule: { startHour: 6, duration: 1 },
      dosedToday: true,
    });
  });

  it('clamps the dose to its range', () => {
    const state = tankAt(0);
    expect(applyAutoDoserSettings(state, { doseAmountMl: 0.01 }).equipment.autoDoser.doseAmountMl).toBe(
      MIN_DOSE_ML
    );
    expect(applyAutoDoserSettings(state, { doseAmountMl: 500 }).equipment.autoDoser.doseAmountMl).toBe(
      MAX_DOSE_ML
    );
  });
});
