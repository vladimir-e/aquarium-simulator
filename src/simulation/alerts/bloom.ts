/**
 * A bloom alert per kind — fires once when the kind takes a meaningful share
 * of the plants' light or, with nothing planted, once its coverage reads as a
 * bloom, names the verb that takes that kind out, and resets back under.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import type { TunableConfig } from '../config/index.js';
import { ALGAE, ALGAE_KINDS, type AlgaeHabitat, type AlgaeKind } from '../algae/index.js';
import { plantLightTaken } from '../plants/canopy.js';
import { ceiled, latch } from './latch.js';

/** Share of the plants' light, %, a kind alerts past. */
export const PLANT_LIGHT_LINE = 25;

/** Coverage a kind alerts past with nothing planted for it to shade. */
export const BLOOM_COVERAGE_LINE = 30;

const ANSWER: Record<AlgaeHabitat, string> = {
  column: 'consider a water change',
  surfaces: 'consider scrubbing the glass',
};

export function bloomAlert(kind: AlgaeKind): Alert {
  const { name, habitat } = ALGAE[kind];
  return {
    id: `bloom-${kind}`,

    check(state: SimulationState, config: TunableConfig): AlertResult {
      if (state.plants.length > 0) {
        const taken = plantLightTaken(state, config.optics)[kind] * 100;
        return latch(
          state,
          kind,
          taken > PLANT_LIGHT_LINE,
          'algae',
          `${name} taking ${ceiled(taken, 0)}% of the plants' light - ${ANSWER[habitat]}`
        );
      }
      const { mass } = state.algae[kind];
      return latch(
        state,
        kind,
        mass > BLOOM_COVERAGE_LINE,
        'algae',
        `${name} bloom: ${ceiled(mass, 1)}% coverage - ${ANSWER[habitat]}`
      );
    },
  };
}

export const bloomAlerts: readonly Alert[] = ALGAE_KINDS.map(bloomAlert);
