/**
 * Per-tick history recorder for the calibration CLI.
 *
 * Keeps a bounded rolling window of snapshots. When the cap is exceeded we
 * drop the oldest entries — calibration runs rarely care about ancient state,
 * and a hard cap keeps the session file size predictable.
 */

import type { SimulationState } from '../simulation/index.js';

export const HISTORY_CAP = 720; // 30 days of hourly samples

export interface HistorySnapshot {
  tick: number;
  resources: {
    water: number;
    temperature: number;
    surface: number;
    flow: number;
    light: number;
    aeration: boolean;
    food: number;
    waste: number;
    algae: number;
    ammonia: number;
    nitrite: number;
    nitrate: number;
    phosphate: number;
    potassium: number;
    iron: number;
    oxygen: number;
    co2: number;
    ph: number;
    aob: number;
    nob: number;
  };
  fish: { count: number; avgHealth: number };
  plants: { count: number; avgCondition: number };
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function snapshot(state: SimulationState): HistorySnapshot {
  const r = state.resources;
  return {
    tick: state.tick,
    resources: {
      water: r.water,
      temperature: r.temperature,
      surface: r.surface,
      flow: r.flow,
      light: r.light,
      aeration: r.aeration,
      food: r.food,
      waste: r.waste,
      algae: r.algae,
      ammonia: r.ammonia,
      nitrite: r.nitrite,
      nitrate: r.nitrate,
      phosphate: r.phosphate,
      potassium: r.potassium,
      iron: r.iron,
      oxygen: r.oxygen,
      co2: r.co2,
      ph: r.ph,
      aob: r.aob,
      nob: r.nob,
    },
    fish: {
      count: state.fish.length,
      avgHealth: avg(state.fish.map((f) => f.health)),
    },
    plants: {
      count: state.plants.length,
      avgCondition: avg(state.plants.map((p) => p.condition)),
    },
  };
}

export function appendSnapshot(
  history: HistorySnapshot[],
  entry: HistorySnapshot
): HistorySnapshot[] {
  const next = history.concat(entry);
  if (next.length <= HISTORY_CAP) return next;
  return next.slice(next.length - HISTORY_CAP);
}
