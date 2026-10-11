import type { NutrientVector } from '../config/nutrients.js';
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
  /** Mass that lands every hour through the crowding taper, whatever the bloom is doing, 0–100 scale. */
  sporeRate: number;
  /** Q_min: mg of each nutrient's element — N, P, K, Fe — in a gram of its structure. */
  quotaMin: NutrientVector;
  /** Q_max: the same, with every store full. */
  quotaMax: NutrientVector;
  /** Days an empty store takes to fill at saturating concentration, at its opening rate. */
  storeFillDays: number;
}

export type AlgaeKind = 'greenWater' | 'film';

/**
 * The kinds of bloom a tank holds, on one model. Green water and film share
 * the flora law and differ by habitat and by traits, so the tank's conditions
 * pick the winner.
 *
 * Both saturate by 12 PAR and live in any water a plant does: green microalgae
 * grow from about pH 4 to past 9. Free CO₂ half-saturation for microalgae with
 * carbon-concentrating mechanisms runs well under 1 mg/L, since they take
 * bicarbonate too: 93 % on the 4 mg/L an uninjected tank holds, 99 % at an
 * injected 25. In culture, microalgae half-saturate on 0.05–2 ppm of nitrate,
 * and film sits in that range. Green water's 25 ppm departs from it: a
 * stand-in fitted from whole-tank runs.
 *
 * Green water is the sprinter, but a tank is not a culture: lit and on full
 * stores it grows at half Chlorella's culture maximum, 0.78 of its 1.56 a day
 * at 25 °C (Idris et al. 2014, Malays. J. Fundam. Appl. Sci. 10:2) — about a
 * doubling — between the 0.34–0.43 Chlorella reaches on settled and nitrified
 * effluent and the 0.95 on rich centrate (Wang et al. 2010, Appl. Biochem.
 * Biotechnol. 162:1174). It needs richer water than film. A cycled tank's
 * trace of ammonia meets 6 % of its nitrogen need, a 2 ppm spike 80 %, and
 * 10 ppm of nitrate 29 %. Phosphate at 0.1 ppm meets a third of its need, a
 * fed tank's 2 ppm 91 %.
 *
 * Film is the stayer: a third of a doubling a day, so it takes a week or two
 * to show on the glass, but efficient on lean water — a cycled tank's trace of
 * ammonia meets 60 % of its nitrogen need, and 5 ppm of nitrate 83 %. A green
 * film on glass carries about 0.3 mg of organic matter a cm².
 *
 * A kind's growth rate sets its pace per gram and its tissue density the grams
 * a full habitat holds, so `growthRate × tissueDensity / TISSUE_PER_RATE_UNIT`
 * is the rate units a full litre or cm² of habitat fixes and burns at: 1.8 for
 * green water and 0.006 for film, the tank-level CO₂ and O₂ per % of coverage
 * the whole-tank runs are fitted on. Why a bloom's light reads its coverage
 * rather than its grams is written at `opticsDefaults`.
 *
 * Spores are a source term, read in coverage like the bloom they land in:
 * 0.005 % of the column a day for green water, 0.05 % of the surfaces for
 * film, which films a lit glass over in a week or two. Nothing a reader sees,
 * but an empty tank is never closed to either.
 *
 * Green water's quotas are planktonic chlorophytes'. N: PCLake greens 2–10 %
 * (Janse 2005); Bougaran 2010 S. minutum q₀ 3.5 %, q_max 12 %; Healey &
 * Hendzel 1980 severe deficiency under 4 %. P: PCLake 0.15–1.5 %; Bougaran 2010
 * q₀ 0.23 %, q_max 1.9 %. K: Gerloff & Fishbeck 1969 Chlorella critical 0.4 %;
 * Ho 2003 replete 2.2 %. Fe: Glaesener 2013 C. reinhardtii limited 30–90 ppm,
 * replete 140–400 ppm; Sunda & Huntsman 1995 70 ppm at maximum growth.
 *
 * Film's are periphyton's, per ash-free dry mass. N: Schmidt 2019 Droop Q_min
 * 3.4 %; Kahlert 1998 deficient under 4.8–5.3 %; Hillebrand & Sommer 1999
 * optimum 7.5–8.3 %. P: Schmidt 2019 Q_min 0.17 %; H&S 1999 optimum
 * 0.98–1.08 %; Fanta 2010 lab plateau 1.07 %. K and Fe have no periphyton
 * figures: green water's, on the same photosynthetic machinery.
 *
 * Nothing publishes a store's fill time; those are Tune's.
 */
export const ALGAE: Readonly<Record<AlgaeKind, AlgaeTraits>> = {
  greenWater: {
    name: 'Green water',
    habitat: 'column',
    growthRate: 10,
    hardiness: 0.4,
    lowLight: 6,
    nutrientDemand: 'low',
    tolerableTemp: [12, 34],
    tolerablePH: [4.5, 9.5],
    co2HalfSaturation: 0.3,
    ammoniaHalfSaturation: 0.5,
    nitrateHalfSaturation: 25,
    phosphateHalfSaturation: 0.2,
    tissueDensity: 0.54,
    sporeRate: 0.0002,
    quotaMin: { nitrate: 25, phosphate: 1.5, potassium: 4, iron: 0.03 },
    quotaMax: { nitrate: 100, phosphate: 15, potassium: 22, iron: 0.2 },
    storeFillDays: 1,
  },
  film: {
    name: 'Film',
    habitat: 'surfaces',
    growthRate: 4,
    hardiness: 0.4,
    lowLight: 6,
    nutrientDemand: 'low',
    tolerableTemp: [12, 34],
    tolerablePH: [4.5, 9.5],
    co2HalfSaturation: 0.3,
    ammoniaHalfSaturation: 0.02,
    nitrateHalfSaturation: 1,
    phosphateHalfSaturation: 0.02,
    tissueDensity: 0.0045,
    sporeRate: 0.002,
    quotaMin: { nitrate: 34, phosphate: 1.7, potassium: 4, iron: 0.03 },
    quotaMax: { nitrate: 80, phosphate: 10, potassium: 22, iron: 0.2 },
    storeFillDays: 2,
  },
};

export const ALGAE_KINDS = Object.keys(ALGAE) as readonly AlgaeKind[];
