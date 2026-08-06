/**
 * Light equipment for photoperiod control.
 * Provides illumination based on a daily schedule.
 */

import type { DailySchedule } from '../core/schedule.js';
import { isScheduleActive } from '../core/schedule.js';
import { type LightConfig, lightDefaults } from '../config/light.js';

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
 * Fixture catalog for UI selection. At the 150 L reference tank these land
 * 16 / 33 / 59 / 98 PAR on the substrate — the hobby's low / medium / high /
 * very high tiers.
 */
export const LIGHT_PAR_OPTIONS: LightPar[] = [25, 50, 90, 150];

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
 * @param config - Light configuration (attenuation coefficient)
 * @returns PAR at that depth (µmol/m²/s)
 */
export function calculateParAtDepth(
  surfacePar: number,
  depthCm: number,
  config: LightConfig = lightDefaults
): number {
  if (surfacePar <= 0) return 0;

  const attenuation = config.waterAttenuationPerCm * Math.max(0, depthCm);
  return surfacePar * Math.exp(-attenuation);
}
