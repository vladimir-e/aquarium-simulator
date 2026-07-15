/**
 * Logging utilities for the simulation.
 * Provides types and helpers for creating log entries.
 */

export type LogSeverity = 'info' | 'warning';

/**
 * Machine-readable discriminator for log entries that game consumers
 * need to detect reliably (the free-text `message` is for humans only).
 * Absent on incidental logs; present on every lifecycle moment a
 * downstream system reacts to.
 */
export type LogEvent =
  | 'fish-spawned' // livebearer live birth — fry added directly
  | 'eggs-laid' // egg-laying spawn — a clutch was created
  | 'eggs-hatched' // a clutch reached its hatch time — fry added
  | 'fish-died'; // a fish died (any cause)

export interface LogEntry {
  /** Simulation tick when event occurred */
  tick: number;
  /** System/component emitting event (e.g., 'user', 'heater', 'evaporation') */
  source: string;
  /** Severity level */
  severity: LogSeverity;
  /** Human-readable description */
  message: string;
  /** Typed discriminator for consumers that detect events programmatically. */
  event?: LogEvent;
}

/**
 * Creates a log entry with the current tick from state.
 */
export function createLog(
  tick: number,
  source: string,
  severity: LogSeverity,
  message: string,
  event?: LogEvent
): LogEntry {
  return {
    tick,
    source,
    severity,
    message,
    ...(event ? { event } : {}),
  };
}
