/**
 * Per-tick history ring buffer for the timeline tracks. Records a compact
 * snapshot of the tank's vitals after each tick and keeps a bounded rolling
 * window; oldest entries drop past the cap. Session-scoped — not persisted.
 */

import { countFry, getLightOutput, mapKinds, type AlgaeKind, type SimulationState } from '../../simulation/index.js';
import { getDgh, getDkh, getPpm } from '../../simulation/resources/index.js';
import { getPh } from '../../simulation/core/carbonate.js';

export const RUN_HISTORY_CAP = 720; // 30 days of hourly ticks

export interface RunSnapshot {
  tick: number;
  ammonia: number;
  nitrite: number;
  nitrate: number;
  ph: number;
  kh: number;
  gh: number;
  oxygen: number;
  co2: number;
  temperature: number;
  /** Water level as a percentage of tank capacity. */
  waterPct: number;
  /** Adults only — fry are counted apart, as the roster counts them. */
  fishCount: number;
  fryCount: number;
  plantCount: number;
  /** Each kind's coverage, 0–100. */
  algae: Record<AlgaeKind, number>;
  food: number;
  lightOn: boolean;
}

export function snapshotFromState(state: SimulationState): RunSnapshot {
  const r = state.resources;
  const capacity = state.tank.capacity;
  const fryCount = countFry(state.fish);
  return {
    tick: state.tick,
    ammonia: getPpm(r.ammonia, r.water),
    nitrite: getPpm(r.nitrite, r.water),
    nitrate: getPpm(r.nitrate, r.water),
    ph: getPh(r),
    kh: getDkh(r.kh, r.water),
    gh: getDgh(r.gh, r.water),
    oxygen: r.oxygen,
    co2: r.co2,
    temperature: r.temperature,
    waterPct: capacity > 0 ? (r.water / capacity) * 100 : 0,
    fishCount: state.fish.length - fryCount,
    fryCount,
    plantCount: state.plants.length,
    algae: mapKinds((kind) => state.algae[kind].mass),
    food: r.food,
    lightOn: getLightOutput(state.equipment.light, state.tick % 24) > 0,
  };
}

/** Append a snapshot, dropping the oldest entries once past the cap. */
export function appendRunSnapshot(
  history: RunSnapshot[],
  snapshot: RunSnapshot
): RunSnapshot[] {
  const next = history.concat(snapshot);
  if (next.length <= RUN_HISTORY_CAP) return next;
  return next.slice(next.length - RUN_HISTORY_CAP);
}
