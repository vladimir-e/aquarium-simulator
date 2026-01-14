/**
 * Centralized scheduling system for time-based equipment.
 * Supports daily photoperiod schedules (start hour + duration).
 */

/**
 * Daily photoperiod schedule - repeats every 24 hours
 */
export interface DailySchedule {
  /** Hour of day when equipment activates (0-23) */
  startHour: number;
  /** How many hours equipment stays on */
  duration: number;
}

/**
 * Check if equipment should be active based on current hour and schedule.
 * Handles schedules that wrap around midnight.
 *
 * @param hourOfDay - Current hour (0-23)
 * @param schedule - Daily schedule configuration
 * @returns true if equipment should be on
 *
 * @example
 * // Daytime schedule (8am-6pm)
 * isScheduleActive(10, { startHour: 8, duration: 10 }) // true
 * isScheduleActive(20, { startHour: 8, duration: 10 }) // false
 *
 * @example
 * // Midnight wrap-around (10pm-6am)
 * isScheduleActive(23, { startHour: 22, duration: 8 }) // true
 * isScheduleActive(2, { startHour: 22, duration: 8 })  // true
 * isScheduleActive(10, { startHour: 22, duration: 8 }) // false
 */
export function isScheduleActive(
  hourOfDay: number,
  schedule: DailySchedule
): boolean {
  const { startHour, duration } = schedule;
  const endHour = (startHour + duration) % 24;

  // Handle schedule that wraps around midnight
  if (endHour <= startHour) {
    // Wraps around: active from startHour to 23, then 0 to endHour
    return hourOfDay >= startHour || hourOfDay < endHour;
  } else {
    // Normal: active from startHour to endHour
    return hourOfDay >= startHour && hourOfDay < endHour;
  }
}

/**
 * Validate schedule parameters
 * @param schedule - Schedule to validate
 * @returns true if schedule is valid
 */
export function isValidSchedule(schedule: DailySchedule): boolean {
  return (
    Number.isInteger(schedule.startHour) &&
    schedule.startHour >= 0 &&
    schedule.startHour <= 23 &&
    schedule.duration > 0 &&
    schedule.duration <= 24
  );
}

/**
 * Format schedule as human-readable string
 * @example "8:00 - 18:00 (10h)"
 */
export function formatSchedule(schedule: DailySchedule): string {
  const startTime = `${schedule.startHour}:00`;
  const endHour = (schedule.startHour + schedule.duration) % 24;
  const endTime = `${endHour}:00`;
  return `${startTime} - ${endTime} (${schedule.duration}h)`;
}
