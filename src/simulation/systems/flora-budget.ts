/**
 * A plant's or a bloom's Dynamic Energy Budget on Droop cell quotas, in engine
 * units: grams of photosynthate and of tissue, mg of each nutrient as
 * `Organics.nutrients` counts it, hours.
 *
 * Leaf area scales with tissue, so the budget is DEB's V1-morph. It holds at
 * any pace: the hour runs in slices that each turn over at most K_SLICE of an
 * empty reserve, and every slice reads its own turnover and Droop limit.
 */

import { hourlyDraw, monodFactor, monodUptake } from '../core/kinetics.js';
import { addOrganics, ofComposition, type Organics } from '../core/organics.js';
import { mapNutrients, NUTRIENTS, ZERO_NUTRIENTS, type Nutrient, type NutrientVector } from '../config/nutrients.js';
import {
  integrateHour,
  maxReserveDensity,
  spend,
  wellFed,
  type ReserveHour,
  type ReserveParams,
  type ReserveSlice,
  type ReserveState,
} from './reserve.js';

export interface FloraParams extends ReserveParams {
  /** g/h per g of structure */
  pAm: number;
  /** 1/h */
  v: number;
  /** g/h per g of structure */
  pM: number;
  /** g of reserve per g of structure */
  EG: number;
  /** mg per g of structure */
  qMin: NutrientVector;
  /** mg per g of structure */
  qMax: NutrientVector;
  /** 1/h */
  storeFillRate: NutrientVector;
}

export interface FloraState extends ReserveState {
  /** g */
  structure: number;
  offshootBuffer: number;
  /** mg held above what the structure itself carries */
  stores: NutrientVector;
}

/**
 * An hour's inputs: photosynthate offered (g); `room`, the share of growth
 * crowding leaves it, 0–1; healing, grams of reserve asked for repair.
 */
export interface FloraBudgetHour {
  offered: number;
  tau: number;
  room: number;
  healing?: number;
}

export interface FloraBurned {
  maintenance: number;
  growth: number;
  starvation: number;
  healing: number;
}

export interface FloraFluxes {
  /** Photosynthate offered that the reserve had no room for. */
  returned: number;
  assimilated: number;
  /** Reserve spent: what growth and the buffer turn back stays in reserve. */
  mobilised: number;
  toStructure: number;
  fromStructure: number;
  burned: FloraBurned;
  owed: number;
  /** Maintenance its κ share could not pay. */
  shortfall: number;
}

export interface FloraStep {
  state: FloraState;
  fluxes: FloraFluxes;
}

const storeMax = (p: FloraParams, n: Nutrient): number => p.qMax[n] - p.qMin[n];

const storeDensity = (state: FloraState, n: Nutrient): number =>
  state.structure > 0 ? state.stores[n] / state.structure : 0;

export const storeFill = (state: FloraState, p: FloraParams): NutrientVector =>
  mapNutrients((n) => storeDensity(state, n) / storeMax(p, n));

/** Droop's growth limit, the least nutrient ruling: each store's density as a Monod against Q_min. */
export const droopFactor = (state: FloraState, p: FloraParams): number =>
  Math.min(...NUTRIENTS.map((n) => monodFactor(storeDensity(state, n), p.qMin[n])));

export const floraOrganics = (state: FloraState): number =>
  state.reserve + state.offshootBuffer + state.structure;

/** Structure `capacity` builds at the Droop limit of the stores it leaves, so no store is overdrawn at any pace. */
function structureGrown(state: FloraState, p: FloraParams, capacity: number): number {
  return Math.min(
    ...NUTRIENTS.map(
      (n) => monodUptake(state.stores[n], p.qMin[n] * capacity, p.qMin[n] * state.structure) / p.qMin[n]
    )
  );
}

const plus = <K extends string>(
  a: Readonly<Record<K, number>>,
  b: Readonly<Record<NoInfer<K>, number>>
): Record<K, number> =>
  Object.fromEntries(Object.keys(a).map((key) => [key, a[key as K] + b[key as K]])) as Record<K, number>;

const addFluxes = ({ burned, ...flows }: FloraFluxes, more: FloraFluxes): FloraFluxes => ({
  ...plus(flows, more),
  burned: plus(burned, more.burned),
});

/**
 * One slice spending `released` grams of reserve. What growth and the buffer
 * turn back stays in reserve, and the slice's photosynthate fills it no further
 * than E_m of the structure the slice leaves: the rest is handed back.
 */
