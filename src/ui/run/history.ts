/**
 * Per-tick history ring buffer for the Run/Review charts. Records a compact
 * snapshot of the tank's vitals after each tick and keeps a bounded rolling
 * window; oldest entries drop past the cap. Session-scoped — not persisted.
 */

import type { SimulationState } from '../../simulation/index.js';
import { getPpm } from '../../simulation/resources/index.js';

export const RUN_HISTORY_CAP = 720; // 30 days of hourly ticks

export interface RunSnapshot {
  tick: number;
  ammonia: number;
  nitrite: number;
  nitrate: number;
  ph: number;
  oxygen: number;
  co2: number;
  temperature: number;
  /** Water level as a percentage of tank capacity. */
  waterPct: number;
  fishCount: number;
  plantAvgSize: number;
  algaeMass: number;
  food: number;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function snapshotFromState(state: SimulationState): RunSnapshot {
  const r = state.resources;
  const capacity = state.tank.capacity;
  return {
    tick: state.tick,
    ammonia: getPpm(r.ammonia, r.water),
    nitrite: getPpm(r.nitrite, r.water),
    nitrate: getPpm(r.nitrate, r.water),
    ph: r.ph,
    oxygen: r.oxygen,
    co2: r.co2,
    temperature: r.temperature,
    waterPct: capacity > 0 ? (r.water / capacity) * 100 : 0,
    fishCount: state.fish.length,
    plantAvgSize: average(state.plants.map((p) => p.size)),
    algaeMass: state.algae.mass,
    food: r.food,
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
