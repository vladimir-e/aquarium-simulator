import type { NutrientDemand } from '../plants/species.js';
import type { FloraTraits } from '../systems/flora.js';

/**
 * What a bloom is, in the terms a plant species is written in — without the
 * growth form, since a bloom has no height or footprint — and what a kind of
 * bloom has in their place.
 */
export interface AlgaeTraits extends FloraTraits {
  name: string;
  hardiness: number;
  nutrientDemand: NutrientDemand;
  /** Dissolved CO₂ (mg/L) it photosynthesises at half rate on. */
  co2HalfSaturation: number;
  /** Total ammonia (ppm, as NH₃) it meets half its nitrogen need on. */
  ammoniaHalfSaturation: number;
  /** Nitrate (ppm) it meets half its nitrogen need on. */
  nitrateHalfSaturation: number;
  /** Organic matter in a litre of habitat at a full bloom, g. */
  tissuePerLitre: number;
  /** Mass that lands every hour through the taper, whatever the bloom is doing, 0–100 scale. */
  sporeRate: number;
}

/**
 * Green algae, suspended in the water column. It saturates by 12 PAR, lives on
 * a lean column, and takes the warm, alkaline water plants struggle in.
 *
 * Free CO₂ half-saturation for microalgae with carbon-concentrating mechanisms
 * runs well under 1 mg/L, since they take bicarbonate too: 93 % on the 4 mg/L
 * an uninjected tank holds, 99 % at an injected 25. It takes ammonia as keenly
 * as a plant — 0.05 ppm is 0.04 mg/L of nitrogen — but nitrate poorly, since
 * reducing it costs energy a plant's leaf can spare: 15–20 ppm meets a quarter
 * to a third of its need. Heavy green water carries some 10–50 mg/L of dry
 * cells; 30 mg/L of organic matter ties up about 7 ppm of nitrate-equivalent
 * nitrogen. Spores land at 0.05 of the scale a day: nothing a reader sees, but
 * an empty tank is never closed to a bloom.
 */
export const ALGAE: AlgaeTraits = {
  name: 'Algae',
  growthRate: 30,
  hardiness: 0.4,
  lowLight: 6,
  nutrientDemand: 'low',
  tolerableTemp: [12, 34],
  tolerablePH: [5.5, 9.5],
  co2HalfSaturation: 0.3,
  ammoniaHalfSaturation: 0.05,
  nitrateHalfSaturation: 40,
  tissuePerLitre: 0.03,
  sporeRate: 0.002,
};
