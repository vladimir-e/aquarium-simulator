/**
 * The waste pool: what stands in the tank, what feeds it each hour, and what
 * leaves it into the nitrogen cycle. Every rate is the engine's own: what the
 * next tick's plants and bloom shed, its fish pass and the food they leave decays into,
 * and the leaching off the tank as it stands. A death's one-off lump is an
 * event, not a rate, so no source counts it.
 */

import {
  ALGAE_KINDS,
  calculateSubstrateLeach,
  decayFraction,
  wasteSettlingShare,
  getTemperatureFactor,
  type SimulationState,
} from '../../simulation/index.js';
import { calculateWasteToAmmonia } from '../../simulation/systems/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { HourAhead } from './ahead.js';

export type WasteSourceKey = 'food' | 'fish' | 'plants' | 'algae' | 'substrate';

export interface WasteSource {
  key: WasteSourceKey;
  label: string;
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
  /** Grams mineralised into ammonia this hour. */
  mineralised: number;
  /** Share of standing waste settling into the bed this hour. */
  settlingShare: number;
  /** Grams settling into the bed this hour — the pool's other outflow. */
  settled: number;
  /** Food waiting to decay, grams. */
  food: number;
  /** Fraction of standing food that decays this hour, at this temperature and oxygen. */
  decayRate: number;
  /** Q10 temperature multiplier on decay. */
  q10: number;
}

const LABEL: Record<WasteSourceKey, string> = {
  food: 'Food decay',
  fish: 'Fish',
  plants: 'Plants',
  algae: 'Algae',
  substrate: 'Substrate',
};

export function wasteInflow(
  state: SimulationState,
  config: TunableConfig,
  ahead: HourAhead
): WasteInflowReadout {
  const grams: Record<WasteSourceKey, number> = {
    food: ahead.foodWaste,
    fish: ahead.fishWaste,
    plants: ahead.shedding,
    algae: ALGAE_KINDS.reduce((sum, kind) => sum + ahead.algae[kind].shedding, 0),
    substrate: calculateSubstrateLeach(state.equipment.substrate.organicReserve, config.decay),
  };

  const perHour = Object.values(grams).reduce((sum, g) => sum + g, 0);
  const sources = (Object.keys(LABEL) as WasteSourceKey[]).map((key) => ({
    key,
    label: LABEL[key],
    gramsPerHour: grams[key],
    share: perHour > 0 ? grams[key] / perHour : 0,
  }));

  return { perHour, sources };
}

/** Sources the engine applies before the passive tier, and so before the nitrogen cycle. */
const BEFORE_CYCLE: WasteSourceKey[] = ['fish', 'plants', 'algae', 'substrate'];

function beforeCycleInflow(inflow: WasteInflowReadout): number {
  return inflow.sources
    .filter((source) => BEFORE_CYCLE.includes(source.key))
    .reduce((total, source) => total + source.gramsPerHour, 0);
}

/**
 * The waste mineralisation works on this hour. The substrate trades with the
 * pool in the immediate tier — a share settles out, the leach comes in — and
 * fish, plants and the blooms shed in the active tier, so the passive nitrogen cycle
 * already sees all of it; food decay is collected in the same passive pass and
 * only arrives next hour.
 */
export function mineralisationBase(state: SimulationState, config: TunableConfig, inflow: WasteInflowReadout): number {
  const standing = state.resources.waste * (1 - wasteSettlingShare(state, config.decay));
  return standing + beforeCycleInflow(inflow);
}

export function wasteReadout(
  state: SimulationState,
  config: TunableConfig,
  ahead: HourAhead
): WasteReadout {
  const r = state.resources;
  const q10 = getTemperatureFactor(r.temperature, config.decay);
  const inflow = wasteInflow(state, config, ahead);
  const settlingShare = wasteSettlingShare(state, config.decay);
  return {
    ...inflow,
    standing: r.waste,
    mineralised: calculateWasteToAmmonia(
      mineralisationBase(state, config, inflow),
      config
    ).wasteConsumed,
    settlingShare,
    settled: r.waste * settlingShare,
    food: r.food,
    decayRate: decayFraction(r.temperature, r.oxygen, config.decay),
    q10,
  };
}

/**
 * Where the pool levels off. Settling takes its share of standing waste first,
 * then mineralisation its share of what stays up plus what the hour has
 * already shed into it, so the level is where those outflows together equal
 * the hour's production.
 */
export function wasteLevel(readout: WasteReadout, config: TunableConfig): number {
  const mineralising = config.nitrogenCycle.wasteConversionRate;
  const settling = readout.settlingShare;
  return (
    (readout.perHour - mineralising * beforeCycleInflow(readout)) /
    (settling + mineralising * (1 - settling))
  );
}

export function wasteSummary(readout: WasteReadout, config: TunableConfig): string {
  if (readout.perHour <= 0) return 'Nothing is producing waste.';

  const level = wasteLevel(readout, config);
  const drift =
    readout.standing < level * 0.98
      ? 'climbing to'
      : readout.standing > level * 1.02
        ? 'falling to'
        : 'holding at';

  return `Producing ${readout.perHour.toFixed(3)} g/h against ${readout.mineralised.toFixed(3)} g/h mineralised — standing waste is ${drift} ${level.toFixed(3)} g.`;
}
