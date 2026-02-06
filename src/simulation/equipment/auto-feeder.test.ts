import { describe, it, expect } from 'vitest';
import {
  shouldFeed,
  shouldResetFedToday,
  formatFeedPreview,
  autoFeederUpdate,
  applyAutoFeederSettings,
  DEFAULT_AUTO_FEEDER,
} from './auto-feeder.js';
import { createSimulation } from '../state.js';

describe('auto-feeder equipment', () => {
  describe('shouldFeed', () => {
    it('returns true at scheduled hour when not fed today', () => {
      const schedule = { startHour: 9, duration: 1 };

      expect(shouldFeed(9, schedule, false)).toBe(true);
    });

    it('returns false when already fed today', () => {
      const schedule = { startHour: 9, duration: 1 };

      expect(shouldFeed(9, schedule, true)).toBe(false);
    });

    it('returns false when not at scheduled hour', () => {
      const schedule = { startHour: 9, duration: 1 };

      expect(shouldFeed(8, schedule, false)).toBe(false);
      expect(shouldFeed(10, schedule, false)).toBe(false);
      expect(shouldFeed(0, schedule, false)).toBe(false);
      expect(shouldFeed(23, schedule, false)).toBe(false);
    });

    it('works with different schedule hours', () => {
      const morningSchedule = { startHour: 7, duration: 1 };
      const eveningSchedule = { startHour: 18, duration: 1 };

      expect(shouldFeed(7, morningSchedule, false)).toBe(true);
      expect(shouldFeed(9, morningSchedule, false)).toBe(false);

      expect(shouldFeed(18, eveningSchedule, false)).toBe(true);
      expect(shouldFeed(7, eveningSchedule, false)).toBe(false);
    });
  });

  describe('shouldResetFedToday', () => {
    it('returns true at midnight (hour 0)', () => {
      expect(shouldResetFedToday(0)).toBe(true);
    });

    it('returns false at other hours', () => {
      expect(shouldResetFedToday(1)).toBe(false);
      expect(shouldResetFedToday(12)).toBe(false);
      expect(shouldResetFedToday(23)).toBe(false);
    });
  });

  describe('formatFeedPreview', () => {
    it('formats feed preview with amount', () => {
      const result = formatFeedPreview(0.5);

      expect(result).toContain('0.50');
      expect(result).toContain('food');
    });

    it('formats different amounts correctly', () => {
      expect(formatFeedPreview(0.1)).toContain('0.10');
      expect(formatFeedPreview(2.0)).toContain('2.00');
    });
  });

  describe('autoFeederUpdate', () => {
    it('does nothing when disabled', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = autoFeederUpdate(state);

      expect(result.effects).toHaveLength(0);
      expect(result.fed).toBe(false);
    });

    it('feeds at scheduled hour when enabled', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        tick: 9, // 9am
        equipment: {
          ...state.equipment,
          autoFeeder: {
            enabled: true,
            feedAmountGrams: 0.5,
            schedule: { startHour: 9, duration: 1 },
            fedToday: false,
          },
        },
      };

      const result = autoFeederUpdate(state);

      expect(result.fed).toBe(true);
      expect(result.effects).toHaveLength(1);
      expect(result.state.equipment.autoFeeder.fedToday).toBe(true);
    });

    it('creates food effect with correct amount', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        tick: 9,
        equipment: {
          ...state.equipment,
          autoFeeder: {
            enabled: true,
            feedAmountGrams: 0.5,
            schedule: { startHour: 9, duration: 1 },
            fedToday: false,
          },
        },
      };

      const result = autoFeederUpdate(state);

      const foodEffect = result.effects.find((e) => e.resource === 'food');

      expect(foodEffect).toBeDefined();
      expect(foodEffect!.delta).toBe(0.5);
      expect(foodEffect!.source).toBe('auto-feeder');
      expect(foodEffect!.tier).toBe('active');
    });

    it('does not feed again same day', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        tick: 9,
        equipment: {
          ...state.equipment,
          autoFeeder: {
            enabled: true,
            feedAmountGrams: 0.5,
            schedule: { startHour: 9, duration: 1 },
            fedToday: true, // Already fed
          },
        },
      };

      const result = autoFeederUpdate(state);

      expect(result.fed).toBe(false);
      expect(result.effects).toHaveLength(0);
    });

    it('does not feed outside scheduled hour', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        tick: 12, // noon, schedule is 9am
        equipment: {
          ...state.equipment,
          autoFeeder: {
            enabled: true,
            feedAmountGrams: 0.5,
            schedule: { startHour: 9, duration: 1 },
            fedToday: false,
          },
        },
      };

      const result = autoFeederUpdate(state);

      expect(result.fed).toBe(false);
      expect(result.effects).toHaveLength(0);
    });

    it('resets fedToday at midnight', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        tick: 24, // Midnight (24 % 24 = 0)
        equipment: {
          ...state.equipment,
          autoFeeder: {
            enabled: true,
            feedAmountGrams: 0.5,
            schedule: { startHour: 9, duration: 1 },
            fedToday: true,
          },
        },
      };

      const result = autoFeederUpdate(state);

      expect(result.state.equipment.autoFeeder.fedToday).toBe(false);
    });

    it('scales food amount with feed amount setting', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        tick: 9,
        equipment: {
          ...state.equipment,
          autoFeeder: {
            enabled: true,
            feedAmountGrams: 1.5,
            schedule: { startHour: 9, duration: 1 },
            fedToday: false,
          },
        },
      };

      const result = autoFeederUpdate(state);

      const foodEffect = result.effects.find((e) => e.resource === 'food');
      expect(foodEffect!.delta).toBe(1.5);
    });

    it('works correctly across multiple days', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        tick: 24 + 9, // Day 2, 9am (tick 33, 33 % 24 = 9)
        equipment: {
          ...state.equipment,
          autoFeeder: {
            enabled: true,
            feedAmountGrams: 0.5,
            schedule: { startHour: 9, duration: 1 },
            fedToday: false,
          },
        },
      };

      const result = autoFeederUpdate(state);

      expect(result.fed).toBe(true);
      expect(result.effects).toHaveLength(1);
    });
  });

  describe('applyAutoFeederSettings', () => {
    it('applies enabled setting', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = applyAutoFeederSettings(state, { enabled: true });

      expect(result.equipment.autoFeeder.enabled).toBe(true);
    });

    it('applies feed amount setting', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = applyAutoFeederSettings(state, { feedAmountGrams: 1.0 });

      expect(result.equipment.autoFeeder.feedAmountGrams).toBe(1.0);
    });

    it('clamps feed amount to minimum', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = applyAutoFeederSettings(state, { feedAmountGrams: 0.01 });

      expect(result.equipment.autoFeeder.feedAmountGrams).toBe(0.1); // MIN_FEED_GRAMS
    });

    it('clamps feed amount to maximum', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = applyAutoFeederSettings(state, { feedAmountGrams: 10 });

      expect(result.equipment.autoFeeder.feedAmountGrams).toBe(2.0); // MAX_FEED_GRAMS
    });

    it('applies schedule setting', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = applyAutoFeederSettings(state, {
        schedule: { startHour: 12, duration: 1 },
      });

      expect(result.equipment.autoFeeder.schedule.startHour).toBe(12);
    });

    it('applies multiple settings at once', () => {
      const state = createSimulation({ tankCapacity: 40 });
      const result = applyAutoFeederSettings(state, {
        enabled: true,
        feedAmountGrams: 0.75,
        schedule: { startHour: 7, duration: 1 },
      });

      expect(result.equipment.autoFeeder.enabled).toBe(true);
      expect(result.equipment.autoFeeder.feedAmountGrams).toBe(0.75);
      expect(result.equipment.autoFeeder.schedule.startHour).toBe(7);
    });

    it('preserves fedToday flag', () => {
      let state = createSimulation({ tankCapacity: 40 });
      state = {
        ...state,
        equipment: {
          ...state.equipment,
          autoFeeder: {
            ...state.equipment.autoFeeder,
            fedToday: true,
          },
        },
      };

      const result = applyAutoFeederSettings(state, { enabled: false });

      expect(result.equipment.autoFeeder.fedToday).toBe(true);
    });
  });

  describe('DEFAULT_AUTO_FEEDER', () => {
    it('has correct default values', () => {
      expect(DEFAULT_AUTO_FEEDER.enabled).toBe(false);
      expect(DEFAULT_AUTO_FEEDER.feedAmountGrams).toBe(0.5);
      expect(DEFAULT_AUTO_FEEDER.schedule.startHour).toBe(9);
      expect(DEFAULT_AUTO_FEEDER.fedToday).toBe(false);
    });
  });
});
