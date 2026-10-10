/**
 * A fish's Dynamic Energy Budget — Kooijman's standard model in engine units:
 * grams of organics for every energy-like quantity, cm³ for structure, hours
 * for time. Food becomes reserve, reserve pays maintenance first, a fixed
 * share of the rest buys structure and the remainder matures the fish, then
 * fills its brood buffer. Every gram that leaves a stock lands in another or
 * is burned, so the ledger closes by construction.
 */

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
  /** K */
  TRef: number;
  delM: number;
  /** g/cm³ */
  dV: number;
}

export interface DebStress {
  assimilation: number;
  maintenance: number;
  growthCost: number;
  eggCost: number;
}

export const NO_STRESS: DebStress = { assimilation: 1, maintenance: 1, growthCost: 1, eggCost: 1 };

export interface DebState {
  /** cm³ */
  V: number;
  E: number;
  EH: number;
  ER: number;
  /** 1/h² */
  q: number;
  /** 1/h */
  h: number;
}

const WET_DENSITY = 1;

export const structuralLength = (state: DebState): number => Math.cbrt(state.V);

export const physicalLength = (state: DebState, p: DebParams): number => structuralLength(state) / p.delM;

export const maxReserveDensity = (p: DebParams): number => p.pAm / p.v;

export const reserveDensity = (state: DebState, p: DebParams): number =>
  state.V > 0 ? state.E / (maxReserveDensity(p) * state.V) : 0;

export const maxStructuralLength = (p: DebParams): number => (p.kappa * p.pAm) / p.pM;

/** Grams of organics a cm³ of structure holds: its cost net of the overhead burned building it. */
export const structureOrganics = (p: DebParams): number => p.kappaG * p.EG;

/** Grams of organics in the body: reserve, buffer and structure. */
export const organics = (state: DebState, p: DebParams): number =>
  state.E + state.ER + structureOrganics(p) * state.V;

/** Structure at the density of water, reserve and buffer at the reserve's dry-to-wet ratio. */
export const wetMass = (state: DebState, p: DebParams): number =>
  WET_DENSITY * state.V + (state.E + state.ER) / p.dV;

export function arrhenius(T: number, TA: number, TRef: number): number {
  return Math.exp(TA / TRef - TA / T);
}

export interface DebHour {
  /** Grams of food digested this hour. */
  digested: number;
  tau: number;
  omega: number;
  stress?: DebStress;
}

export interface DebBurned {
  maintenance: number;
  development: number;
  growth: number;
  starvation: number;
}

export interface DebFluxes {
  /** Digested grams past the assimilation ceiling, left for the gut. */
  undigested: number;
  assimilated: number;
  feces: number;
  mobilised: number;
  toStructure: number;
  fromStructure: number;
  toBuffer: number;
  fromBuffer: number;
  burned: DebBurned;
  /** Somatic maintenance the soma share couldn't pay, in g/h. */
  shortfall: number;
}

export interface DebStep {
  state: DebState;
  fluxes: DebFluxes;
}

/** One hour of the budget, every rate at the pace τ·ω. */
export function stepDeb(state: DebState, p: DebParams, hour: DebHour): DebStep {
  const { digested, tau, omega, stress = NO_STRESS } = hour;
  const { V, E, EH, ER, q, h } = state;
  const pace = tau * omega;
  const kappaX = p.kappaX * stress.assimilation;
  const pM = p.pM * stress.maintenance;
  const EG = p.EG * stress.growthCost;
  const content = structureOrganics(p);
  const L = Math.cbrt(V);

  const ceiling = p.pAm * L * L * pace;
  const intake = kappaX * digested <= ceiling ? digested : ceiling / kappaX;
  const assimilated = kappaX * intake;

  const demand = EG * V + p.kappa * E;
  const mobilised = demand > 0 ? (pace * E * (p.v * EG * L * L + pM * V)) / demand : 0;

  const soma = p.kappa * mobilised;
  const maintenance = pM * V * pace;
  const paid = Math.min(soma, maintenance);
  const invested = soma - paid;
  const shortfall = maintenance - paid;
  const grown = invested / EG;
  const toStructure = content * grown;

  const branch = mobilised - soma;
  const maturityMaintenance = p.kJ * pace * EH;
  const toMaturity = EH >= p.EHp ? 0 : Math.min(branch - maturityMaintenance, p.EHp - EH);
  const reproduction = branch - maturityMaintenance - toMaturity;
  const toBuffer = Math.max(0, reproduction);
  const buffer = Math.max(0, ER + reproduction);
  const paidByBuffer = Math.min(buffer, shortfall);
  const fromStructure = Math.min(shortfall - paidByBuffer, content * V);
  const nextER = buffer - paidByBuffer;

  const nextV = V + grown - fromStructure / content;
  const r = V > 0 ? (nextV - V) / V : 0;
  const drive = V > 0 ? reserveDensity(state, p) * ((p.v * pace) / L - r) : 0;
  const Vm = maxStructuralLength(p) ** 3;

  return {
    state: {
      V: nextV,
      E: E + assimilated - mobilised,
      EH: toMaturity === p.EHp - EH ? p.EHp : EH + toMaturity,
      ER: nextER,
      q: q + (q * (V / Vm) * p.sG + p.ha * pace * pace) * drive - r * q,
      h: h + q - r * h,
    },
    fluxes: {
      undigested: digested - intake,
      assimilated,
      feces: intake - assimilated,
      mobilised,
      toStructure,
      fromStructure,
      toBuffer,
      fromBuffer: ER + toBuffer - nextER,
      burned: {
        maintenance: paid,
        development: branch + ER - buffer,
        growth: invested - toStructure,
        starvation: paidByBuffer + fromStructure,
      },
      shortfall,
    },
  };
}

export function eggsReady(state: DebState, p: DebParams, E0: number, stress: DebStress = NO_STRESS): number {
  return Math.floor((p.kappaR * state.ER) / (E0 * stress.eggCost));
}

export interface Brood {
  state: DebState;
  /** Grams of organics the eggs carry. */
  laid: number;
  overhead: number;
}

export function layEggs(
  state: DebState,
  p: DebParams,
  eggs: number,
  E0: number,
  stress: DebStress = NO_STRESS
): Brood {
  const laid = eggs * E0;
  const drawn = (laid * stress.eggCost) / p.kappaR;
  return { state: { ...state, ER: state.ER - drawn }, laid, overhead: drawn - laid };
}

export function hatchling(p: DebParams, Lb: number): DebState {
  const V = Lb ** 3;
  return { V, E: maxReserveDensity(p) * V, EH: p.EHb, ER: 0, q: 0, h: 0 };
}
