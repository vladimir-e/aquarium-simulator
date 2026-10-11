import { debParams, gutCapacity, NO_STRESS } from '../../simulation/index.js';
import type { Fish } from '../../simulation/state.js';
import { fishRecord } from '../../simulation/tests/fish.js';

/** Grams in the gut of this fish, this full, at its pace in 20 °C water; a stocked neon when none is named. */
export function gutAt(fullness: number, fish: Pick<Fish, 'species' | 'budget'> = fishRecord()): number {
  return fullness * gutCapacity(fish, { tau: 1, omega: 1, stress: NO_STRESS });
}

export const FED = gutAt(1);

/** The fish with its reserve at density `e`: a stocked fish reads hungry at 0.6, starving at 0. */
export function atReserve<F extends Pick<Fish, 'species' | 'budget'>>(fish: F, e: number): F {
  const p = debParams(fish.species);
  return { ...fish, budget: { ...fish.budget, reserve: (e * p.pAm * fish.budget.structure) / p.v } };
}

export const hungry = <F extends Pick<Fish, 'species' | 'budget'>>(fish: F): F => atReserve(fish, 0.6);
export const starving = <F extends Pick<Fish, 'species' | 'budget'>>(fish: F): F => atReserve(fish, 0);
