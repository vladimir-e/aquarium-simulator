/**
 * A plant's or a bloom's Dynamic Energy Budget on Droop cell quotas, in engine
 * units: grams of photosynthate and of tissue, mg of each nutrient as
 * `Organics.nutrients` counts it, hours.
 *
 * Leaf area scales with tissue, so the budget is DEB's V1-morph. No pace
 * bounds the hourly step: every draw is integrated over the hour, at the
 * turnover and Droop factor the hour starts on.
 */

import { hourlyDraw, hourlyInflowDraw, monodFactor, monodUptake } from '../core/kinetics.js';
import { addOrganics, ofComposition, type Organics } from '../core/organics.js';
import { mapNutrients, NUTRIENTS, ZERO_NUTRIENTS, type Nutrient, type NutrientVector } from '../config/nutrients.js';
import { maxReserveDensity, spend, wellFed, type ReserveParams, type ReserveState, type Spent } from './reserve.js';

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

const tissue = (p: FloraParams, structure: number): Organics => ofComposition(structure, p.qMin);

/** Structure `capacity` builds at the Droop limit of the stores it leaves, so no store is overdrawn at any pace. */
function structureGrown(state: FloraState, p: FloraParams, capacity: number): number {
  return Math.min(
    ...NUTRIENTS.map(
      (n) => monodUptake(state.stores[n], p.qMin[n] * capacity, p.qMin[n] * state.structure) / p.qMin[n]
    )
  );
}

interface Growth {
  invested: number;
  grown: number;
}

const turnedBack = ({ surplus, growth, rest, toBuffer }: Spent<Growth>): number =>
  surplus - growth.invested + rest - toBuffer;

/**
 * One hour of the budget, τ pacing every rate. The reserve is first order at
 * the turnover the hour starts on: it releases `hourlyDraw` of what it holds
 * and `hourlyInflowDraw` of what flows in — the hour's photosynthate, and what
 * growth and the buffer turn back of the release, offered again. It releases
 * no more than holds it full on the hour's structure, growing at the rate a
 * full reserve buys, and takes in no more than fills it to E_m of the
 * structure the hour leaves.
 */
export function stepFlora(state: FloraState, p: FloraParams, hour: FloraBudgetHour): FloraStep {
  const { offered, tau, room, healing = 0 } = hour;
  const { structure: V, reserve: E, offshootBuffer: B, stores } = state;
  const fullDensity = maxReserveDensity(p);
  const droop = droopFactor(state, p);

  const upkeep = p.pM * V * tau;
  const turnover = V > 0 ? (tau * V * (p.v * p.EG + p.pM)) / (p.EG * V + p.kappa * E) : 0;
  const ofStock = hourlyDraw(turnover);
  const ofInflow = hourlyInflowDraw(turnover);

  const spendHour = (mobilised: number): Spent<Growth> =>
    spend(
      mobilised,
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

  const throughput = E * ofStock + offered * ofInflow;
  const turnedBackShare = throughput > 0 ? turnedBack(spendHour(throughput)) / throughput : 0;
  const fullGrowth = Math.max(0, (room * droop * (p.kappa * p.pAm - p.pM)) / (p.EG + p.kappa * fullDensity));
  const meanStructure = fullGrowth > 0 ? (V * Math.expm1(fullGrowth * tau)) / (fullGrowth * tau) : V;
  const inflowToFull = Math.max(0, fullDensity * meanStructure - E * (1 - ofStock)) / (1 - ofInflow);
  const mobilised = Math.min(throughput / (1 - ofInflow * turnedBackShare), E * ofStock + inflowToFull * ofInflow);

  const {
    somaticPaid,
    somaticUnpaid,
    growth: { invested, grown },
    somaFromBranch,
    toBuffer,
    buffer,
    somaFromBuffer,
    fromStructure,
  } = spendHour(mobilised);
  const spent = somaticPaid + invested + somaFromBranch + toBuffer;
  const structure = V + grown - fromStructure;
  const kept = E - spent;
  const assimilated = Math.min(offered, Math.max(0, fullDensity * structure - kept + healing));
  const healed = Math.min(healing, kept + assimilated);

  return {
    state: {
      structure,
      reserve: kept + assimilated - healed,
      offshootBuffer: buffer - somaFromBuffer,
      stores: mapNutrients((n) => stores[n] + p.qMin[n] * (fromStructure - grown)),
    },
    fluxes: {
      returned: offered - assimilated,
      assimilated,
      mobilised: spent,
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
  };
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
  pool: Readonly<NutrientVector>
): NutrientVector {
  return mapNutrients(
    (n) =>
      Math.max(0, storeMax(p, n) * state.structure - state.stores[n]) *
      hourlyDraw(tau * p.storeFillRate[n] * pool[n])
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
    waste: addOrganics(tissue(p, structure), ofComposition(reserve, ZERO_NUTRIENTS)),
  };
}

/**
 * What a dead unit leaves: its structure at Q_min, with its reserve and buffer,
 * as waste; its stores leached to the water.
 */
export function remains(state: FloraState, p: FloraParams): { waste: Organics; leachate: NutrientVector } {
  return {
    waste: addOrganics(tissue(p, state.structure), ofComposition(state.reserve + state.offshootBuffer, ZERO_NUTRIENTS)),
    leachate: { ...state.stores },
  };
}
