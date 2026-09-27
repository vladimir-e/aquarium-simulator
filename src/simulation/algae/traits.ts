import type { NutrientDemand } from '../plants/species.js';
import type { FloraTraits } from '../systems/flora.js';

/** Where a kind of bloom lives: suspended in the water column, or coating the tank's lit surfaces. */
export type AlgaeHabitat = 'column' | 'surfaces';

/**
 * What a bloom is, in the terms a plant species is written in — without the
 * growth form, since a bloom has no height or footprint — and what a kind of
 * bloom has in their place: the habitat it fills.
 */
export interface AlgaeTraits extends FloraTraits {
  name: string;
  habitat: AlgaeHabitat;
  hardiness: number;
  nutrientDemand: NutrientDemand;
  /** Dissolved CO₂ (mg/L) it photosynthesises at half rate on. */
  co2HalfSaturation: number;
  /** Total ammonia (ppm, as NH₃) it meets half its nitrogen need on. */
  ammoniaHalfSaturation: number;
  /** Nitrate (ppm) it meets half its nitrogen need on. */
  nitrateHalfSaturation: number;
  /** Phosphate (ppm) it meets half its phosphorus need on. */
  phosphateHalfSaturation: number;
  /** Organic matter a full habitat holds, g per unit of it: a litre of column, a cm² of surface. */
  tissueDensity: number;
  /** Mass that lands every hour through the taper, whatever the bloom is doing, 0–100 scale. */
  sporeRate: number;
}

export type AlgaeKind = 'greenWater' | 'film';

/**
 * The kinds of bloom a tank holds, on one model. Green water and film share
 * the flora law and differ by habitat and by traits, so the tank's conditions
 * pick the winner.
 *
 * Both saturate by 12 PAR and take the warm, alkaline water plants struggle
 * in. Free CO₂ half-saturation for microalgae with carbon-concentrating
 * mechanisms runs well under 1 mg/L, since they take bicarbonate too: 93 % on
 * the 4 mg/L an uninjected tank holds, 99 % at an injected 25. Nitrate costs
 * them energy to reduce, so both take it more poorly than a plant does.
 *
 * Green water is the sprinter: a lit, rich day doubles it in about a day, but
 * it needs rich water. A cycled tank's trace of ammonia meets 6 % of its
 * nitrogen need and a 2 ppm spike 80 %; phosphate at 0.1 ppm meets a third of
 * its need, a fed tank's 2 ppm 91 %. Heavy green water carries some 10–50 mg/L
 * of dry cells.
 *
 * Film is the stayer: a third of green water's pace, so it takes a week or two
 * to show on the glass, but efficient on lean water — a cycled tank's trace of
 * ammonia meets 60 % of its nitrogen need, and 20 ppm of nitrate two thirds. A
 * green film on glass carries about 0.3 mg of organic matter a cm².
 *
 * Spores land at 0.05 of the scale a day: nothing a reader sees, but an empty
 * tank is never closed to either.
 */
export const ALGAE: Readonly<Record<AlgaeKind, AlgaeTraits>> = {
  greenWater: {
    name: 'Green water',
    habitat: 'column',
    growthRate: 60,
    hardiness: 0.4,
    lowLight: 6,
    nutrientDemand: 'low',
    tolerableTemp: [12, 34],
    tolerablePH: [5.5, 9.5],
    co2HalfSaturation: 0.3,
    ammoniaHalfSaturation: 0.5,
    nitrateHalfSaturation: 40,
    phosphateHalfSaturation: 0.2,
    tissueDensity: 0.03,
    sporeRate: 0.002,
  },
  film: {
    name: 'Film',
    habitat: 'surfaces',
    growthRate: 20,
    hardiness: 0.4,
    lowLight: 6,
    nutrientDemand: 'low',
    tolerableTemp: [12, 34],
    tolerablePH: [5.5, 9.5],
    co2HalfSaturation: 0.3,
    ammoniaHalfSaturation: 0.02,
    nitrateHalfSaturation: 10,
    phosphateHalfSaturation: 0.02,
    tissueDensity: 0.0003,
    sporeRate: 0.002,
  },
};

export const ALGAE_KINDS = Object.keys(ALGAE) as readonly AlgaeKind[];
