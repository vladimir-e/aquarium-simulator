/**
 * A fish's Dynamic Energy Budget in engine units: grams of organics for every
 * energy-like quantity, cm³ for structure, hours for time.
 */

import { sum } from '../core/sum.js';

export interface DebParams {
  /** g/h·cm² */
  pAm: number;
  /** cm/h */
  v: number;
  kappa: number;
  kappaX: number;
  kappaR: number;
  kappaG: number;
  /** g/h·cm³ */
  pM: number;
  /** 1/h */
  kJ: number;
  /** g/cm³ */
  EG: number;
  /** g */
  EHb: number;
  /** g */
  EHp: number;
  /** 1/h² */
  ha: number;
  sG: number;
  /** K */
  TA: number;
  delM: number;
  /** g/cm³: dry grams per wet cm³ of structure, which AmP assumes for reserve too */
  dV: number;
  /** g */
  E0: number;
  /** cm */
  Lb: number;
}

/** Multipliers on the budget: assimilation in [0, 1]; maintenance, growthCost and eggCost ≥ 1. */
export interface DebStress {
  assimilation: number;
  maintenance: number;
  growthCost: number;
  eggCost: number;
}

export const NO_STRESS: Readonly<DebStress> = { assimilation: 1, maintenance: 1, growthCost: 1, eggCost: 1 };

export interface DebState {
  /** cm³ */
  structure: number;
  reserve: number;
  maturity: number;
  broodBuffer: number;
  /** 1/h² */
  wearLoad: number;
  /** 1/h */
  hazard: number;
}

export const structuralLength = (state: DebState): number => Math.cbrt(state.structure);

export const physicalLength = (state: DebState, p: DebParams): number => structuralLength(state) / p.delM;

export const maxReserveDensity = (p: DebParams): number => p.pAm / p.v;

export const reserveDensity = (state: DebState, p: DebParams): number =>
  state.structure > 0 ? state.reserve / (maxReserveDensity(p) * state.structure) : 0;

export const maxStructuralLength = (p: DebParams): number => (p.kappa * p.pAm) / p.pM;

export const size = (state: DebState, p: DebParams): number =>
  (100 * structuralLength(state)) / maxStructuralLength(p);

export const mature = (state: DebState, p: DebParams): boolean => state.maturity >= p.EHp;

/** Grams of organics a cm³ of structure holds: its cost net of the overhead burned building it. */
export const structureOrganics = (p: DebParams): number => p.kappaG * p.EG;

export const organics = (state: DebState, p: DebParams): number =>
  state.reserve + state.broodBuffer + structureOrganics(p) * state.structure;

export const wetMass = (state: DebState, p: DebParams): number =>
  state.structure + (state.reserve + state.broodBuffer) / p.dV;

export interface DebHour {
  /** Grams of food digested this hour. */
  digested: number;
  tau: number;
  omega: number;
  stress?: Readonly<DebStress>;
  /** Grams of reserve to spend on repair. */
  healing?: number;
}

export interface DebBurned {
  maintenance: number;
  development: number;
  growth: number;
  starvation: number;
  healing: number;
}

export interface DebFluxes {
  /** Digested grams past the assimilation ceiling, back to the gut. */
  returned: number;
  assimilated: number;
  feces: number;
  mobilised: number;
  toStructure: number;
  fromStructure: number;
  burned: DebBurned;
  /** Maintenance, somatic and maturity, that the hour's mobilisation could not pay. */
  shortfall: number;
}

export interface DebStep {
  state: DebState;
  fluxes: DebFluxes;
}

export const totalBurned = ({ burned }: DebFluxes): number => sum(Object.values(burned));

export function assimilationCeiling(
  state: DebState,
  p: DebParams,
  { tau, omega, stress = NO_STRESS }: Pick<DebHour, 'tau' | 'omega' | 'stress'>
): number {
  const L = structuralLength(state);
  return p.pAm * stress.assimilation * L * L * tau * omega;
}

