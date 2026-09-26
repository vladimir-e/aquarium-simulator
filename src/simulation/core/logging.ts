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
  | 'fish-died' // a fish died (any cause)
  | 'plant-died' // a plant died from poor conditions
  | 'plant-propagated' // a full bank bought an offshoot — a runner, plantlet or rhizome branch
  | 'fry-sold'; // the sell-fry action removed every fry at once

/** A figure a log line states, kept in engine units so each reader renders it in its own. */
export type LogQuantity =
  | { kind: 'volume'; liters: number }
  | { kind: 'temperature'; celsius: number };

export interface LogEntry {
  /** Simulation tick when event occurred */
  tick: number;
  /** System/component emitting event (e.g., 'user', 'heater', 'evaporation') */
  source: string;
  /** Severity level */
  severity: LogSeverity;
  /** Human-readable description; `{0}`, `{1}`… stand for its `quantities` — read it through `logText`. */
  message: string;
  quantities?: LogQuantity[];
  /** Typed discriminator for consumers that detect events programmatically. */
  event?: LogEvent;
  /** Organisms an event accounts for when it isn't one-per-entry (fry born,
   * eggs hatched, fry sold), so consumers get the magnitude, not just the kind. */
  count?: number;
}

export type LogText = Pick<LogEntry, 'message' | 'quantities'>;

export const liters = (value: number): LogQuantity => ({ kind: 'volume', liters: value });
export const celsius = (value: number): LogQuantity => ({ kind: 'temperature', celsius: value });

/** A log line whose figures stay quantities: measured`Topped off: +${liters(x)}`. */
export function measured(
  parts: TemplateStringsArray,
  ...values: (string | number | LogQuantity)[]
): LogText {
  const quantities: LogQuantity[] = [];
  const message = parts.reduce((text, part, i) => {
    const value = values[i - 1];
    if (typeof value !== 'object') return `${text}${value}${part}`;
    quantities.push(value);
    return `${text}{${quantities.length - 1}}${part}`;
  });
  return { message, quantities };
}

export type QuantityFormat = (quantity: LogQuantity) => string;

export const metricQuantity: QuantityFormat = (quantity) =>
  quantity.kind === 'volume'
    ? `${quantity.liters.toFixed(1)} L`
    : `${quantity.celsius.toFixed(1)}°C`;

/** A log line as its reader reads it, every quantity rendered by `format`. */
export function logText(
  { message, quantities }: LogText,
  format: QuantityFormat = metricQuantity
): string {
  if (!quantities) return message;
  return message.replace(/\{(\d+)\}/g, (_, index: string) => format(quantities[Number(index)]));
}

/**
 * Creates a log entry with the current tick from state.
 */
export function createLog(
  tick: number,
  source: string,
  severity: LogSeverity,
  text: string | LogText,
  event?: LogEvent,
  count?: number
): LogEntry {
  return {
    tick,
    source,
    severity,
    ...(typeof text === 'string' ? { message: text } : text),
    ...(event ? { event } : {}),
    ...(count !== undefined ? { count } : {}),
  };
}