function sliceFlora(
  state: FloraState,
  p: FloraParams,
  room: number,
  released: number,
  { inflow, healing, tau }: Readonly<ReserveHour>
): ReserveSlice<FloraState, FloraFluxes> {
  const { structure: V, reserve: E, offshootBuffer: B, stores } = state;
  const upkeep = p.pM * V * tau;
  const {
    somaticPaid,
    somaticUnpaid,
    growth: { invested, grown },
    somaFromBranch,
    toBuffer,
    buffer,
    somaFromBuffer,
    fromStructure,
  } = spend(
    released,
    p.kappa,
    { soma: upkeep, branch: 0 },
    { buffer: B, structure: V },
    {
      invest: (surplus) => {
        const grown = structureGrown(state, p, (room * surplus) / p.EG);
        return { invested: p.EG * grown, grown };
      },
      deposit: (rest, { grown }) =>
        droopFactor({ ...state, stores: mapNutrients((n) => stores[n] - p.qMin[n] * grown) }, p) * rest,
    }
  );
  const mobilised = somaticPaid + invested + somaFromBranch + toBuffer;
  const structure = V + grown - fromStructure;
  const kept = E - mobilised;
  const assimilated = Math.min(inflow, Math.max(0, maxReserveDensity(p) * structure - kept + healing));
  const healed = Math.min(healing, kept + assimilated);

  return {
    state: {
      structure,
      reserve: kept + assimilated - healed,
      offshootBuffer: buffer - somaFromBuffer,
      stores: mapNutrients((n) => stores[n] + p.qMin[n] * (fromStructure - grown)),
    },
    fluxes: {
      returned: inflow - assimilated,
      assimilated,
      mobilised,
      toStructure: grown,
      fromStructure,
      burned: {
        maintenance: somaticPaid,
        growth: invested - grown,
        starvation: somaFromBranch + somaFromBuffer + fromStructure,
        healing: healed,
      },
      owed: upkeep,
      shortfall: somaticUnpaid,
    },
    turnedBack: released - mobilised,
  };
}

/** One hour of the budget, τ pacing every rate. */
export function stepFlora(state: FloraState, p: FloraParams, hour: FloraBudgetHour): FloraStep {
  const { offered, tau, room, healing = 0 } = hour;
  return integrateHour(
    state,
    p,
    { inflow: offered, healing, tau },
    {
      growthLimit: (at) => room * droopFactor(at, p),
      slice: (at, released, slice) => sliceFlora(at, p, room, released, slice),
      add: addFluxes,
    }
  );
}

/**
 * mg of each nutrient the stores ask of the pools this hour: what each lacks of
 * full, closing first order at its fill rate × τ × its pool's Michaelis–Menten
 * factor.
 */
export function storeRequest(
  state: FloraState,
  p: FloraParams,
  tau: number,
  poolFactor: Readonly<NutrientVector>
): NutrientVector {
  return mapNutrients(
    (n) =>
      Math.max(0, storeMax(p, n) * state.structure - state.stores[n]) *
      hourlyDraw(tau * p.storeFillRate[n] * poolFactor[n])
  );
}

export function takeUp(state: FloraState, delivered: Readonly<NutrientVector>): FloraState {
  return { ...state, stores: mapNutrients((n) => state.stores[n] + delivered[n]) };
}

function newborn(parent: FloraState, p: FloraParams, structure: number): FloraState {
  return {
    structure,
    reserve: wellFed(parent, p) * maxReserveDensity(p) * structure,
    offshootBuffer: 0,
    stores: { ...ZERO_NUTRIENTS },
  };
}

/**
 * Whether the buffer holds a new unit of `structure` — its tissue at [E_G] and
 * its reserve at the parent's density — and the stores hold its Q_min.
 */
export function offshootReady(state: FloraState, p: FloraParams, structure: number): boolean {
  const born = newborn(state, p, structure);
  return (
    state.offshootBuffer >= p.EG * structure + born.reserve &&
    NUTRIENTS.every((n) => state.stores[n] >= p.qMin[n] * structure)
  );
}

export interface Offshoot {
  parent: FloraState;
  offshoot: FloraState;
  /** Grams of the buffer burned building it. */
  overhead: number;
}

/** A new unit of `structure` bought out of the buffer and the stores, null while they cannot pay for it. */
export function buyOffshoot(state: FloraState, p: FloraParams, structure: number): Offshoot | null {
  if (!offshootReady(state, p, structure)) return null;
  const offshoot = newborn(state, p, structure);
  return {
    parent: {
      ...state,
      offshootBuffer: state.offshootBuffer - p.EG * structure - offshoot.reserve,
      stores: mapNutrients((n) => state.stores[n] - p.qMin[n] * structure),
    },
    offshoot,
    overhead: (p.EG - 1) * structure,
  };
}

/**
 * `structure` shed as waste at Q_min, with its reserve at the unit's density;
 * the store it held is resorbed and stays.
 */
export function shed(state: FloraState, p: FloraParams, structure: number): { state: FloraState; waste: Organics } {
  const reserve = state.structure > 0 ? (state.reserve * structure) / state.structure : 0;
  return {
    state: { ...state, structure: state.structure - structure, reserve: state.reserve - reserve },
    waste: addOrganics(ofComposition(structure, p.qMin), ofComposition(reserve, ZERO_NUTRIENTS)),
  };
}

/**
 * What a dead unit leaves: its structure at Q_min, with its reserve and buffer,
 * as waste; its stores leached to the water.
 */
export function remains(state: FloraState, p: FloraParams): { waste: Organics; leachate: NutrientVector } {
  return {
    waste: addOrganics(
      ofComposition(state.structure, p.qMin),
      ofComposition(state.reserve + state.offshootBuffer, ZERO_NUTRIENTS)
    ),
    leachate: { ...state.stores },
  };
}
