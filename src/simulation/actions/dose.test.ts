import { describe, it, expect } from 'vitest';
import { calculateDoseNutrients, canDose, dose, getDosePreview, MAX_DOSE_ML } from './dose.js';
import { createSimulation } from '../state.js';
import type { FertilizerFormula } from '../config/nutrients.js';

const FORMULA: FertilizerFormula = { nitrate: 100, phosphate: 10, potassium: 50, iron: 2 };
const NUTRIENTS = ['nitrate', 'phosphate', 'potassium', 'iron'] as const;

describe('calculateDoseNutrients', () => {
  it('is the dose times the formula', () => {
    const result = calculateDoseNutrients(2.5, FORMULA);
    for (const nutrient of NUTRIENTS) expect(result[nutrient]).toBe(2.5 * FORMULA[nutrient]);
  });
});

describe('canDose', () => {
  it('needs a plant in the tank', () => {
    const state = createSimulation({ tankCapacity: 40 });
    expect(canDose(state)).toBe(false);
    expect(
      canDose({
        ...state,
        plants: [{ id: 'test', species: 'java_fern', size: 50, condition: 100, surplus: 0 }],
      })
    ).toBe(true);
  });
});

describe('dose', () => {
  it('adds dose × formula to what the water already holds', () => {
    const base = createSimulation({ tankCapacity: 40 });
    const state = { ...base, resources: { ...base.resources, nitrate: 10, iron: 0.5 } };
    const result = dose(state, { type: 'dose', amountMl: 2 }, FORMULA);

    for (const nutrient of NUTRIENTS) {
      expect(result.state.resources[nutrient]).toBeCloseTo(
        state.resources[nutrient] + 2 * FORMULA[nutrient],
        10
      );
    }
  });

  it('accepts the maximum dose', () => {
    const state = createSimulation({ tankCapacity: 40 });
    expect(dose(state, { type: 'dose', amountMl: MAX_DOSE_ML }, FORMULA).state.resources.nitrate).toBe(
      MAX_DOSE_ML * FORMULA.nitrate
    );
  });

  it.each<[number, string]>([
    [0, 'Cannot dose'],
    [-1, 'Cannot dose'],
    [0.05, 'Minimum dose'],
    [MAX_DOSE_ML + 10, 'Maximum dose'],
    [NaN, 'Dose amount must be a number'],
    [Infinity, 'Dose amount must be a number'],
    [-Infinity, 'Dose amount must be a number'],
  ])('refuses %d ml', (amountMl, message) => {
    const state = createSimulation({ tankCapacity: 40 });
    const result = dose(state, { type: 'dose', amountMl }, FORMULA);

    expect(result.state).toBe(state);
    expect(result.message).toContain(message);
  });

  it('logs and reports the dose', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const result = dose(state, { type: 'dose', amountMl: 2.5 }, FORMULA);
    const log = result.state.logs.find((l) => l.source === 'user' && l.message.includes('Dosed'));

    expect(log!.severity).toBe('info');
    for (const token of ['2.5ml', 'NO3', 'PO4', 'K', 'Fe']) expect(log!.message).toContain(token);
    expect(result.message).toContain('2.5ml');
  });
});

describe('getDosePreview', () => {
  it('is the dose’s mass over the water, in ppm', () => {
    const preview = getDosePreview(2, 50, FORMULA);
    expect(preview.nitratePpm).toBeCloseTo((2 * FORMULA.nitrate) / 50, 10);
    expect(preview.ironPpm).toBeCloseTo((2 * FORMULA.iron) / 50, 10);
  });

  it('is zero with no water', () => {
    for (const water of [0, -10]) {
      expect(getDosePreview(1, water, FORMULA)).toEqual({
        nitratePpm: 0,
        phosphatePpm: 0,
        potassiumPpm: 0,
        ironPpm: 0,
      });
    }
  });
});
