/**
 * What the blooms take from the light. Algal tissue takes it by Beer–Lambert
 * on the grams the light crosses per cm² of its path, at one coefficient for
 * every kind; a kind's habitat decides how the light crosses it. Suspended in
 * the column it is spread over the depth, so it joins the water's extinction
 * by its tissue per cm³. On the lit surfaces it is a coat, and the share of a
 * surface it covers passes `e^(−κσ)` of the light, σ a full coat's tissue per
 * cm². A leaf is a lit surface, coated at the kind's coverage.
 */

import type { Blooms } from '../state.js';
import type { OpticsConfig } from '../config/optics.js';
import { ALGAE, ALGAE_KINDS, type AlgaeHabitat, type AlgaeKind, type AlgaeTraits } from './traits.js';
import { mapKinds } from './blooms.js';

export interface BloomShade {
  /** What it adds to the water's extinction, per cm. */
  extinction: number;
  /** The share of a lit surface's light its coat takes, 0–1. */
  coat: number;
}

const CM3_PER_LITRE = 1000;

const SHADE: Record<AlgaeHabitat, (fill: number, traits: AlgaeTraits, perGram: number) => BloomShade> = {
  column: (fill, { tissueDensity }, perGram) => ({
    extinction: (perGram * fill * tissueDensity) / CM3_PER_LITRE,
    coat: 0,
  }),
  surfaces: (fill, { tissueDensity }, perGram) => ({
    extinction: 0,
    coat: fill * -Math.expm1(-perGram * tissueDensity),
  }),
};

/** What the tank's water and its blooms take from the light, as they stand. */
export interface LightLoss {
  /** The water's extinction, per cm: its own, and what the blooms suspended in it add. */
  extinction: number;
  /** The share of a leaf's light the blooms coating it let through. */
  leafPass: number;
  blooms: Record<AlgaeKind, BloomShade>;
}

export function lightLoss(blooms: Blooms, optics: OpticsConfig): LightLoss {
  const shade = mapKinds((kind) =>
    SHADE[ALGAE[kind].habitat](blooms[kind].mass / 100, ALGAE[kind], optics.algaeAttenuationPerGram)
  );
  return {
    extinction: ALGAE_KINDS.reduce((k, kind) => k + shade[kind].extinction, optics.waterAttenuationPerCm),
    leafPass: ALGAE_KINDS.reduce((passed, kind) => passed * (1 - shade[kind].coat), 1),
    blooms: shade,
  };
}

export function waterExtinction(blooms: Blooms, optics: OpticsConfig): number {
  return lightLoss(blooms, optics).extinction;
}

/** The share of the light a bloom lets through the column to `depthCm` under the surface. */
export function columnPass(shade: BloomShade, depthCm: number): number {
  return Math.exp(-shade.extinction * depthCm);
}

/** The share of the light a bloom lets through to a leaf `depthCm` under the surface: down the column, then its coat. */
export function bloomPass(shade: BloomShade, depthCm: number): number {
  return columnPass(shade, depthCm) * (1 - shade.coat);
}
