/**
 * A plant's or a bloom's Dynamic Energy Budget on Droop cell quotas, in engine
 * units: grams of photosynthate and of tissue, mg of each nutrient as
 * `Organics.nutrients` counts it, hours.
 *
 * Leaf area scales with tissue, so the budget is DEB's V1-morph. It holds at
 * any pace because `integrateHour` runs the hour in slices, each reading its
 * own turnover and Droop limit.
 */

import { hourlyDraw, monodFactor, monodUptake } from '../core/kinetics.js';
import { CH2O_TO_C_MASS_RATIO } from '../core/chemistry.js';
import { addOrganics, portion, type Organics } from '../core/organics.js';
import { mapNutrients, NUTRIENTS, ZERO_NUTRIENTS, type Nutrient, type NutrientVector } from '../config/nutrients.js';
import {
  hourSlices,
  integrateHour,
  maxReserveDensity,
  NO_STRESS,
  spend,
  type DebStress,
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
  /** g of the next offshoot's tissue, built at [E_G] as the 1 − κ share flows in */
  offshootBuffer: number;
  /** mg held above what the structure itself carries */
  stores: NutrientVector;
}

/**
 * An hour's inputs: photosynthate offered (g); `room`, the share of growth
 * crowding leaves it, 0–1; ω in [0, 1]; healing, grams of reserve asked for
 * repair at full oxygen.
 */
export interface FloraBudgetHour {
  offered: number;
  tau: number;
  omega: number;
  room: number;
  stress?: Readonly<DebStress>;
  healing?: number;
}

interface FloraBurned {
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
  /** The Droop limit, the least store ruling, mean over the hour's slices. */
  droopLimit: number;
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

/** mg each store lacks of full. */
export const storeGap = (state: FloraState, p: FloraParams): NutrientVector =>
  mapNutrients((n) => Math.max(0, storeMax(p, n) * state.structure - state.stores[n]));

/** Each store's own Droop limit: its density as a Monod against Q_min. */
export const droopLimits = (state: FloraState, p: FloraParams): NutrientVector =>
  mapNutrients((n) => monodFactor(storeDensity(state, n), p.qMin[n]));

/** Droop's growth limit, the least nutrient ruling. */
export const droopFactor = (state: FloraState, p: FloraParams): number => {
  const limits = droopLimits(state, p);
  return Math.min(...NUTRIENTS.map((n) => limits[n]));
};

/** Droop's growth limit on full stores: ρ/(1 + ρ) of the least nutrient. */
export const fullDroopFactor = (p: FloraParams): number =>
  Math.min(...NUTRIENTS.map((n) => monodFactor(storeMax(p, n), p.qMin[n])));

/** The fill at which each store's Droop limit stands at `edge` of the one full stores reach. */
export const fillAtDroop = (p: FloraParams, edge: number): NutrientVector => {
  const limit = edge * fullDroopFactor(p);
  return mapNutrients((n) => (p.qMin[n] * limit) / ((1 - limit) * storeMax(p, n)));
};

export const floraOrganics = (state: FloraState): number =>
  state.reserve + state.offshootBuffer + state.structure;

/** mg of each nutrient it holds: its structure at Q_min and its stores. */
export const floraNutrients = (state: FloraState, p: FloraParams): NutrientVector =>
  mapNutrients((n) => p.qMin[n] * state.structure + state.stores[n]);

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
 * One slice spending `released` grams of reserve. Both shares build tissue at
 * [E_G] — the soma's own, and the next offshoot's in the buffer. What growth
 * and the buffer turn back stays in reserve, and the slice's photosynthate
 * fills it no further than E_m of the structure the slice leaves: the rest is
 * handed back.
 */
function sliceFlora(
  state: FloraState,
  p: FloraParams,
  room: number,
  released: number,
  { inflow, healing, tau }: Readonly<ReserveHour>,
  droopLimit: number
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
        (droopFactor({ ...state, stores: mapNutrients((n) => stores[n] - p.qMin[n] * grown) }, p) * rest) / p.EG,
    }
  );
  const mobilised = somaticPaid + invested + somaFromBranch + p.EG * toBuffer;
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
        growth: invested - grown + (p.EG - 1) * toBuffer,
        starvation: somaFromBranch + somaFromBuffer + fromStructure,
        healing: healed,
      },
      owed: upkeep,
      shortfall: somaticUnpaid,
      droopLimit,
    },
    turnedBack: released - mobilised,
  };
}

/**
 * One hour of the budget: τ paces every rate; ω scales {p_Am}, v and healing,
 * and maintenance is owed regardless. Stress raises its maintenance and the
 * price of structure; its assimilation ceiling is the carbon fixer's to lower.
 */
