import { describe, it, expect } from 'vitest';
import { calculateDoseNutrients, canDose, dose, getDosePreview } from './dose.js';
import { createSimulation } from '../state.js';
import type { FertilizerFormula } from '../config/nutrients.js';

describe('dose action', () => {
  describe('calculateDoseNutrients', () => {
    it('calculates nutrients for given dose amount with default formula', () => {
      const result = calculateDoseNutrients(1.0);

      // Default formula: nitrate 50, phosphate 5, potassium 40, iron 1
      expect(result.nitrate).toBe(50);
      expect(result.phosphate).toBe(5);
      expect(result.potassium).toBe(40);
      expect(result.iron).toBe(1);
    });

    it('scales nutrients linearly with dose amount', () => {
      const result = calculateDoseNutrients(2.0);

      expect(result.nitrate).toBe(100);
      expect(result.phosphate).toBe(10);
      expect(result.potassium).toBe(80);
      expect(result.iron).toBe(2);
    });

    it('handles small dose amounts', () => {
      const result = calculateDoseNutrients(0.1);

      expect(result.nitrate).toBe(5);
      expect(result.phosphate).toBe(0.5);
      expect(result.potassium).toBe(4);
      expect(result.iron).toBe(0.1);
    });

    it('uses custom formula when provided', () => {
      const customFormula: FertilizerFormula = {
        nitrate: 10,
        phosphate: 2,
        potassium: 5,
        iron: 0.5,
      };

      const result = calculateDoseNutrients(1.0, customFormula);

      expect(result.nitrate).toBe(10);
      expect(result.phosphate).toBe(2);
      expect(result.potassium).toBe(5);
      expect(result.iron).toBe(0.5);
    });
  });

  describe('canDose', () => {
    it('returns true when plants exist in tank', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        plants: [{ id: 'test', species: 'java_fern', size: 50, condition: 100 }],
      };

      expect(canDose(state)).toBe(true);
    });

    it('returns false when no plants in tank', () => {
      const state = createSimulation({ tankCapacity: 40 });

      expect(canDose(state)).toBe(false);
    });
  });

  describe('dose', () => {
    it('adds nutrients to resources', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = dose(state, { type: 'dose', amountMl: 1.0 });

      // Default formula: nitrate 50, phosphate 5, potassium 40, iron 1
      expect(result.state.resources.nitrate).toBe(50);
      expect(result.state.resources.phosphate).toBe(5);
      expect(result.state.resources.potassium).toBe(40);
      expect(result.state.resources.iron).toBe(1);
    });

    it('adds to existing nutrient levels', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        resources: {
          ...state.resources,
          nitrate: 10,
          phosphate: 1,
          potassium: 5,
          iron: 0.1,
        },
      };

      const result = dose(state, { type: 'dose', amountMl: 1.0 });

      expect(result.state.resources.nitrate).toBe(60);
      expect(result.state.resources.phosphate).toBe(6);
      expect(result.state.resources.potassium).toBe(45);
      expect(result.state.resources.iron).toBe(1.1);
    });

    it('rejects zero amount', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = dose(state, { type: 'dose', amountMl: 0 });

      expect(result.state.resources.nitrate).toBe(0);
      expect(result.message).toContain('Cannot dose');
    });

    it('rejects negative amount', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = dose(state, { type: 'dose', amountMl: -1 });

      expect(result.state.resources.nitrate).toBe(0);
      expect(result.message).toContain('Cannot dose');
    });

    it('rejects amount below minimum (0.1ml)', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = dose(state, { type: 'dose', amountMl: 0.05 });

      expect(result.state.resources.nitrate).toBe(0);
      expect(result.message).toContain('Minimum dose');
    });

    it('rejects amount above maximum (50ml)', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = dose(state, { type: 'dose', amountMl: 60 });

      expect(result.state.resources.nitrate).toBe(0);
      expect(result.message).toContain('Maximum dose');
    });

    it('accepts amounts at boundaries', () => {
      const state = createSimulation({ tankCapacity: 40 });

      // Test minimum
      const minResult = dose(state, { type: 'dose', amountMl: 0.1 });
      expect(minResult.state.resources.nitrate).toBeGreaterThan(0);

      // Test maximum
      const maxResult = dose(state, { type: 'dose', amountMl: 50 });
      expect(maxResult.state.resources.nitrate).toBe(2500);
    });

    it('uses custom formula when provided', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const customFormula: FertilizerFormula = {
        nitrate: 100,
        phosphate: 10,
        potassium: 50,
        iron: 2,
      };

      const result = dose(state, { type: 'dose', amountMl: 1.0 }, customFormula);

      expect(result.state.resources.nitrate).toBe(100);
      expect(result.state.resources.phosphate).toBe(10);
      expect(result.state.resources.potassium).toBe(50);
      expect(result.state.resources.iron).toBe(2);
    });

    it('logs the action with nutrient details', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = dose(state, { type: 'dose', amountMl: 2.0 });

      const doseLog = result.state.logs.find(
        (log) => log.source === 'user' && log.message.includes('Dosed')
      );
      expect(doseLog).toBeDefined();
      expect(doseLog!.message).toContain('2.0ml');
      expect(doseLog!.message).toContain('NO3');
      expect(doseLog!.message).toContain('PO4');
      expect(doseLog!.message).toContain('K');
      expect(doseLog!.message).toContain('Fe');
      expect(doseLog!.severity).toBe('info');
    });

    it('returns success message', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = dose(state, { type: 'dose', amountMl: 2.5 });

      expect(result.message).toContain('2.5ml');
      expect(result.message).toContain('fertilizer');
    });
  });

  describe('getDosePreview', () => {
    it('calculates ppm increases for a given dose', () => {
      const result = getDosePreview(1.0, 40);

      // 1ml in 40L: nitrate 50mg/40L = 1.25 ppm
      expect(result.nitratePpm).toBe(1.25);
      expect(result.phosphatePpm).toBe(0.125);
      expect(result.potassiumPpm).toBe(1);
      expect(result.ironPpm).toBe(0.025);
    });

    it('returns zeros for zero water volume', () => {
      const result = getDosePreview(1.0, 0);

      expect(result.nitratePpm).toBe(0);
      expect(result.phosphatePpm).toBe(0);
      expect(result.potassiumPpm).toBe(0);
      expect(result.ironPpm).toBe(0);
    });

    it('returns zeros for negative water volume', () => {
      const result = getDosePreview(1.0, -10);

      expect(result.nitratePpm).toBe(0);
      expect(result.phosphatePpm).toBe(0);
      expect(result.potassiumPpm).toBe(0);
      expect(result.ironPpm).toBe(0);
    });

    it('uses custom formula when provided', () => {
      const customFormula: FertilizerFormula = {
        nitrate: 100,
        phosphate: 10,
        potassium: 50,
        iron: 2,
      };

      const result = getDosePreview(1.0, 50, customFormula);

      // 100mg/50L = 2 ppm
      expect(result.nitratePpm).toBe(2);
      expect(result.phosphatePpm).toBe(0.2);
      expect(result.potassiumPpm).toBe(1);
      expect(result.ironPpm).toBe(0.04);
    });

    it('scales with dose amount', () => {
      const small = getDosePreview(1.0, 40);
      const large = getDosePreview(5.0, 40);

      expect(large.nitratePpm).toBe(small.nitratePpm * 5);
      expect(large.phosphatePpm).toBe(small.phosphatePpm * 5);
      expect(large.potassiumPpm).toBe(small.potassiumPpm * 5);
      expect(large.ironPpm).toBe(small.ironPpm * 5);
    });
  });
});
