/**
 * What the blooms take from the light, by Beer–Lambert on their coverage; a
 * kind's habitat decides how the light crosses it. Suspended in the column it
 * is spread over the depth, so it joins the water's extinction in proportion
 * to its coverage. On the lit surfaces it is a coat, and the share of a
 * surface it covers passes `e^(−D)` of the light, D a full coat's optical
 * depth. A leaf is a lit surface, coated at the kind's coverage.
 */

import type { SimulationState } from '../state.js';
import type { OpticsConfig } from '../config/optics.js';
import { ALGAE, ALGAE_KINDS, type AlgaeHabitat, type AlgaeKind } from './traits.js';
import { mapKinds } from './blooms.js';
import { bloomMass } from './habitat.js';

/** What the blooms' light loss is read off: their tissue and the habitats it spreads over. */
export type BloomTank = Pick<SimulationState, 'tank' | 'equipment' | 'algae'>;

export interface BloomLightLoss {
  /** What it adds to the water's extinction, per cm. */
  extinction: number;
  /** The share of a lit surface's light its coat takes, 0–1. */
  coat: number;
}

const LOSS: Record<AlgaeHabitat, (fill: number, optics: OpticsConfig) => BloomLightLoss> = {
  column: (fill, optics) => ({ extinction: fill * optics.algaeAttenuationPerCm, coat: 0 }),
  surfaces: (fill, optics) => ({ extinction: 0, coat: fill * -Math.expm1(-optics.algaeCoatOpticalDepth) }),
};

/** What the tank's water and its blooms take from the light, as they stand. */
export interface LightLoss {
  /** The water's extinction, per cm: its own, and what the blooms suspended in it add. */
  extinction: number;
  /** The share of a leaf's light the blooms coating it let through. */
  leafPass: number;
  blooms: Record<AlgaeKind, BloomLightLoss>;
}

export function lightLoss(tank: BloomTank, optics: OpticsConfig): LightLoss {
  const loss = mapKinds((kind) => LOSS[ALGAE[kind].habitat](bloomMass(tank, kind) / 100, optics));
  return {
    extinction: ALGAE_KINDS.reduce((k, kind) => k + loss[kind].extinction, optics.waterAttenuationPerCm),
    leafPass: ALGAE_KINDS.reduce((passed, kind) => passed * (1 - loss[kind].coat), 1),
    blooms: loss,
  };
}

export function waterExtinction(tank: BloomTank, optics: OpticsConfig): number {
  return lightLoss(tank, optics).extinction;
}

/** The share of the light a bloom lets through the column to `depthCm` under the surface. */
export function columnPass(loss: BloomLightLoss, depthCm: number): number {
  return Math.exp(-loss.extinction * depthCm);
}

/** The share of the light a bloom lets through to a leaf `depthCm` under the surface: down the column, then its coat. */
export function bloomPass(loss: BloomLightLoss, depthCm: number): number {
  return columnPass(loss, depthCm) * (1 - loss.coat);
}
