/**
 * The waste pool: what stands in the tank, what feeds it each hour, and what
 * leaves it. Every rate is the engine's own: what the next tick's plants and
 * blooms shed and its fish pass, and what that tick's decomposition rots and
 * settles out of the pool it meets. A death's one-off lump is an event, not a
 * rate, so no source counts it.
 */

import {
  ALGAE_KINDS,
  addOrganics,
  decompose,
  rotPace,
  type Organics,
  type PoolShares,
  type SimulationState,
} from '../../simulation/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { HourAhead } from './ahead.js';

export type WasteSourceKey = 'fish' | 'plants' | 'algae';

export interface WasteSource {
  key: WasteSourceKey;
  label: string;
  /** What it feeds the pool an hour, its content with it. */
  inflow: Organics;
  gramsPerHour: number;
  /** Share of the hour's production, 0–1. */
  share: number;
}

export interface WasteInflowReadout {
  perHour: number;
  sources: WasteSource[];
}

export interface WasteReadout extends WasteInflowReadout {
  /** Waste standing in the tank, grams. */
  standing: number;
  /** Grams rotting this hour. */
  mineralised: number;
  /** Grams settling into the bed this hour — the pool's other outflow. */
  settled: number;
  /** Share of the pool the hour's rot and settling take together. */
  lost: number;
  /** Food waiting to rot, grams. */
  food: number;
  /** Fraction of standing food that rots this hour, at this temperature and oxygen. */
  decayRate: number;
  /** Q10 temperature multiplier on rot. */
  q10: number;
}

const LABEL: Record<WasteSourceKey, string> = {
  fish: 'Fish',
  plants: 'Plants',
  algae: 'Algae',
};

export function wasteInflow(ahead: HourAhead): WasteInflowReadout {
  const inflow: Record<WasteSourceKey, Organics> = {
    fish: ahead.fishWaste,
    plants: ahead.shedding,
    algae: addOrganics(...ALGAE_KINDS.map((kind) => ahead.algae[kind].shedding)),
  };

  const perHour = Object.values(inflow).reduce((sum, organics) => sum + organics.grams, 0);
  const sources = (Object.keys(LABEL) as WasteSourceKey[]).map((key) => ({
    key,
    label: LABEL[key],
    inflow: inflow[key],
    gramsPerHour: inflow[key].grams,
    share: perHour > 0 ? inflow[key].grams / perHour : 0,
  }));

  return { perHour, sources };
}

const rotShare = (shares: PoolShares): number => shares.aerobic + shares.anaerobic;

export function wasteReadout(
  state: SimulationState,
  config: TunableConfig,
  ahead: HourAhead
): WasteReadout {
  const r = state.resources;
  const shares = ahead.decomposition.waste;
  const hour = decompose(ahead.pools.waste, shares);
  return {
    ...wasteInflow(ahead),
    standing: r.waste.grams,
    mineralised: hour.rotted.grams,
    settled: hour.settled.grams,
    lost: rotShare(shares) + shares.settling,
    food: r.food.grams,
    decayRate: rotShare(ahead.decomposition.food),
    q10: rotPace(r.temperature, config.decomposition),
  };
}

/**
 * Where the pool levels off. Everything feeding it lands before the hour's
 * decomposition, which takes its share of all of it, so the level is where
 * that share of what stands plus the hour's production equals the production.
 */
export function wasteLevel(readout: WasteReadout): number {
  return (readout.perHour * (1 - readout.lost)) / readout.lost;
}

export function wasteSummary(readout: WasteReadout): string {
  if (readout.perHour <= 0) return 'Nothing is producing waste.';

  const level = wasteLevel(readout);
  const drift =
    readout.standing < level * 0.98
      ? 'climbing to'
      : readout.standing > level * 1.02
        ? 'falling to'
        : 'holding at';

  return `Producing ${readout.perHour.toFixed(3)} g/h against ${readout.mineralised.toFixed(3)} g/h mineralised — standing waste is ${drift} ${level.toFixed(3)} g.`;
}
