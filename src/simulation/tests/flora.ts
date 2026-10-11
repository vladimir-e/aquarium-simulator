import { produce } from 'immer';
import { createSimulation, type Plant, type Resources, type SimulationState } from '../state.js';
import { DEFAULT_CONFIG } from '../config/index.js';
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

export const lampsOn = (hour: number, photoperiod = CARE_SHEET_PHOTOPERIOD): boolean => hour % 24 < photoperiod;

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
  until?: (growth: Growth) => boolean;
}

/**
 * A unit's hours under saturating light and carbon for the care-sheet
 * photoperiod, at the reference temperature in full oxygen, every store topped
 * up each hour unless the water is lean, for `hours` or until it passes.
 */
export function grow(p: FloraParams, start: FloraState, hours: number, terms: GrowthTerms = {}): Growth {
  const { room = (): number => 1, offshoot = Infinity, fed = true, until = (): boolean => false } = terms;
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
    if (until(growth)) break;
  }
  return growth;
}

/** Hours until the first value that passes, Infinity where none does. */
export function hoursUntil<T>(series: readonly T[], passes: (value: T) => boolean): number {
  const hour = series.findIndex(passes);
  return hour < 0 ? Infinity : hour + 1;
}

const RICH = 1000;

export type TankTerms = {
  plants?: Plant[];
  algae?: Partial<Record<AlgaeKind, number>>;
} & Partial<Pick<Resources, 'light' | 'lightByHour' | 'co2' | 'nitrate' | 'phosphate' | 'oxygen' | 'water'>>;

/**
 * A mid-band 100 L tank on water rich in carbon and every nutrient, with this
 * planting, blooms at these coverages, and any resource it names.
 */
export function floraTank({ plants = [], algae = {}, ...resources }: TankTerms = {}): SimulationState {
  return produce(createSimulation({ tankCapacity: 100 }), (draft) => {
    const water = resources.water ?? draft.resources.water;
    for (const n of NUTRIENTS) draft.resources[n] = nutrientsDefaults.halfSaturation[n] * RICH * water;
    draft.resources.nitrate = 20 * water;
    draft.resources.co2 = 30;
    Object.assign(draft.resources, resources);
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

export interface RunTerms {
  keep?: (state: SimulationState, hour: number) => SimulationState;
  until?: (run: FloraRun) => boolean;
}

/**
 * The flora pass hour by hour on water held as it stands, each hour's state
 * handed to `keep` before the next, for `hours` or until it passes.
 */
export function runFlora(start: SimulationState, hours: number, lighting: Lighting, terms: RunTerms = {}): FloraRun {
  const { keep = (state): SimulationState => state, until = (): boolean => false } = terms;
  const run: FloraRun = { state: start, hours: [] };
  for (let hour = 0; hour < hours; hour++) {
    const lit = produce(run.state, (draft) => {
      draft.resources.light = lighting.par(hour);
      draft.resources.lightByHour = lighting.day;
    });
    const result = processFlora(lit, DEFAULT_CONFIG);
    run.hours.push(result);
    run.state = keep(result.state, hour);
    if (until(run)) break;
  }
  return run;
}
