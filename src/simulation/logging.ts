/**
 * Logging utilities for the simulation.
 * Provides types and helpers for creating log entries.
 */

export type LogSeverity = 'info' | 'warning';

export interface LogEntry {
  /** Simulation tick when event occurred */
  tick: number;
  /** System/component emitting event (e.g., 'user', 'heater', 'evaporation') */
  source: string;
  /** Severity level */
  severity: LogSeverity;
  /** Human-readable description */
  message: string;
}

/**
 * Creates a log entry with the current tick from state.
 */
export function createLog(
  tick: number,
  source: string,
  severity: LogSeverity,
  message: string
): LogEntry {
  return {
    tick,
    source,
    severity,
    message,
  };
}
