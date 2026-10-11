import { produce } from 'immer';
import { createSimulation, type Plant, type SimulationState } from '../state.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { NUTRIENTS, nutrientsDefaults } from '../config/nutrients.js';
import { processFlora, type FloraProcessingResult } from '../flora/index.js';
import { ALGAE_KINDS, type AlgaeKind } from '../algae/index.js';
import { CARE_SHEET_PHOTOPERIOD } from '../systems/flora.js';
import {
  buyOffshoot,
  stepFlora,
  storeGap,
  takeUp,
  type FloraFluxes,
  type FloraParams,
  type FloraState,
} from '../systems/flora-budget.js';
import { bloomAt } from './blooms.js';

const lampsOn = (hour: number): boolean => hour % 24 < CARE_SHEET_PHOTOPERIOD;

export interface Growth {
  states: FloraState[];
  fluxes: FloraFluxes[];
  /** Hours its buffer cut a unit loose. */
  buds: number[];
}

export interface GrowthTerms {
  room?: (state: FloraState) => number;
  /** Grams of structure its buffer cuts loose. */
  offshoot?: number;
  /** False on lean water: nothing tops the stores up. */
  fed?: boolean;
}

/**
 * A unit's hours under saturating light and carbon for the care-sheet
 * photoperiod, at the reference temperature in full oxygen, every store topped
 * up each hour unless the water is lean.
 */
export function grow(p: FloraParams, start: FloraState, hours: number, terms: GrowthTerms = {}): Growth {
  const { room = (): number => 1, offshoot = Infinity, fed = true } = terms;
  const growth: Growth = { states: [], fluxes: [], buds: [] };
  let state = start;
  for (let hour = 0; hour < hours; hour++) {
    const stocked = fed ? takeUp(state, storeGap(state, p)) : state;
    const offered = lampsOn(hour) ? p.pAm * stocked.structure : 0;
    const step = stepFlora(stocked, p, { offered, tau: 1, omega: 1, room: room(stocked) });
    const bud = buyOffshoot(step.state, p, offshoot);
    if (bud) growth.buds.push(hour);
    state = bud?.parent ?? step.state;
    growth.states.push(state);
    growth.fluxes.push(step.fluxes);
  }
  return growth;
}

/** Hours until the first value that passes, Infinity where none does. */
export function hoursUntil<T>(series: readonly T[], passes: (value: T) => boolean): number {
  const hour = series.findIndex(passes);
  return hour < 0 ? Infinity : hour + 1;
}

const RICH = 1000;

export interface TankTerms {
  plants?: Plant[];
  algae?: Partial<Record<AlgaeKind, number>>;
}

/** A mid-band 100 L tank on water rich in carbon and every nutrient, with this planting and blooms at these coverages. */
export function floraTank({ plants = [], algae = {} }: TankTerms = {}): SimulationState {
  return produce(createSimulation({ tankCapacity: 100 }), (draft) => {
    const { water } = draft.resources;
    for (const n of NUTRIENTS) draft.resources[n] = nutrientsDefaults.halfSaturation[n] * RICH * water;
    draft.resources.nitrate = 20 * water;
    draft.resources.co2 = 30;
    for (const kind of ALGAE_KINDS) draft.algae[kind] = bloomAt(draft, kind, algae[kind] ?? 0);
    draft.plants = plants;
  });
}

export interface Lighting {
  /** PAR at the substrate this hour. */
  par: (hour: number) => number;
  day: number[];
}

export const DARK: Lighting = { par: () => 0, day: new Array(24).fill(0) };

/** A care-sheet photoperiod at this PAR. */
export function litDay(par: number): Lighting {
  const day = Array.from({ length: 24 }, (_, hour) => (lampsOn(hour) ? par : 0));
  return { par: (hour) => day[hour % 24], day };
}

export interface FloraRun {
  state: SimulationState;
  hours: FloraProcessingResult[];
}

/**
 * The flora pass hour by hour on water held as it stands, each hour's state
 * handed to `keep` before the next.
 */
export function runFlora(
  start: SimulationState,
  hours: number,
  lighting: Lighting,
  keep: (state: SimulationState, hour: number) => SimulationState = (state) => state,
  config: TunableConfig = DEFAULT_CONFIG
): FloraRun {
  const run: FloraRun = { state: start, hours: [] };
  for (let hour = 0; hour < hours; hour++) {
    const lit = produce(run.state, (draft) => {
      draft.resources.light = lighting.par(hour);
      draft.resources.lightByHour = lighting.day;
    });
    const result = processFlora(lit, config);
    run.hours.push(result);
    run.state = keep(result.state, hour);
  }
  return run;
}
