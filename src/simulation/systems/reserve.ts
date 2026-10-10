/**
 * What every organism with a Dynamic Energy Budget holds: reserve and
 * structure, in grams of organics for the reserve and the organism's own unit
 * for structure, and the κ-rule that spends what the reserve mobilises.
 */

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