export function stepFlora(state: FloraState, p: FloraParams, hour: FloraBudgetHour): FloraStep {
  const { offered, tau, omega, room, stress = NO_STRESS, healing = 0 } = hour;
  const stressed = { ...p, pM: p.pM * stress.maintenance, EG: p.EG * stress.growthCost };
  const growthLimit = (at: FloraState): number => room * droopFactor(at, stressed);
  const share = 1 / hourSlices(stressed, tau);
  return integrateHour(
    state,
    stressed,
    { inflow: offered, healing: omega * healing, tau, omega },
    {
      growthLimit,
      slice: (at, released, slice) => sliceFlora(at, stressed, room, released, slice, share * droopFactor(at, stressed)),
      add: addFluxes,
    }
  );
}

/**
 * mg of each nutrient the stores ask of saturating water this hour: what each
 * lacks of full, closing first order at its fill rate × τ. The pools deliver it
 * at their own Michaelis–Menten share.
 */
export function storeRequest(state: FloraState, p: FloraParams, tau: number): NutrientVector {
  const gap = storeGap(state, p);
  return mapNutrients((n) => gap[n] * hourlyDraw(tau * p.storeFillRate[n]));
}

export function takeUp(state: FloraState, delivered: Readonly<NutrientVector>): FloraState {
  return { ...state, stores: mapNutrients((n) => state.stores[n] + delivered[n]) };
}

/** `structure` fed and stocked: its reserve at E_m and every store full, nothing in the buffer. */
export function stocked(structure: number, p: FloraParams): FloraState {
  return {
    structure,
    reserve: maxReserveDensity(p) * structure,
    offshootBuffer: 0,
    stores: mapNutrients((n) => storeMax(p, n) * structure),
  };
}

/** A share of it, every pool pro rata. */
export function scaleFlora(state: FloraState, factor: number): FloraState {
  return {
    structure: state.structure * factor,
    reserve: state.reserve * factor,
    offshootBuffer: state.offshootBuffer * factor,
    stores: mapNutrients((n) => state.stores[n] * factor),
  };
}

/** Whether the buffer holds a new unit of `structure`, and the stores its Q_min. */
export function offshootReady(state: FloraState, p: FloraParams, structure: number): boolean {
  return state.offshootBuffer >= structure && NUTRIENTS.every((n) => state.stores[n] >= p.qMin[n] * structure);
}

interface Offshoot {
  parent: FloraState;
  offshoot: FloraState;
}

/**
 * A new unit of `structure` cut loose from the buffer, its Q_min out of the
 * stores, with its share of the reserve and of what the stores hold past
 * that, so parent and offshoot stand at one density of both; null while the
 * buffer or the stores cannot make it.
 */
export function buyOffshoot(state: FloraState, p: FloraParams, structure: number): Offshoot | null {
  if (!offshootReady(state, p, structure)) return null;
  const share = structure / (state.structure + structure);
  const stores = mapNutrients((n) => state.stores[n] - p.qMin[n] * structure);
  return {
    parent: {
      ...state,
      reserve: state.reserve * (1 - share),
      offshootBuffer: state.offshootBuffer - structure,
      stores: mapNutrients((n) => stores[n] * (1 - share)),
    },
    offshoot: {
      structure,
      reserve: state.reserve * share,
      offshootBuffer: 0,
      stores: mapNutrients((n) => stores[n] * share),
    },
  };
}

const PHOTOSYNTHATE: Organics = { grams: 1, carbon: CH2O_TO_C_MASS_RATIO, nutrients: ZERO_NUTRIENTS };

const tissueOrganics = (p: FloraParams, structure: number, reserve: number): Organics =>
  addOrganics(portion({ ...PHOTOSYNTHATE, nutrients: p.qMin }, structure), portion(PHOTOSYNTHATE, reserve));

/**
 * `structure` shed as waste at Q_min, with its reserve at the unit's density;
 * the store it held is resorbed and stays.
 */
export function shed(state: FloraState, p: FloraParams, structure: number): { state: FloraState; waste: Organics } {
  const reserve = state.structure > 0 ? (state.reserve * structure) / state.structure : 0;
  return {
    state: { ...state, structure: state.structure - structure, reserve: state.reserve - reserve },
    waste: tissueOrganics(p, structure, reserve),
  };
}

/** What a dead unit leaves as waste: its structure at Q_min, its reserve and buffer, and its stores with them. */
export function remains(state: FloraState, p: FloraParams): Organics {
  const tissue = tissueOrganics(p, state.structure, state.reserve + state.offshootBuffer);
  return { ...tissue, nutrients: mapNutrients((n) => tissue.nutrients[n] + state.stores[n]) };
}
