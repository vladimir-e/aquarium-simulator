import type { Effect } from '../core/effects.js';

/** The change an effect makes, an organic pool's in grams. */
export function deltaOf(effect: Effect): number {
  return typeof effect.delta === 'number' ? effect.delta : effect.delta.grams;
}
