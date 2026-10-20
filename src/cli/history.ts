/**
 * Per-tick history recorder for the headless CLI.
 *
 * Keeps a bounded rolling window of snapshots. When the cap is exceeded we
 * drop the oldest entries — headless runs rarely care about ancient state,
 * and a hard cap keeps the session file size predictable.
 */

import { bloomCoverage, bloomParams, mapKinds, wellFed, type AlgaeKind, type SimulationState } from '../simulation/index.js';
import type { TunableConfig } from '../simulation/config/index.js';

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
    ammonia: number;
    nitrite: number;
    nitrate: number;
    phosphate: number;
    potassium: number;
    iron: number;
    oxygen: number;
    co2: number;
    kh: number;
    gh: number;
    aob: number;
    nob: number;
  };
  fish: { count: number; avgHealth: number };
  plants: { count: number; avgCondition: number };
  algae: Record<AlgaeKind, BloomTrace>;
}

/** A bloom as the trace reads it: its coverage, its condition and its reserve density. */
export interface BloomTrace {
  coverage: number;
  condition: number;
  reserve: number;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function snapshot(state: SimulationState, config: TunableConfig): HistorySnapshot {
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
      food: r.food.grams,
      waste: r.waste.grams,
      ammonia: r.ammonia,
      nitrite: r.nitrite,
      nitrate: r.nitrate,
      phosphate: r.phosphate,
      potassium: r.potassium,
      iron: r.iron,
      oxygen: r.oxygen,
      co2: r.co2,
      kh: r.kh,
      gh: r.gh,
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
    algae: mapKinds((kind) => ({
      coverage: bloomCoverage(state, kind),
      condition: state.algae[kind].condition,
      reserve: wellFed(state.algae[kind].budget, bloomParams(kind, config.plants)),
    })),
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
