/**
 * Light equipment for photoperiod control.
 * Provides illumination based on a daily schedule.
 */

import type { DailySchedule } from '../core/schedule.js';
import { isScheduleActive } from '../core/schedule.js';

export type LightPar = 25 | 50 | 90 | 150;

export interface Light {
  /** Whether light fixture is installed/enabled */
  enabled: boolean;
  /**
   * Rated PAR at the water surface directly beneath the fixture
   * (µmol/m²/s, 400–700 nm) — the figure manufacturers publish.
   */
  par: number;
  /** Photoperiod schedule (start hour + duration) */
  schedule: DailySchedule;
}

export const DEFAULT_LIGHT: Light = {
  enabled: true,
  par: 50,
  schedule: {
    startHour: 8, // 8am
    duration: 10, // 10 hours (8am-6pm)
  },
};

/**
 * Fixture catalog for UI selection — the hobby's low / medium / high / very
 * high tiers.
 */
export const LIGHT_PAR_OPTIONS: LightPar[] = [25, 50, 90, 150];

/**
 * Full noon sunlight at the surface. No fixture hung over a tank exceeds it,
 * so a rating past this is a typo rather than a lighting choice.
 */
export const MAX_LIGHT_PAR = 2000;

/**
 * Calculates the current light output based on schedule.
 * Returns the fixture's rated surface PAR when enabled and the schedule is
 * active, 0 otherwise.
 *
 * @param light - Light equipment configuration
 * @param hourOfDay - Current hour (0-23)
 * @returns PAR at the water surface (µmol/m²/s)
 */
export function getLightOutput(light: Light, hourOfDay: number): number {
  if (!light.enabled) {
    return 0;
  }

  const isActive = isScheduleActive(hourOfDay, light.schedule);
  return isActive ? light.par : 0;
}

/**
 * PAR surviving a given depth of water, Beer–Lambert.
 *
 * @param surfacePar - PAR at the water surface (µmol/m²/s)
 * @param depthCm - Depth of water the light travels through
 * @param extinction - The water's extinction as it stands, per cm (`waterExtinction`)
 * @returns PAR at that depth (µmol/m²/s)
 */
export function calculateParAtDepth(surfacePar: number, depthCm: number, extinction: number): number {
  if (surfacePar <= 0) return 0;

  return surfacePar * Math.exp(-extinction * Math.max(0, depthCm));
}

const HOURS_PER_DAY = 24;

/** µmol/m²/s held for an hour, in mol/m². */
const MOL_PER_PAR_HOUR = 3600 / 1e6;

/**
 * PAR at `depthCm` for every hour of the day under the fixture's schedule —
 * the light history a tank that has run this schedule all along, through water
 * of this extinction, carries.
 */
export function scheduledLightByHour(light: Light, depthCm: number, extinction: number): number[] {
  return Array.from({ length: HOURS_PER_DAY }, (_, hour) =>
    calculateParAtDepth(getLightOutput(light, hour), depthCm, extinction)
  );
}

/** Daily light integral of a 24-hour PAR history, mol/m²/d. */
export function dailyLightIntegral(lightByHour: readonly number[]): number {
  return lightByHour.reduce((total, par) => total + par, 0) * MOL_PER_PAR_HOUR;
}

/** A PAR held for `hours` a day, as a daily light integral in mol/m²/d. */
export function parHoursToDli(par: number, hours: number): number {
  return par * hours * MOL_PER_PAR_HOUR;
}
