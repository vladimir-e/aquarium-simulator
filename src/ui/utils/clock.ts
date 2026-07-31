/**
 * Ticks are simulated hours. One home for turning them into calendar language,
 * so the timeline's clock, the scrubber's readout and the run-length tile can
 * never disagree about which day a tick falls on.
 */

export const TICKS_PER_DAY = 24;

/** Day the tick falls on, counting from day 1 at tick 0. */
export function dayNumber(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY) + 1;
}

export function hourOfDay(tick: number): number {
  return tick % TICKS_PER_DAY;
}

/** Wall-clock reading for a tick: `Day 68 · 14:00`. */
export function formatDayClock(tick: number): string {
  const hour = hourOfDay(tick);
  return `Day ${dayNumber(tick)} · ${hour < 10 ? '0' : ''}${hour}:00`;
}

/** Span of ticks as elapsed time: `67d 14h`, `14h`, `3d`. */
export function formatElapsed(ticks: number): string {
  const days = Math.floor(ticks / TICKS_PER_DAY);
  const hours = ticks % TICKS_PER_DAY;
  if (days === 0) return `${hours}h`;
  if (hours === 0) return `${days}d`;
  return `${days}d ${hours}h`;
}
