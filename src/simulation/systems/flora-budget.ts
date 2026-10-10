/**
 * A plant's or a bloom's Dynamic Energy Budget on Droop cell quotas, in engine
 * units: grams of photosynthate and tissue, mg of each nutrient as
 * `Organics.nutrients` counts it, hours. Design: Foundation Redesign,
 * energy.md § Flora.
 *
 * Leaf area scales with tissue, so the budget is DEB's V1-morph: v is a rate,
 * and reserve turns over at it whatever the size.
 */

import { hourlyDraw, monodFactor, monodUptake } from '../core/kinetics.js';
import type { Organics } from '../core/organics.js';
import { mapNutrients, NUTRIENTS, ZERO_NUTRIENTS, type Nutrient, type NutrientVector } from '../config/nutrients.js';
import { maxReserveDensity, structureOrganics, wellFed } from './deb.js';

export interface FloraParams {
  /** g/h per g of structure */
  pAm: number;
  /** 1/h */
  v: number;
  kappa: number;
  /** g/h per g of structure */
  pM: number;
  /** g of reserve per g of structure */
  EG: number;
  kappaG: number;
  /** mg per g of structure */
  qMin: NutrientVector;
  /** mg per g of structure */
  qMax: NutrientVector;
  /** 1/h */
  storeFillRate: NutrientVector;
}

export interface FloraState {
  /** g */
  structure: number;
  reserve: number;
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
  /** Reserve spent: what the stores refuse stays in reserve. */
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

export const floraOrganics = (state: FloraState, p: FloraParams): number =>
  state.reserve + state.offshootBuffer + structureOrganics(p) * state.structure;

/** Structure as organic matter: its grams at Q_min. */
function tissue(p: FloraParams, structure: number): Organics {
  return { grams: structureOrganics(p) * structure, nutrients: mapNutrients((n) => p.qMin[n] * structure) };
}

/**
 * Growth draws the stores, so it reads its Droop limit at the store the hour
 * leaves, through `monodUptake`, and no store is overdrawn at any pace. The
 * buffer draws none until an offshoot is bought, and reads it as the hour starts.
 */
function structureGrown(state: FloraState, p: FloraParams, buildable: number): number {
  return Math.min(
    ...NUTRIENTS.map(
      (n) => monodUptake(state.stores[n], p.qMin[n] * buildable, p.qMin[n] * state.structure) / p.qMin[n]
    )
  );
}

/**
 * One hour of the budget: τ paces every rate, and the hour's photosynthate
 * fills the reserve to E_m of the structure the hour leaves, no further.
 */
export function stepFlora(state: FloraState, p: FloraParams, hour: FloraBudgetHour): FloraStep {
  const { offered, tau, room, healing = 0 } = hour;
  const { structure: V, reserve: E, offshootBuffer: B, stores } = state;
  const gramsPerStructure = structureOrganics(p);

  const pC = V > 0 ? Math.min(E, (tau * E * V * (p.v * p.EG + p.pM)) / (p.EG * V + p.kappa * E)) : 0;

  const somaShare = p.kappa * pC;
  const somaticUpkeep = p.pM * V * tau;
  const somaticPaid = Math.min(somaShare, somaticUpkeep);
  const somaticUnpaid = somaticUpkeep - somaticPaid;
  const grown = structureGrown(state, p, (room * (somaShare - somaticPaid)) / p.EG);
  const invested = p.EG * grown;
  const toStructure = gramsPerStructure * grown;

  const branch = pC - somaShare;
  const somaFromBranch = Math.min(branch, somaticUnpaid);
  const toBuffer = droopFactor(state, p) * (branch - somaFromBranch);
  const buffer = B + toBuffer;
  const somaticDue = somaticUnpaid - somaFromBranch;
  const somaFromBuffer = Math.min(buffer, somaticDue);
  const fromStructure = Math.min(somaticDue - somaFromBuffer, gramsPerStructure * V);
  const shrunk = fromStructure / gramsPerStructure;

  const mobilised = somaticPaid + invested + somaFromBranch + toBuffer;
  const structure = V + grown - shrunk;
  const kept = E - mobilised;
  const assimilated = Math.min(offered, Math.max(0, maxReserveDensity(p) * structure - kept + healing));
  const healed = Math.min(healing, kept + assimilated);

  return {
    state: {
      structure,
      reserve: kept + assimilated - healed,
      offshootBuffer: buffer - somaFromBuffer,
      stores: mapNutrients((n) => stores[n] + p.qMin[n] * (shrunk - grown)),
    },
    fluxes: {
      returned: offered - assimilated,
      assimilated,
      mobilised,
      toStructure,
      fromStructure,
      burned: {
        maintenance: somaticPaid,
        growth: invested - toStructure,
        starvation: somaFromBranch + somaFromBuffer + fromStructure,
        healing: healed,
      },
      owed: somaticUpkeep,
      shortfall: somaticUnpaid,
    },
  };
}

/**
 * mg of each nutrient the stores ask of the pools this hour: what each lacks of
 * full, closing first order at its fill rate × τ.
 */
export function storeRequest(state: FloraState, p: FloraParams, tau: number): NutrientVector {
  return mapNutrients(
    (n) => Math.max(0, storeMax(p, n) * state.structure - state.stores[n]) * hourlyDraw(tau * p.storeFillRate[n])
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
    overhead: (p.EG - structureOrganics(p)) * structure,
  };
}

/** `structure` shed as waste at Q_min; the store it held is resorbed and stays. */
export function shed(state: FloraState, p: FloraParams, structure: number): { state: FloraState; waste: Organics } {
  return { state: { ...state, structure: state.structure - structure }, waste: tissue(p, structure) };
}

/**
 * What a dead unit leaves: its structure at Q_min, with its reserve and buffer,
 * as waste; its stores leached to the water.
 */
export function remains(state: FloraState, p: FloraParams): { waste: Organics; leachate: NutrientVector } {
  const body = tissue(p, state.structure);
  return {
    waste: { grams: body.grams + state.reserve + state.offshootBuffer, nutrients: body.nutrients },
    leachate: { ...state.stores },
  };
}
