/**
 * Light equipment for photoperiod control.
 * Provides illumination based on a daily schedule.
 */

import type { DailySchedule } from '../core/schedule.js';
import { isScheduleActive } from '../core/schedule.js';

export type LightWattage = 50 | 100 | 150 | 200;

export interface Light {
  /** Whether light fixture is installed/enabled */
  enabled: boolean;
  /** Light power output in watts */
  wattage: number;
  /** Photoperiod schedule (start hour + duration) */
  schedule: DailySchedule;
}

export const DEFAULT_LIGHT: Light = {
  enabled: true,
  wattage: 100,
  schedule: {
    startHour: 8, // 8am
    duration: 10, // 10 hours (8am-6pm)
  },
};

/** Common light wattage options for UI selection */
export const LIGHT_WATTAGE_OPTIONS: LightWattage[] = [50, 100, 150, 200];

/**
 * Calculates the current light output based on schedule.
 * Returns wattage when light is enabled and schedule is active, 0 otherwise.
 *
 * @param light - Light equipment configuration
 * @param hourOfDay - Current hour (0-23)
 * @returns Light output in watts
 */
export function getLightOutput(light: Light, hourOfDay: number): number {
  if (!light.enabled) {
    return 0;
  }

  const isActive = isScheduleActive(hourOfDay, light.schedule);
  return isActive ? light.wattage : 0;
}
