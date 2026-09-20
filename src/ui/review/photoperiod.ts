import type { DailySchedule } from '../../simulation/index.js';
import { TICKS_PER_DAY } from '../utils/clock.js';
import type { TickRange } from './window.js';

export interface TickSpan {
  from: number;
  to: number;
}

/**
 * The lit hours the fixture ran, clipped to the window — the faint band behind
 * every track, so a plant's flat night and an oxygen sag read against the
 * light that caused them. An unpowered or zero-hour fixture lights nothing.
 */
export function photoperiodSpans(
  range: TickRange | null,
  schedule: DailySchedule | null
): TickSpan[] {
  if (!range || !schedule || schedule.duration <= 0) return [];
  const spans: TickSpan[] = [];
  const firstDay = Math.floor(range.minTick / TICKS_PER_DAY) - 1;
  const lastDay = Math.floor(range.maxTick / TICKS_PER_DAY);
  for (let day = firstDay; day <= lastDay; day++) {
    const dawn = day * TICKS_PER_DAY + schedule.startHour;
    const from = Math.max(range.minTick, dawn);
    const to = Math.min(range.maxTick, dawn + schedule.duration);
    if (to > from) spans.push({ from, to });
  }
  return spans;
}
