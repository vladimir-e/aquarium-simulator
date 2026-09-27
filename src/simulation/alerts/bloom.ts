/**
 * A bloom alert per kind — fires once when its level passes 1: its coverage
 * past `BLOOM_COVERAGE_LINE`, or the share of the plants' light it takes past
 * `PLANT_LIGHT_LINE`. It names the figure further past its line and the action
 * that takes the kind out, and resets back under.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import type { TunableConfig } from '../config/index.js';
import { ALGAE, ALGAE_KINDS, REMOVED_BY, type AlgaeKind, type BloomRemoval } from '../algae/index.js';
import { plantLightTaken } from '../plants/canopy.js';
import { ceiled, latch } from './latch.js';

/** Share of the plants' light, %, a kind alerts past. */
export const PLANT_LIGHT_LINE = 25;

/** Coverage a kind alerts past. */
export const BLOOM_COVERAGE_LINE = 30;

/**
 * How far a bloom stands toward its alert: the further of its coverage and the
 * share of the plants' light it takes, %, each as a multiple of its line. Past
 * 1 it alerts.
 */
export function bloomLevel(mass: number, taken: number): number {
  return Math.max(mass / BLOOM_COVERAGE_LINE, taken / PLANT_LIGHT_LINE);
}

const ADVICE: Record<BloomRemoval, string> = {
  waterChange: 'consider a water change',
  scrubAlgae: 'consider scrubbing the glass',
};

export function bloomAlert(kind: AlgaeKind): Alert {
  const { name, habitat } = ALGAE[kind];
  const advice = ADVICE[REMOVED_BY[habitat]];
  return {
    id: `bloom-${kind}`,

    check(state: SimulationState, config: TunableConfig): AlertResult {
      const { mass } = state.algae[kind];
      const taken = plantLightTaken(state, config.optics)[kind] * 100;
      return latch(
        state,
        kind,
        bloomLevel(mass, taken) > 1,
        'algae',
        taken / PLANT_LIGHT_LINE >= mass / BLOOM_COVERAGE_LINE
          ? `${name} taking ${ceiled(taken, 0)}% of the plants' light - ${advice}`
          : `${name} bloom: ${ceiled(mass, 1)}% coverage - ${advice}`
      );
    },
  };
}

export const bloomAlerts: readonly Alert[] = ALGAE_KINDS.map(bloomAlert);
