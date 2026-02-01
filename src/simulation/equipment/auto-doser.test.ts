import { describe, it, expect } from 'vitest';
import {
  shouldDose,
  shouldResetDosedToday,
  formatDosePreview,
  autoDoserUpdate,
  applyAutoDoserSettings,
  DEFAULT_AUTO_DOSER,
} from './auto-doser.js';
import { createSimulation } from '../state.js';
import type { FertilizerFormula } from '../config/nutrients.js';

describe('auto-doser equipment', () => {
  describe('shouldDose', () => {
    it('returns true at scheduled hour when not dosed today', () => {
      const schedule = { startHour: 8, duration: 1 };

      expect(shouldDose(8, schedule, false)).toBe(true);
    });

    it('returns false when already dosed today', () => {
      const schedule = { startHour: 8, duration: 1 };

      expect(shouldDose(8, schedule, true)).toBe(false);
    });

    it('returns false when not at scheduled hour', () => {
      const schedule = { startHour: 8, duration: 1 };

      expect(shouldDose(7, schedule, false)).toBe(false);
      expect(shouldDose(9, schedule, false)).toBe(false);
      expect(shouldDose(0, schedule, false)).toBe(false);
      expect(shouldDose(23, schedule, false)).toBe(false);
    });

    it('works with different schedule hours', () => {
      const morningSchedule = { startHour: 6, duration: 1 };
      const eveningSchedule = { startHour: 18, duration: 1 };

      expect(shouldDose(6, morningSchedule, false)).toBe(true);
      expect(shouldDose(8, morningSchedule, false)).toBe(false);

      expect(shouldDose(18, eveningSchedule, false)).toBe(true);
      expect(shouldDose(6, eveningSchedule, false)).toBe(false);
    });
  });

  describe('shouldResetDosedToday', () => {
    it('returns true at midnight (hour 0)', () => {
      expect(shouldResetDosedToday(0)).toBe(true);
    });

    it('returns false at other hours', () => {
      expect(shouldResetDosedToday(1)).toBe(false);
      expect(shouldResetDosedToday(12)).toBe(false);
      expect(shouldResetDosedToday(23)).toBe(false);
    });
  });

  describe('formatDosePreview', () => {
    it('formats dose preview with all nutrient increases', () => {
      const result = formatDosePreview(2.0, 40);

      expect(result).toContain('NO3');
      expect(result).toContain('PO4');
      expect(result).toContain('K');
      expect(result).toContain('Fe');
      expect(result).toContain('ppm');
    });

    it('returns N/A for zero water volume', () => {
      expect(formatDosePreview(2.0, 0)).toBe('N/A');
    });

    it('returns N/A for negative water volume', () => {
      expect(formatDosePreview(2.0, -10)).toBe('N/A');
    });

    it('uses custom formula when provided', () => {
      const customFormula: FertilizerFormula = {
        nitrate: 100,
        phosphate: 20,
        potassium: 80,
        iron: 4,
      };

      const result = formatDosePreview(1.0, 40, customFormula);

      // 100mg / 40L = 2.5 ppm
      expect(result).toContain('2.5');
    });
  });

  describe('autoDoserUpdate', () => {
    it('does nothing when disabled', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = autoDoserUpdate(state);

      expect(result.effects).toHaveLength(0);
      expect(result.dosed).toBe(false);
    });

    it('doses at scheduled hour when enabled', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        tick: 8, // 8am
        equipment: {
          ...state.equipment,
          autoDoser: {
            enabled: true,
            doseAmountMl: 2.0,
            schedule: { startHour: 8, duration: 1 },
            dosedToday: false,
          },
        },
      };

      const result = autoDoserUpdate(state);

      expect(result.dosed).toBe(true);
      expect(result.effects).toHaveLength(4); // nitrate, phosphate, potassium, iron
      expect(result.state.equipment.autoDoser.dosedToday).toBe(true);
    });

    it('creates effects for all nutrients', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        tick: 8,
        equipment: {
          ...state.equipment,
          autoDoser: {
            enabled: true,
            doseAmountMl: 1.0,
            schedule: { startHour: 8, duration: 1 },
            dosedToday: false,
          },
        },
      };

      const result = autoDoserUpdate(state);

      const nitrateEffect = result.effects.find((e) => e.resource === 'nitrate');
      const phosphateEffect = result.effects.find((e) => e.resource === 'phosphate');
      const potassiumEffect = result.effects.find((e) => e.resource === 'potassium');
      const ironEffect = result.effects.find((e) => e.resource === 'iron');

      expect(nitrateEffect).toBeDefined();
      expect(nitrateEffect!.delta).toBe(50); // 1ml * 50 mg/ml
      expect(nitrateEffect!.source).toBe('auto-doser');

      expect(phosphateEffect).toBeDefined();
      expect(phosphateEffect!.delta).toBe(5); // 1ml * 5 mg/ml

      expect(potassiumEffect).toBeDefined();
      expect(potassiumEffect!.delta).toBe(40); // 1ml * 40 mg/ml

      expect(ironEffect).toBeDefined();
      expect(ironEffect!.delta).toBe(1); // 1ml * 1 mg/ml
    });

    it('does not dose again same day', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        tick: 8,
        equipment: {
          ...state.equipment,
          autoDoser: {
            enabled: true,
            doseAmountMl: 2.0,
            schedule: { startHour: 8, duration: 1 },
            dosedToday: true, // Already dosed
          },
        },
      };

      const result = autoDoserUpdate(state);

      expect(result.dosed).toBe(false);
      expect(result.effects).toHaveLength(0);
    });

    it('does not dose outside scheduled hour', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        tick: 10, // 10am, schedule is 8am
        equipment: {
          ...state.equipment,
          autoDoser: {
            enabled: true,
            doseAmountMl: 2.0,
            schedule: { startHour: 8, duration: 1 },
            dosedToday: false,
          },
        },
      };

      const result = autoDoserUpdate(state);

      expect(result.dosed).toBe(false);
      expect(result.effects).toHaveLength(0);
    });

    it('resets dosedToday at midnight', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        tick: 24, // Midnight (24 % 24 = 0)
        equipment: {
          ...state.equipment,
          autoDoser: {
            enabled: true,
            doseAmountMl: 2.0,
            schedule: { startHour: 8, duration: 1 },
            dosedToday: true,
          },
        },
      };

      const result = autoDoserUpdate(state);

      expect(result.state.equipment.autoDoser.dosedToday).toBe(false);
    });

    it('scales nutrient amounts with dose amount', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        tick: 8,
        equipment: {
          ...state.equipment,
          autoDoser: {
            enabled: true,
            doseAmountMl: 5.0, // 5ml
            schedule: { startHour: 8, duration: 1 },
            dosedToday: false,
          },
        },
      };

      const result = autoDoserUpdate(state);

      const nitrateEffect = result.effects.find((e) => e.resource === 'nitrate');
      expect(nitrateEffect!.delta).toBe(250); // 5ml * 50 mg/ml
    });

    it('uses custom formula when provided', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        tick: 8,
        equipment: {
          ...state.equipment,
          autoDoser: {
            enabled: true,
            doseAmountMl: 1.0,
            schedule: { startHour: 8, duration: 1 },
            dosedToday: false,
          },
        },
      };

      const customFormula: FertilizerFormula = {
        nitrate: 100,
        phosphate: 10,
        potassium: 50,
        iron: 2,
      };

      const result = autoDoserUpdate(state, customFormula);

      const nitrateEffect = result.effects.find((e) => e.resource === 'nitrate');
      expect(nitrateEffect!.delta).toBe(100);
    });
  });

  describe('applyAutoDoserSettings', () => {
    it('applies enabled setting', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = applyAutoDoserSettings(state, { enabled: true });

      expect(result.equipment.autoDoser.enabled).toBe(true);
    });

    it('applies dose amount setting', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = applyAutoDoserSettings(state, { doseAmountMl: 5.0 });

      expect(result.equipment.autoDoser.doseAmountMl).toBe(5.0);
    });

    it('clamps dose amount to minimum', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = applyAutoDoserSettings(state, { doseAmountMl: 0.1 });

      expect(result.equipment.autoDoser.doseAmountMl).toBe(0.5); // MIN_DOSE_ML
    });

    it('clamps dose amount to maximum', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = applyAutoDoserSettings(state, { doseAmountMl: 50 });

      expect(result.equipment.autoDoser.doseAmountMl).toBe(10.0); // MAX_DOSE_ML
    });

    it('applies schedule setting', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = applyAutoDoserSettings(state, {
        schedule: { startHour: 10, duration: 1 },
      });

      expect(result.equipment.autoDoser.schedule.startHour).toBe(10);
    });

    it('applies multiple settings at once', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = applyAutoDoserSettings(state, {
        enabled: true,
        doseAmountMl: 3.0,
        schedule: { startHour: 6, duration: 1 },
      });

      expect(result.equipment.autoDoser.enabled).toBe(true);
      expect(result.equipment.autoDoser.doseAmountMl).toBe(3.0);
      expect(result.equipment.autoDoser.schedule.startHour).toBe(6);
    });

    it('preserves dosedToday flag', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        equipment: {
          ...state.equipment,
          autoDoser: {
            ...state.equipment.autoDoser,
            dosedToday: true,
          },
        },
      };

      const result = applyAutoDoserSettings(state, { enabled: false });

      expect(result.equipment.autoDoser.dosedToday).toBe(true);
    });
  });

  describe('DEFAULT_AUTO_DOSER', () => {
    it('has correct default values', () => {
      expect(DEFAULT_AUTO_DOSER.enabled).toBe(false);
      expect(DEFAULT_AUTO_DOSER.doseAmountMl).toBe(2.0);
      expect(DEFAULT_AUTO_DOSER.schedule.startHour).toBe(8);
      expect(DEFAULT_AUTO_DOSER.dosedToday).toBe(false);
    });
  });
});
