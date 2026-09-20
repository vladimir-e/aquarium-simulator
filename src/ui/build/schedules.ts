/**
 * The clocks the rack keeps: for each scheduled device, when it runs against
 * the hour the tank is on, and the two ends that day is edited by. Spans are
 * fractions of the day so a rack row's ribbon and the rail's photoperiod strip
 * plot the same schedule the same way, midnight wrap included.
 */

import {
  isScheduleActive,
  type DailySchedule,
  type SimulationState,
} from '../../simulation/index.js';

/** A lit stretch of the 24 h track, as fractions of the day. */
export interface DaySpan {
  from: number;
  to: number;
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Any hour, on the clock face: −1 is 23, 24 is 0. */
function wrapHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

/** The hour a schedule stops, which is where the engine stores a duration. */
export function scheduleEnd(schedule: DailySchedule): number {
  return wrapHour(schedule.startHour + schedule.duration);
}

/** The same span where a rack row has room for five characters: `08–20`. */
export function scheduleHours(schedule: DailySchedule): string {
  if (schedule.duration >= 24) return 'all day';
  return `${String(schedule.startHour).padStart(2, '0')}–${String(scheduleEnd(schedule)).padStart(2, '0')}`;
}

export function scheduleRange(schedule: DailySchedule): string {
  if (schedule.duration >= 24) return 'all day';
  return `${hourLabel(schedule.startHour)}–${hourLabel(scheduleEnd(schedule))}`;
}

/**
 * A schedule is edited on the two ends it is stated by, but stored as a start
 * and a duration — so moving one end holds the other where it was, and either
 * end walked onto the other means the whole day rather than none of it. Both
 * ends walk through midnight, in either direction.
 */
export function scheduleWithStart(schedule: DailySchedule, startHour: number): DailySchedule {
  const start = wrapHour(startHour);
  return { startHour: start, duration: wrapHour(scheduleEnd(schedule) - start) || 24 };
}

export function scheduleWithEnd(schedule: DailySchedule, endHour: number): DailySchedule {
  return { ...schedule, duration: wrapHour(endHour - schedule.startHour) || 24 };
}

/** A schedule crossing midnight lights both ends of the track. */
export function scheduleSpans(schedule: DailySchedule): DaySpan[] {
  const duration = Math.min(24, schedule.duration);
  if (duration <= 0) return [];
  const end = schedule.startHour + duration;
  if (end <= 24) return [{ from: schedule.startHour / 24, to: end / 24 }];
  return [
    { from: schedule.startHour / 24, to: 1 },
    { from: 0, to: (end - 24) / 24 },
  ];
}

export type ScheduledDeviceId = 'light' | 'co2Generator' | 'autoDoser';

export interface ScheduleRow {
  id: ScheduledDeviceId;
  enabled: boolean;
  /** Running at the current hour. */
  active: boolean;
  spans: DaySpan[];
  /** The span in the five characters a rack row has for it; empty while off. */
  hours: string;
}

/** Every clock on the rack, against the one hour they are all read at. */
export interface RackSchedules {
  /** Hour of day the cursor sits on, 0–23. */
  hour: number;
  rows: ScheduleRow[];
}

export function rackSchedules(state: SimulationState): RackSchedules {
  const hour = state.tick % 24;
  const { light, co2Generator, autoDoser } = state.equipment;
  // The doser fires once, at its start hour: a one-hour span is what it occupies.
  const doserSchedule: DailySchedule = { startHour: autoDoser.schedule.startHour, duration: 1 };

  return {
    hour,
    rows: [
      {
        id: 'light',
        enabled: light.enabled,
        active: light.enabled && isScheduleActive(hour, light.schedule),
        spans: light.enabled ? scheduleSpans(light.schedule) : [],
        hours: light.enabled ? scheduleHours(light.schedule) : '',
      },
      {
        id: 'co2Generator',
        enabled: co2Generator.enabled,
        active: co2Generator.enabled && isScheduleActive(hour, co2Generator.schedule),
        spans: co2Generator.enabled ? scheduleSpans(co2Generator.schedule) : [],
        hours: co2Generator.enabled ? scheduleHours(co2Generator.schedule) : '',
      },
      {
        id: 'autoDoser',
        enabled: autoDoser.enabled,
        active: autoDoser.enabled && hour === autoDoser.schedule.startHour,
        spans: autoDoser.enabled ? scheduleSpans(doserSchedule) : [],
        hours: autoDoser.enabled ? hourLabel(autoDoser.schedule.startHour) : '',
      },
    ],
  };
}
