/**
 * The waste pool: what stands in the tank, what feeds it each hour, and what
 * leaves it into the nitrogen cycle. Rates come from the engine's own decay,
 * metabolism and shedding functions, so they are exactly what the next tick does.
 */

import {
  calculateDecay,
  calculateSubstrateLeach,
  decayFraction,
  getTemperatureFactor,
  processMetabolism,
  type SimulationState,
} from '../../simulation/index.js';
import { calculateShedding } from '../../simulation/plants/index.js';
import { calculateWasteToAmmonia } from '../../simulation/systems/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';

export type WasteSourceKey = 'food' | 'fish' | 'plants' | 'substrate';

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
  /** Grams mineralised into ammonia this hour — the pool's only outflow. */
  mineralised: number;
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
  substrate: 'Substrate',
};

export function wasteInflow(state: SimulationState, config: TunableConfig): WasteInflowReadout {
  const r = state.resources;
  const decayed = calculateDecay(r.food, r.temperature, r.oxygen, config.decay);
  const grams: Record<WasteSourceKey, number> = {
    food: decayed * config.decay.wasteConversionRatio,
    fish: processMetabolism(state.fish, r.food, r.oxygen, config.livestock).wasteProduced,
    plants: state.plants.reduce(
      (sum, plant) => sum + calculateShedding(plant, config.plants).wasteProduced,
      0
    ),
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
const BEFORE_CYCLE: WasteSourceKey[] = ['fish', 'plants', 'substrate'];

/**
 * The waste mineralisation works on this hour. The substrate leaches in the
 * immediate tier and fish and plants shed in the active tier, so the passive
 * nitrogen cycle already sees them; food decay is collected in the same passive
 * pass and only arrives next hour.
 */
export function mineralisationBase(standing: number, inflow: WasteInflowReadout): number {
  return inflow.sources
    .filter((source) => BEFORE_CYCLE.includes(source.key))
    .reduce((total, source) => total + source.gramsPerHour, standing);
}

export function wasteReadout(state: SimulationState, config: TunableConfig): WasteReadout {
  const r = state.resources;
  const q10 = getTemperatureFactor(r.temperature, config.decay);
  const inflow = wasteInflow(state, config);
  return {
    ...inflow,
    standing: r.waste,
    mineralised: calculateWasteToAmmonia(
      mineralisationBase(r.waste, inflow),
      config.nitrogenCycle
    ).wasteConsumed,
    food: r.food,
    decayRate: decayFraction(r.temperature, r.oxygen, config.decay),
    q10,
  };
}

/**
 * Where the pool is heading. Mineralisation takes a fixed share of standing
 * waste, so the pool settles where that share equals the hour's production.
 */
export function wasteSummary(readout: WasteReadout, config: TunableConfig): string {
  if (readout.perHour <= 0) return 'Nothing is producing waste.';

  const settled = readout.perHour / config.nitrogenCycle.wasteConversionRate;
  const drift =
    readout.standing < settled * 0.98
      ? 'climbing to'
      : readout.standing > settled * 1.02
        ? 'falling to'
        : 'holding at';

  return `Producing ${readout.perHour.toFixed(3)} g/h against ${readout.mineralised.toFixed(3)} g/h mineralised — standing waste is ${drift} ${settled.toFixed(3)} g.`;
}
