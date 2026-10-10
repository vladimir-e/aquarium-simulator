/**
 * A fish's Dynamic Energy Budget in engine units: grams of organics for every
 * energy-like quantity, cm³ for structure, hours for time.
 * The hourly step assumes L ≫ v·τ·ω.
 * Reserve density can exceed 1 while structure burns at ω < 1; readouts use wellFed.
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
  /** g/cm³: dry grams per wet cm³ of structure, which AmP assumes for reserve too */
  dV: number;
  /** g */
  E0: number;
  /** cm */
  Lb: number;
  delM: number;
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

export const maxReserveDensity = (p: DebParams): number => p.pAm / p.v;

export const reserveDensity = (state: DebState, p: DebParams): number =>
  state.structure > 0 ? state.reserve / (maxReserveDensity(p) * state.structure) : 0;

export const wellFed = (state: DebState, p: DebParams): number => Math.min(1, reserveDensity(state, p));

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

/** An hour's inputs: ω in [0, 1]; healing ≥ 0, grams of reserve to spend on repair at full oxygen. */
export interface DebHour {
  fromGut: number;
  tau: number;
  omega: number;
  stress?: Readonly<DebStress>;
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
  returned: number;
  assimilated: number;
  feces: number;
  mobilised: number;
  toStructure: number;
  fromStructure: number;
  burned: DebBurned;
  /** Maintenance its own share of the mobilisation could not pay: somatic from κ, maturity from 1 − κ. */
  shortfall: number;
}

export interface DebStep {
  state: DebState;
  fluxes: DebFluxes;
}

/** Maintenance owed over the hour, somatic and maturity: what a shortfall is a share of. */
export function upkeep(
  state: DebState,
  p: DebParams,
  { tau, stress = NO_STRESS }: Pick<DebHour, 'tau' | 'stress'>
): number {
  return (p.pM * stress.maintenance * state.structure + p.kJ * state.maturity) * tau;
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

/** One hour of the budget: τ paces every rate; ω scales {p_Am}, v and healing. */
export function stepDeb(state: DebState, p: DebParams, hour: DebHour): DebStep {
  const { fromGut, tau, omega, stress = NO_STRESS, healing = 0 } = hour;
  const { structure: V, reserve: E, maturity: EH, broodBuffer: ER, wearLoad: q, hazard: h } = state;
  const pMStressed = p.pM * stress.maintenance;
  const EGStressed = p.EG * stress.growthCost;
  const gramsPerCm3 = structureOrganics(p);
  const L = structuralLength(state);
  const adult = mature(state, p);

  const intake = Math.min(fromGut, assimilationCeiling(state, p, hour) / p.kappaX);
  const assimilated = p.kappaX * intake;
  const conductance = omega * p.v;
  const mobilised =
    V > 0
      ? Math.min(
          E,
          (tau * E * (conductance * EGStressed * L * L + pMStressed * V)) / (EGStressed * V + p.kappa * E)
        )
      : 0;

  const somaShare = p.kappa * mobilised;
  const somaticUpkeep = pMStressed * V * tau;
  const somaticPaid = Math.min(somaShare, somaticUpkeep);
  const somaticUnpaid = somaticUpkeep - somaticPaid;
  const invested = somaShare - somaticPaid;
  const grown = invested / EGStressed;
  const toStructure = gramsPerCm3 * grown;

  const branch = mobilised - somaShare;
  const maturityUpkeep = p.kJ * tau * EH;
  const upkept = Math.min(branch, maturityUpkeep);
  const maturityDue = maturityUpkeep - upkept;
  const surplus = branch - upkept;
  const somaFromSurplus = Math.min(surplus, somaticUnpaid);
  const reproduction = surplus - somaFromSurplus;
  const toBuffer = adult ? reproduction : Math.max(0, EH + reproduction - p.EHp);

  const somaticDue = somaticUnpaid - somaFromSurplus;
  const buffer = ER + toBuffer;
  const somaFromBuffer = Math.min(buffer, somaticDue);
  const fromStructure = Math.min(somaticDue - somaFromBuffer, gramsPerCm3 * V);
  const maturityFromBuffer = Math.min(buffer - somaFromBuffer, maturityDue);
  const healed = Math.min(omega * healing, E + assimilated - mobilised);

  const nextV = V + grown - fromStructure / gramsPerCm3;
  const dilution = nextV > 0 ? V / nextV : 0;
  const drive = V > 0 ? mobilised / (maxReserveDensity(p) * V) : 0;
  const Vm = maxStructuralLength(p) ** 3;
  const accrual = (q * (V / Vm) * p.sG + p.ha * tau * tau) * drive;

  return {
    state: {
      structure: nextV,
      reserve: E + assimilated - mobilised - healed,
      maturity: adult ? EH : Math.min(p.EHp, EH + reproduction) - (maturityDue - maturityFromBuffer),
      broodBuffer: buffer - somaFromBuffer - maturityFromBuffer,
      wearLoad: (q + accrual) * dilution,
      hazard: (h + q) * dilution,
    },
    fluxes: {
      returned: fromGut - intake,
      assimilated,
      feces: intake - assimilated,
      mobilised,
      toStructure,
      fromStructure,
      burned: {
        maintenance: somaticPaid,
        development: upkept + reproduction - toBuffer,
        growth: invested - toStructure,
        starvation: somaFromSurplus + somaFromBuffer + maturityFromBuffer + fromStructure,
        healing: healed,
      },
      shortfall: somaticUnpaid + maturityDue,
    },
  };
}

export function eggsReady(state: DebState, p: DebParams, stress: Readonly<DebStress> = NO_STRESS): number {
  return Math.floor((p.kappaR * state.broodBuffer) / (p.E0 * stress.eggCost));
}

export interface Spawn {
  state: DebState;
  eggs: number;
  /** Grams of organics the eggs carry. */
  laid: number;
  overhead: number;
}

export function layEggs(state: DebState, p: DebParams, eggs: number, stress: Readonly<DebStress> = NO_STRESS): Spawn {
  const count = Math.max(0, Math.min(Math.floor(eggs), eggsReady(state, p, stress)));
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
