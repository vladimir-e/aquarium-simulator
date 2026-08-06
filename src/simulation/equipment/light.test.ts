import { describe, it, expect } from 'vitest';
import {
  getLightOutput,
  calculateParAtDepth,
  DEFAULT_LIGHT,
  LIGHT_PAR_OPTIONS,
  type Light,
} from './light.js';
import { lightDefaults } from '../config/light.js';
import { calculateTankHeight } from '../state.js';

describe('light equipment', () => {
  describe('DEFAULT_LIGHT', () => {
    it('has expected default values', () => {
      expect(DEFAULT_LIGHT.enabled).toBe(true);
      expect(DEFAULT_LIGHT.par).toBe(50);
      expect(DEFAULT_LIGHT.schedule.startHour).toBe(8);
      expect(DEFAULT_LIGHT.schedule.duration).toBe(10);
    });
  });

  describe('LIGHT_PAR_OPTIONS', () => {
    it('offers distinct fixtures in ascending order', () => {
      expect(LIGHT_PAR_OPTIONS).toEqual([...LIGHT_PAR_OPTIONS].sort((a, b) => a - b));
      expect(new Set(LIGHT_PAR_OPTIONS).size).toBe(LIGHT_PAR_OPTIONS.length);
    });

    it('includes the default fixture', () => {
      expect(LIGHT_PAR_OPTIONS).toContain(DEFAULT_LIGHT.par);
    });

    it('spans the hobby low-to-very-high tiers on the 150 L reference tank', () => {
      const depth = calculateTankHeight(150);
      const atSubstrate = LIGHT_PAR_OPTIONS.map((par) =>
        Math.round(calculateParAtDepth(par, depth, lightDefaults))
      );
      expect(atSubstrate).toEqual([16, 33, 59, 98]);
    });
  });

  describe('getLightOutput', () => {
    it('returns 0 when light is disabled', () => {
      const light: Light = {
        enabled: false,
        par: 90,
        schedule: { startHour: 8, duration: 10 },
      };

      expect(getLightOutput(light, 10)).toBe(0);
      expect(getLightOutput(light, 0)).toBe(0);
      expect(getLightOutput(light, 23)).toBe(0);
    });

    it('returns the fixture rating when enabled and schedule is active', () => {
      const light: Light = {
        enabled: true,
        par: 150,
        schedule: { startHour: 8, duration: 10 }, // 8am-6pm
      };

      expect(getLightOutput(light, 8)).toBe(150); // Start hour
      expect(getLightOutput(light, 10)).toBe(150); // Mid-day
      expect(getLightOutput(light, 17)).toBe(150); // Just before end
    });

    it('returns 0 when enabled but outside schedule', () => {
      const light: Light = {
        enabled: true,
        par: 150,
        schedule: { startHour: 8, duration: 10 }, // 8am-6pm
      };

      expect(getLightOutput(light, 7)).toBe(0); // Before start
      expect(getLightOutput(light, 18)).toBe(0); // At end hour
      expect(getLightOutput(light, 20)).toBe(0); // Evening
      expect(getLightOutput(light, 2)).toBe(0); // Night
    });

    it('handles 24-hour duration (always-on)', () => {
      const light: Light = {
        enabled: true,
        par: 50,
        schedule: { startHour: 0, duration: 24 },
      };

      for (let hour = 0; hour < 24; hour++) {
        expect(getLightOutput(light, hour)).toBe(50);
      }
    });

    it('handles midnight wrap-around schedule', () => {
      const light: Light = {
        enabled: true,
        par: 50,
        schedule: { startHour: 22, duration: 8 }, // 10pm-6am
      };

      // Active hours
      expect(getLightOutput(light, 22)).toBe(50); // Start
      expect(getLightOutput(light, 23)).toBe(50); // Before midnight
      expect(getLightOutput(light, 0)).toBe(50); // Midnight
      expect(getLightOutput(light, 2)).toBe(50); // Early morning
      expect(getLightOutput(light, 5)).toBe(50); // Just before end

      // Inactive hours
      expect(getLightOutput(light, 6)).toBe(0); // At end hour
      expect(getLightOutput(light, 10)).toBe(0); // Mid-day
      expect(getLightOutput(light, 21)).toBe(0); // Just before start
    });

    it('reports every catalog fixture at its rating', () => {
      const schedule = { startHour: 8, duration: 10 };

      for (const par of LIGHT_PAR_OPTIONS) {
        const light: Light = { enabled: true, par, schedule };
        expect(getLightOutput(light, 10)).toBe(par);
      }
    });

    it('works with off-catalog fixtures', () => {
      const light: Light = {
        enabled: true,
        par: 75,
        schedule: { startHour: 8, duration: 10 },
      };

      expect(getLightOutput(light, 10)).toBe(75);
    });

    it('handles edge case at schedule boundary', () => {
      const light: Light = {
        enabled: true,
        par: 50,
        schedule: { startHour: 8, duration: 10 }, // 8am-6pm
      };

      // Start hour is inclusive
      expect(getLightOutput(light, 8)).toBe(50);

      // End hour is exclusive
      expect(getLightOutput(light, 18)).toBe(0);
    });

    it('handles short duration schedules', () => {
      const light: Light = {
        enabled: true,
        par: 50,
        schedule: { startHour: 12, duration: 1 }, // 12pm-1pm
      };

      expect(getLightOutput(light, 11)).toBe(0);
      expect(getLightOutput(light, 12)).toBe(50);
      expect(getLightOutput(light, 13)).toBe(0);
    });
  });

  describe('calculateParAtDepth', () => {
    it('leaves the surface reading untouched at zero depth', () => {
      expect(calculateParAtDepth(90, 0, lightDefaults)).toBe(90);
    });

    it('returns nothing when the fixture is off, at any depth', () => {
      expect(calculateParAtDepth(0, 42, lightDefaults)).toBe(0);
    });

    it('falls off monotonically with depth', () => {
      const readings = [0, 10, 20, 40, 80].map((cm) => calculateParAtDepth(100, cm, lightDefaults));
      for (let i = 1; i < readings.length; i++) {
        expect(readings[i]).toBeLessThan(readings[i - 1]);
      }
    });

    it('scales linearly in the fixture — doubling the fixture doubles the substrate', () => {
      const depth = calculateTankHeight(150);
      expect(calculateParAtDepth(100, depth, lightDefaults)).toBeCloseTo(
        2 * calculateParAtDepth(50, depth, lightDefaults),
        10
      );
    });

    it('is Beer–Lambert: stacking two depths equals attenuating through their sum', () => {
      const once = calculateParAtDepth(calculateParAtDepth(100, 20, lightDefaults), 30, lightDefaults);
      expect(once).toBeCloseTo(calculateParAtDepth(100, 50, lightDefaults), 10);
    });

    it('a deeper tank lands less of the same fixture on its substrate', () => {
      const shallow = calculateParAtDepth(90, calculateTankHeight(20), lightDefaults);
      const deep = calculateParAtDepth(90, calculateTankHeight(300), lightDefaults);
      expect(deep).toBeLessThan(shallow);
    });

    it('attenuates harder as the coefficient rises', () => {
      const clear = calculateParAtDepth(100, 40, { waterAttenuationPerCm: 0.005 });
      const murky = calculateParAtDepth(100, 40, { waterAttenuationPerCm: 0.02 });
      expect(murky).toBeLessThan(clear);
      expect(clear).toBeLessThan(100);
    });
  });
});
