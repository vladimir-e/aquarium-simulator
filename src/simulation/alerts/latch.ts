/**
 * How every alert behaves at its line: it fires once on crossing, holds quiet
 * while the reading stays past it, and re-arms once the reading is back. The
 * figure it prints sits on the harm side of the line — a reading just past it
 * never rounds back onto it.
 */

import type { AlertResult } from './types.js';
import type { AlertState, SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';

export function latch(
  state: SimulationState,
  flag: keyof AlertState,
  crossed: boolean,
  source: string,
  message: string
): AlertResult {
  if (!crossed) return { log: null, alertState: { [flag]: false } };
  if (state.alertState[flag]) return { log: null, alertState: { [flag]: true } };
  return { log: createLog(state.tick, source, 'warning', message), alertState: { [flag]: true } };
}

/** `value` to `decimals`, rounded up: how a reading over its line prints. */
export function ceiled(value: number, decimals: number): string {
  return roundedToward(value, decimals, 1);
}

/** `value` to `decimals`, rounded down: how a reading under its line prints. */
export function floored(value: number, decimals: number): string {
  return roundedToward(value, decimals, -1);
}

function roundedToward(value: number, decimals: number, side: 1 | -1): string {
  const nearest = Number(value.toFixed(decimals));
  const stepped = side * (value - nearest) > 0 ? nearest + side * 10 ** -decimals : nearest;
  return stepped.toFixed(decimals);
}