/** One hour of the budget: τ paces every rate, ω only the supply — assimilation and mobilisation. */
export function stepDeb(state: DebState, p: DebParams, hour: DebHour): DebStep {
  const { digested, tau, omega, stress = NO_STRESS, healing = 0 } = hour;
  const { structure: V, reserve: E, maturity: EH, broodBuffer: ER, wearLoad: q, hazard: h } = state;
  const supply = tau * omega;
  const pM = p.pM * stress.maintenance;
  const EG = p.EG * stress.growthCost;
  const gramsPerCm3 = structureOrganics(p);
  const L = structuralLength(state);
  const adult = mature(state, p);

  const intake = Math.min(digested, assimilationCeiling(state, p, hour) / p.kappaX);
  const assimilated = p.kappaX * intake;
  const mobilised =
    V > 0 ? Math.min(E, (supply * E * (p.v * EG * L * L + pM * V)) / (EG * V + p.kappa * E)) : 0;

  const soma = p.kappa * mobilised;
  const somatic = pM * V * tau;
  const paid = Math.min(soma, somatic);
  const invested = soma - paid;
  const somaticDue = somatic - paid;
  const grown = invested / EG;
  const toStructure = gramsPerCm3 * grown;

  const branch = mobilised - soma;
  const maturityUpkeep = p.kJ * tau * EH;
  const upkept = Math.min(branch, maturityUpkeep);
  const surplus = branch - upkept;
  const maturityDue = maturityUpkeep - upkept;
  const toBuffer = adult ? surplus : Math.max(0, EH + surplus - p.EHp);

  const buffer = ER + toBuffer;
  const somaFromBuffer = Math.min(buffer, somaticDue);
  const fromStructure = Math.min(somaticDue - somaFromBuffer, gramsPerCm3 * V);
  const bufferLeft = buffer - somaFromBuffer;
  const maturityFromBuffer = Math.min(bufferLeft, maturityDue);
  const healed = Math.min(healing, E + assimilated - mobilised);

  const nextV = V + grown - fromStructure / gramsPerCm3;
  const r = V > 0 ? (nextV - V) / V : 0;
  const drive = V > 0 ? mobilised / (maxReserveDensity(p) * V) : 0;
  const Vm = maxStructuralLength(p) ** 3;

  return {
    state: {
      structure: nextV,
      reserve: E + assimilated - mobilised - healed,
      maturity: adult ? EH : Math.min(p.EHp, EH + surplus - (maturityDue - maturityFromBuffer)),
      broodBuffer: bufferLeft - maturityFromBuffer,
      wearLoad: q + (q * (V / Vm) * p.sG + p.ha * tau * tau) * drive - r * q,
      hazard: h + q - r * h,
    },
    fluxes: {
      returned: digested - intake,
      assimilated,
      feces: intake - assimilated,
      mobilised,
      toStructure,
      fromStructure,
      burned: {
        maintenance: paid,
        development: branch - toBuffer + maturityFromBuffer,
        growth: invested - toStructure,
        starvation: somaFromBuffer + fromStructure,
        healing: healed,
      },
      shortfall: somaticDue + maturityDue,
    },
  };
}

export function eggsReady(state: DebState, p: DebParams, { stress = NO_STRESS }: Pick<DebHour, 'stress'>): number {
  return Math.floor((p.kappaR * state.broodBuffer) / (p.E0 * stress.eggCost));
}

export interface Spawn {
  state: DebState;
  eggs: number;
  /** Grams of organics the eggs carry. */
  laid: number;
  overhead: number;
}

export function layEggs(state: DebState, p: DebParams, hour: Pick<DebHour, 'stress'>, eggs: number): Spawn {
  const { stress = NO_STRESS } = hour;
  const count = Math.min(eggs, eggsReady(state, p, hour));
  const laid = count * p.E0;
  const drawn = Math.min(state.broodBuffer, (laid * stress.eggCost) / p.kappaR);
  return { state: { ...state, broodBuffer: state.broodBuffer - drawn }, eggs: count, laid, overhead: drawn - laid };
}

export function drawBroodBuffer(state: DebState, grams: number): { state: DebState; drawn: number } {
  const drawn = Math.min(grams, state.broodBuffer);
  return { state: { ...state, broodBuffer: state.broodBuffer - drawn }, drawn };
}

export function hatchling(p: DebParams): DebState {
  const structure = p.Lb ** 3;
  return {
    structure,
    reserve: maxReserveDensity(p) * structure,
    maturity: p.EHb,
    broodBuffer: 0,
    wearLoad: 0,
    hazard: 0,
  };
}
