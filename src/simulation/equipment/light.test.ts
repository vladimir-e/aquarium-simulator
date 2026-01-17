import { describe, it, expect } from 'vitest';
import {
  getLightOutput,
  DEFAULT_LIGHT,
  LIGHT_WATTAGE_OPTIONS,
  type Light,
} from './light.js';

describe('light equipment', () => {
  describe('DEFAULT_LIGHT', () => {
    it('has expected default values', () => {
      expect(DEFAULT_LIGHT.enabled).toBe(true);
      expect(DEFAULT_LIGHT.wattage).toBe(100);
      expect(DEFAULT_LIGHT.schedule.startHour).toBe(8);
      expect(DEFAULT_LIGHT.schedule.duration).toBe(10);
    });
  });

  describe('LIGHT_WATTAGE_OPTIONS', () => {
    it('contains valid wattage options', () => {
      expect(LIGHT_WATTAGE_OPTIONS).toEqual([50, 100, 150, 200]);
    });

    it('includes default wattage', () => {
      expect(LIGHT_WATTAGE_OPTIONS).toContain(DEFAULT_LIGHT.wattage);
    });
  });

  describe('getLightOutput', () => {
    it('returns 0 when light is disabled', () => {
      const light: Light = {
        enabled: false,
        wattage: 100,
        schedule: { startHour: 8, duration: 10 },
      };

      expect(getLightOutput(light, 10)).toBe(0);
      expect(getLightOutput(light, 0)).toBe(0);
      expect(getLightOutput(light, 23)).toBe(0);
    });

    it('returns wattage when enabled and schedule is active', () => {
      const light: Light = {
        enabled: true,
        wattage: 150,
        schedule: { startHour: 8, duration: 10 }, // 8am-6pm
      };

      expect(getLightOutput(light, 8)).toBe(150); // Start hour
      expect(getLightOutput(light, 10)).toBe(150); // Mid-day
      expect(getLightOutput(light, 17)).toBe(150); // Just before end
    });

    it('returns 0 when enabled but outside schedule', () => {
      const light: Light = {
        enabled: true,
        wattage: 150,
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
        wattage: 100,
        schedule: { startHour: 0, duration: 24 },
      };

      for (let hour = 0; hour < 24; hour++) {
        expect(getLightOutput(light, hour)).toBe(100);
      }
    });

    it('handles midnight wrap-around schedule', () => {
      const light: Light = {
        enabled: true,
        wattage: 100,
        schedule: { startHour: 22, duration: 8 }, // 10pm-6am
      };

      // Active hours
      expect(getLightOutput(light, 22)).toBe(100); // Start
      expect(getLightOutput(light, 23)).toBe(100); // Before midnight
      expect(getLightOutput(light, 0)).toBe(100); // Midnight
      expect(getLightOutput(light, 2)).toBe(100); // Early morning
      expect(getLightOutput(light, 5)).toBe(100); // Just before end

      // Inactive hours
      expect(getLightOutput(light, 6)).toBe(0); // At end hour
      expect(getLightOutput(light, 10)).toBe(0); // Mid-day
      expect(getLightOutput(light, 21)).toBe(0); // Just before start
    });

    it('respects different wattage values', () => {
      const schedule = { startHour: 8, duration: 10 };

      for (const wattage of LIGHT_WATTAGE_OPTIONS) {
        const light: Light = {
          enabled: true,
          wattage,
          schedule,
        };
        expect(getLightOutput(light, 10)).toBe(wattage);
      }
    });

    it('works with custom wattage values', () => {
      const light: Light = {
        enabled: true,
        wattage: 75, // Non-standard wattage
        schedule: { startHour: 8, duration: 10 },
      };

      expect(getLightOutput(light, 10)).toBe(75);
    });

    it('handles edge case at schedule boundary', () => {
      const light: Light = {
        enabled: true,
        wattage: 100,
        schedule: { startHour: 8, duration: 10 }, // 8am-6pm
      };

      // Start hour is inclusive
      expect(getLightOutput(light, 8)).toBe(100);

      // End hour is exclusive
      expect(getLightOutput(light, 18)).toBe(0);
    });

    it('handles short duration schedules', () => {
      const light: Light = {
        enabled: true,
        wattage: 100,
        schedule: { startHour: 12, duration: 1 }, // 12pm-1pm
      };

      expect(getLightOutput(light, 11)).toBe(0);
      expect(getLightOutput(light, 12)).toBe(100);
      expect(getLightOutput(light, 13)).toBe(0);
    });
  });
});
