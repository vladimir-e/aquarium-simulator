import { describe, it, expect } from 'vitest';
import { isScheduleActive, isValidSchedule, formatSchedule, type DailySchedule } from './schedule.js';

describe('Schedule module', () => {
  describe('isScheduleActive', () => {
    it('returns true during active hours (normal schedule)', () => {
      const schedule: DailySchedule = { startHour: 8, duration: 10 }; // 8am-6pm
      expect(isScheduleActive(8, schedule)).toBe(true);
      expect(isScheduleActive(12, schedule)).toBe(true);
      expect(isScheduleActive(17, schedule)).toBe(true);
    });

    it('returns false outside active hours (normal schedule)', () => {
      const schedule: DailySchedule = { startHour: 8, duration: 10 }; // 8am-6pm
      expect(isScheduleActive(7, schedule)).toBe(false);
      expect(isScheduleActive(18, schedule)).toBe(false);
      expect(isScheduleActive(23, schedule)).toBe(false);
      expect(isScheduleActive(0, schedule)).toBe(false);
    });

    it('handles midnight wrap-around schedule', () => {
      const schedule: DailySchedule = { startHour: 22, duration: 8 }; // 10pm-6am
      expect(isScheduleActive(22, schedule)).toBe(true);
      expect(isScheduleActive(23, schedule)).toBe(true);
      expect(isScheduleActive(0, schedule)).toBe(true);
      expect(isScheduleActive(5, schedule)).toBe(true);
      expect(isScheduleActive(6, schedule)).toBe(false);
      expect(isScheduleActive(12, schedule)).toBe(false);
      expect(isScheduleActive(21, schedule)).toBe(false);
    });

    it('handles 24-hour schedule (always on)', () => {
      const schedule: DailySchedule = { startHour: 0, duration: 24 };
      for (let hour = 0; hour < 24; hour++) {
        expect(isScheduleActive(hour, schedule)).toBe(true);
      }
    });

    it('handles edge case: endHour = startHour (24h duration wrapping)', () => {
      const schedule: DailySchedule = { startHour: 10, duration: 24 }; // Full day starting at 10
      for (let hour = 0; hour < 24; hour++) {
        expect(isScheduleActive(hour, schedule)).toBe(true);
      }
    });

    it('handles 1-hour duration', () => {
      const schedule: DailySchedule = { startHour: 12, duration: 1 }; // 12pm-1pm
      expect(isScheduleActive(11, schedule)).toBe(false);
      expect(isScheduleActive(12, schedule)).toBe(true);
      expect(isScheduleActive(13, schedule)).toBe(false);
    });

    it('handles schedule starting at midnight', () => {
      const schedule: DailySchedule = { startHour: 0, duration: 8 }; // 12am-8am
      expect(isScheduleActive(0, schedule)).toBe(true);
      expect(isScheduleActive(7, schedule)).toBe(true);
      expect(isScheduleActive(8, schedule)).toBe(false);
      expect(isScheduleActive(23, schedule)).toBe(false);
    });

    it('handles schedule ending at midnight', () => {
      const schedule: DailySchedule = { startHour: 18, duration: 6 }; // 6pm-12am
      expect(isScheduleActive(18, schedule)).toBe(true);
      expect(isScheduleActive(23, schedule)).toBe(true);
      expect(isScheduleActive(0, schedule)).toBe(false);
      expect(isScheduleActive(17, schedule)).toBe(false);
    });
  });

  describe('isValidSchedule', () => {
    it('validates correct schedules', () => {
      expect(isValidSchedule({ startHour: 0, duration: 24 })).toBe(true);
      expect(isValidSchedule({ startHour: 8, duration: 10 })).toBe(true);
      expect(isValidSchedule({ startHour: 23, duration: 1 })).toBe(true);
      expect(isValidSchedule({ startHour: 12, duration: 12 })).toBe(true);
      expect(isValidSchedule({ startHour: 0, duration: 1 })).toBe(true);
    });

    it('rejects invalid startHour - negative', () => {
      expect(isValidSchedule({ startHour: -1, duration: 10 })).toBe(false);
    });

    it('rejects invalid startHour - too high', () => {
      expect(isValidSchedule({ startHour: 24, duration: 10 })).toBe(false);
      expect(isValidSchedule({ startHour: 25, duration: 10 })).toBe(false);
    });

    it('rejects invalid startHour - non-integer', () => {
      expect(isValidSchedule({ startHour: 12.5, duration: 10 })).toBe(false);
      expect(isValidSchedule({ startHour: 8.1, duration: 10 })).toBe(false);
    });

    it('rejects invalid duration - zero', () => {
      expect(isValidSchedule({ startHour: 8, duration: 0 })).toBe(false);
    });

    it('rejects invalid duration - negative', () => {
      expect(isValidSchedule({ startHour: 8, duration: -5 })).toBe(false);
    });

    it('rejects invalid duration - too high', () => {
      expect(isValidSchedule({ startHour: 8, duration: 25 })).toBe(false);
    });
  });

  describe('formatSchedule', () => {
    it('formats normal schedule', () => {
      expect(formatSchedule({ startHour: 8, duration: 10 })).toBe('8:00 - 18:00 (10h)');
    });

    it('formats midnight wrap-around', () => {
      expect(formatSchedule({ startHour: 22, duration: 8 })).toBe('22:00 - 6:00 (8h)');
    });

    it('formats 24-hour schedule', () => {
      expect(formatSchedule({ startHour: 0, duration: 24 })).toBe('0:00 - 0:00 (24h)');
    });

    it('formats 1-hour schedule', () => {
      expect(formatSchedule({ startHour: 12, duration: 1 })).toBe('12:00 - 13:00 (1h)');
    });

    it('formats schedule starting at midnight', () => {
      expect(formatSchedule({ startHour: 0, duration: 8 })).toBe('0:00 - 8:00 (8h)');
    });

    it('formats schedule ending at midnight', () => {
      expect(formatSchedule({ startHour: 18, duration: 6 })).toBe('18:00 - 0:00 (6h)');
    });
  });
});
