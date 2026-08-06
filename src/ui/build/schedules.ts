/**
 * The 24 h schedule band: when each scheduled device runs, against the current
 * hour. Spans are fractions of the day so the band and the rail's photoperiod
 * strip plot the same schedule the same way, midnight wrap included.
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

export function scheduleRange(schedule: DailySchedule): string {
  if (schedule.duration >= 24) return 'all day';
  return `${hourLabel(schedule.startHour)}–${hourLabel((schedule.startHour + schedule.duration) % 24)}`;
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
  label: string;
  enabled: boolean;
  /** Running at the current hour. */
  active: boolean;
  spans: DaySpan[];
  detail: string;
}

export interface ScheduleBand {
  /** Hour of day the cursor sits on, 0–23. */
  hour: number;
  rows: ScheduleRow[];
}

export function scheduleBand(state: SimulationState): ScheduleBand {
  const hour = state.tick % 24;
  const { light, co2Generator, autoDoser } = state.equipment;
  // The doser fires once, at its start hour: a one-hour span is what it occupies.
  const doserSchedule: DailySchedule = { startHour: autoDoser.schedule.startHour, duration: 1 };

  return {
    hour,
    rows: [
      {
        id: 'light',
        label: 'Light',
        enabled: light.enabled,
        active: light.enabled && isScheduleActive(hour, light.schedule),
        spans: light.enabled ? scheduleSpans(light.schedule) : [],
        detail: light.enabled
          ? `${scheduleRange(light.schedule)} · ${light.par} PAR`
          : `off · would run ${scheduleRange(light.schedule)}`,
      },
      {
        id: 'co2Generator',
        label: 'CO₂ injector',
        enabled: co2Generator.enabled,
        active: co2Generator.enabled && isScheduleActive(hour, co2Generator.schedule),
        spans: co2Generator.enabled ? scheduleSpans(co2Generator.schedule) : [],
        detail: co2Generator.enabled
          ? `${scheduleRange(co2Generator.schedule)} · ${co2Generator.bubbleRate.toFixed(1)} bps`
          : `off · would run ${scheduleRange(co2Generator.schedule)}`,
      },
      {
        id: 'autoDoser',
        label: 'Auto doser',
        enabled: autoDoser.enabled,
        active: autoDoser.enabled && hour === autoDoser.schedule.startHour,
        spans: autoDoser.enabled ? scheduleSpans(doserSchedule) : [],
        detail: autoDoser.enabled
          ? `${hourLabel(autoDoser.schedule.startHour)} · ${autoDoser.doseAmountMl.toFixed(1)} ml`
          : `off · would dose at ${hourLabel(autoDoser.schedule.startHour)}`,
      },
    ],
  };
}
