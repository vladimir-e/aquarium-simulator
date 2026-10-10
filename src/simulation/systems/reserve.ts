/**
 * What every organism with a Dynamic Energy Budget holds: reserve and
 * structure, in grams of organics for the reserve and the organism's own unit
 * for structure, the κ-rule that spends what the reserve mobilises, and the
 * hour a V1-morph's reserve runs through.
 */

import { hourlyDraw, hourlyInflowDraw, meanOfExp } from '../core/kinetics.js';
import { sum } from '../core/sum.js';

export interface ReserveState {
  structure: number;
  reserve: number;
}

export interface ReserveParams {
  pAm: number;
  v: number;
  kappa: number;
  pM: number;
  EG: number;
  kappaG: number;
}

export const maxReserveDensity = (p: ReserveParams): number => p.pAm / p.v;

export const reserveDensity = (state: ReserveState, p: ReserveParams): number =>
  state.structure > 0 ? state.reserve / (maxReserveDensity(p) * state.structure) : 0;

export const wellFed = (state: ReserveState, p: ReserveParams): number => Math.min(1, reserveDensity(state, p));

/** Grams of organics a unit of structure holds: its cost net of the overhead burned building it. */
export const structureOrganics = (p: ReserveParams): number => p.kappaG * p.EG;

export const totalBurned = <K extends string>({ burned }: { burned: Readonly<Record<K, number>> }): number =>
  sum(Object.values<number>(burned));

/** Maintenance due over the hour: the soma's, and whatever the branch owes before it covers the soma. */
export interface Upkeep {
  soma: number;
  branch: number;
}

/** What each organism makes of its two shares: the reserve its growth invests, and what its buffer keeps. */
export interface SpendRules<G extends { invested: number }> {
  invest: (surplus: number) => G;
  deposit: (rest: number, growth: G) => number;
}

export interface Spent<G> {
  somaticPaid: number;
  somaticUnpaid: number;
  surplus: number;
  growth: G;
  branchPaid: number;
  branchUnpaid: number;
  somaFromBranch: number;
  rest: number;
  toBuffer: number;
  buffer: number;
  somaFromBuffer: number;
  fromStructure: number;
}

/**
 * The κ-rule over an hour's mobilisation: maintenance out of the κ share
 * first and growth out of what is left; the branch pays its own upkeep, then
 * the soma's shortfall, then its buffer. What maintenance is still owed comes
 * out of the buffer, then out of `structure` grams.
 */
export function spend<G extends { invested: number }>(
  mobilised: number,
  kappa: number,
  upkeep: Readonly<Upkeep>,
  held: Readonly<{ buffer: number; structure: number }>,
  rules: SpendRules<G>
): Spent<G> {
  const somaShare = kappa * mobilised;
  const somaticPaid = Math.min(somaShare, upkeep.soma);
  const somaticUnpaid = upkeep.soma - somaticPaid;
  const surplus = somaShare - somaticPaid;
  const growth = rules.invest(surplus);

  const branch = mobilised - somaShare;
  const branchPaid = Math.min(branch, upkeep.branch);
  const branchUnpaid = upkeep.branch - branchPaid;
  const branchLeft = branch - branchPaid;
  const somaFromBranch = Math.min(branchLeft, somaticUnpaid);
  const rest = branchLeft - somaFromBranch;
  const toBuffer = rules.deposit(rest, growth);

  const somaticDue = somaticUnpaid - somaFromBranch;
  const buffer = held.buffer + toBuffer;
  const somaFromBuffer = Math.min(buffer, somaticDue);
  const fromStructure = Math.min(somaticDue - somaFromBuffer, held.structure);
  return {
    somaticPaid,
    somaticUnpaid,
    surplus,
    growth,
    branchPaid,
    branchUnpaid,
    somaFromBranch,
    rest,
    toBuffer,
    buffer,
    somaFromBuffer,
    fromStructure,
  };
}

/** The most of an empty reserve any slice of an hour turns over. */
export const K_SLICE = 0.5;

/** Share of its reserve a V1-morph mobilises per hour at the density it holds: DEB's p_C / E. */
export const turnover = (state: ReserveState, p: ReserveParams): number =>
  state.structure > 0
    ? (state.structure * (p.v * p.EG + p.pM)) / (p.EG * state.structure + p.kappa * state.reserve)
    : 0;

/** Slices of an hour at pace τ: an empty reserve turns over fastest, and none turns over more than K_SLICE of it. */
export const hourSlices = (p: ReserveParams, tau: number): number =>
  Math.max(1, Math.ceil((tau * turnover({ structure: 1, reserve: 0 }, p)) / K_SLICE));

/** What flows through an hour, or a slice of it: grams into the reserve, grams of it asked for repair, and the pace. */
export interface ReserveHour {
  inflow: number;
  healing: number;
  tau: number;
}

/** A slice spent: the state and fluxes it leaves, and the grams of its release its κ-rule turned back into reserve. */
export interface ReserveSlice<S, F> {
  state: S;
  fluxes: F;
  turnedBack: number;
}

/** What an organism makes of the reserve its hour releases. */
export interface ReserveBudget<S extends ReserveState, F> {
  /** 0–1: the share of a full reserve's growth its limits leave it. */
  growthLimit: (state: S) => number;
  slice: (state: S, released: number, hour: Readonly<ReserveHour>) => ReserveSlice<S, F>;
  add: (a: F, b: F) => F;
}

/**
 * A V1-morph's hour, in `hourSlices` slices. Each releases by exponential
 * Euler at its own turnover net of the share its κ-rule turns back, so what
 * comes back passes through again, and never more than a full reserve
 * releases over the structure the slice grows. The fish keeps its own
 * mobilisation: moving it here changes fish numbers, and is its own change.
 */
export function integrateHour<S extends ReserveState, F>(
  state: S,
  p: ReserveParams,
  hour: Readonly<ReserveHour>,
  budget: ReserveBudget<S, F>
): { state: S; fluxes: F } {
  const slices = hourSlices(p, hour.tau);
  const slice = { inflow: hour.inflow / slices, healing: hour.healing / slices, tau: hour.tau / slices };
  const full = maxReserveDensity(p);
  const fullTurnover = turnover({ structure: 1, reserve: full }, p);
  const fullGrowth = (p.kappa * p.pAm - p.pM) / (p.EG + p.kappa * full);

  const released = (at: S): number => {
    const rate = slice.tau * turnover(at, p);
    const drawn = (net: number): number => at.reserve * hourlyDraw(net) + slice.inflow * hourlyInflowDraw(net);
    const first = drawn(rate);
    const turnedBack = first > 0 ? budget.slice(at, first, slice).turnedBack / first : 0;
    const meanStructure = at.structure * meanOfExp(slice.tau * fullGrowth * budget.growthLimit(at));
    return Math.min(drawn((1 - turnedBack) * rate) / (1 - turnedBack), slice.tau * fullTurnover * full * meanStructure);
  };

  let spent = budget.slice(state, released(state), slice);
  for (let i = 1; i < slices; i++) {
    const next = budget.slice(spent.state, released(spent.state), slice);
    spent = { ...next, fluxes: budget.add(spent.fluxes, next.fluxes) };
  }
  return { state: spent.state, fluxes: spent.fluxes };
}
