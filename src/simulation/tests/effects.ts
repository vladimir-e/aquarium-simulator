import type { Effect } from '../core/effects.js';

/** The change an effect makes, the waste pool's in grams. */
export function deltaOf(effect: Effect): number {
  return effect.resource === 'waste' ? effect.delta.grams : effect.delta;
}
