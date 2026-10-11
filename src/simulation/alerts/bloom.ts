/**
 * A bloom alert per kind — fires once when its `bloomLevel` passes 1, names the
 * figure that leads it and the action that takes the kind out, and resets back
 * under.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import type { TunableConfig } from '../config/index.js';
import { ALGAE, ALGAE_KINDS, bloomCoverage, REMOVED_BY, type AlgaeKind, type BloomRemoval } from '../algae/index.js';
import { plantLightTaken } from '../plants/canopy.js';
import { ceiled, latch } from './latch.js';

/** Share of the plants' light, %, a kind alerts past. */
export const PLANT_LIGHT_LINE = 25;

/** Coverage a kind alerts past. */
export const BLOOM_COVERAGE_LINE = 30;

/** Coverage a bloom shows from: under it there is none to see. */
export const BLOOM_VISIBLE_LINE = 0.5;

export interface BloomLevel {
  level: number;
  leads: 'coverage' | 'light';
}

/**
 * How far a bloom stands toward its alert: the further of its coverage and the
 * share of the plants' light it takes, %, each as a multiple of its line, and
 * which of the two that is. Past 1 it alerts.
 */
export function bloomLevel(coverage: number, taken: number): BloomLevel {
  const covered = coverage / BLOOM_COVERAGE_LINE;
  const light = taken / PLANT_LIGHT_LINE;
  return light >= covered ? { level: light, leads: 'light' } : { level: covered, leads: 'coverage' };
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
      const coverage = bloomCoverage(state, kind);
      const taken = plantLightTaken(state, config.optics)[kind] * 100;
      const { level, leads } = bloomLevel(coverage, taken);
      return latch(
        state,
        kind,
        level > 1,
        'algae',
        leads === 'light'
          ? `${name} taking ${ceiled(taken, 0)}% of the plants' light - ${advice}`
          : `${name} bloom: ${ceiled(coverage, 1)}% coverage - ${advice}`
      );
    },
  };
}

export const bloomAlerts: readonly Alert[] = ALGAE_KINDS.map(bloomAlert);
