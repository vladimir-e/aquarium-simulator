/**
 * Plants system tunable configuration.
 *
 * Calibration targets:
 * - Photosynthesis: a grown-in planted 150 L runs 0.5–1.0 mg/L O2/hr by day
 * - Respiration: 5–15 % of the light-saturated rate at ambient carbon
 * - Growth: ~1-2% size increase per day at ideal conditions
 * - Nitrate consumption: ~5-10 mg/day
 */

import type { NutrientVector, NutrientVectorMeta } from './nutrients.js';

export interface PlantsConfig {
  // Photosynthesis constants
  /** Photosynthesis rate per rate unit of leaf at growth rate 1, per hour. */
  basePhotosynthesisRate: number;
  /** Dissolved CO2 (mg/L) at which a low-need species photosynthesises at half rate. */
  lowCo2HalfSaturation: number;
  /** Same, for a medium-need species. */
  mediumCo2HalfSaturation: number;
  /** Same, for a high-need species. */
  highCo2HalfSaturation: number;
  /**
   * Multiple of a species' `tolerableLight` lower bound at which it saturates.
   * The product is the `Ik` of the Jassby–Platt curve, in PAR: a species'
   * saturating irradiance is a fixed multiple of where its daily light edge
   * sits. At the shipped 2.0 a plant at the bottom of its band runs at 46 % of
   * its rate.
   */
  saturationIrradianceFactor: number;

  // Respiration constants
  /** Respiration rate per rate unit of leaf at growth rate 1, per hour. */
  baseRespirationRate: number;
  /** Q10 temperature coefficient (rate multiplier per 10°C) */
  respirationQ10: number;
  /** Reference temperature for respiration calculations (°C) */
  respirationReferenceTemp: number;
  /**
   * Dissolved O2 (mg/L) half-saturating the oxygen pace ω, read against
   * saturated water: it scales what a flora assimilates and mobilises, never
   * the upkeep it owes.
   */
  oxygenHalfSaturation: number;

  // Gas exchange
  /**
   * mg of CO2 carried by one rate unit — an hour of 500 cm² of leaf at growth
   * rate 1 under saturating light and carbon. Photosynthesis fixes it into
   * photosynthate and burning that releases it: one reaction run both ways, so
   * one yield. The oxygen partner is not a second knob — it derives at
   * `CO2_TO_O2_MASS_RATIO`.
   */
  co2PerRateUnit: number;

  // Energy budget — a plant's own, and the blooms' too where a kind's traits
  // carry nothing of their own.
  /** κ: share of what a plant's reserve mobilises that goes to its soma; the rest fills its offshoot buffer. */
  somaShare: number;
  /** κ_G: share of what a gram of new structure costs that ends up in it; the rest is burned building it. */
  growthEfficiency: number;
  /** [E_m]: grams of reserve a gram of structure holds when full. */
  reserveCapacity: number;
  /** Days an empty store takes to fill at saturating concentration, at its opening rate. */
  storeFillDays: number;
  /** Share of its condition deficit a flora repairs an hour, at the reference temperature. */
  healingRate: number;
  /** Hours of its maintenance a point of repair costs its reserve. */
  healingCost: number;
  /** Q_min: mg of each nutrient's element — N, P, K, Fe — in a gram of a plant's structure. */
  quotaMin: NutrientVector;
  /** Q_max: the same, with every store full. */
  quotaMax: NutrientVector;

  // Vitality stressor severities — see systems/plant-vitality.ts. Each is
  // a pre-hardiness damage rate (%/h per unit deviation), scaled by
  // `1 − hardiness` for the species, except nitrate, whose edge hardiness moves.
  /** Damage with the hour's whole upkeep unpaid, in proportion to the share unpaid. */
  starvationSeverity: number;
  /** Damage per PAR unit above the species' tolerable upper bound. */
  lightExcessiveSeverity: number;
  /** Damage per °C of temperature outside the species' tolerable range. */
  temperatureStressSeverity: number;
  /** Damage per pH unit outside the species' tolerable range. */
  phStressSeverity: number;
  /** Damage per dGH outside the species' tolerable range. */
  ghStressSeverity: number;
  /** Damage at a Droop limit of 0, falling linearly to nothing at `droopEdge`. */
  nutrientDeficiencySeverity: number;
  /** Droop limit its stores count as fed at: deficiency harm starts under it. */
  droopEdge: number;
  /** Damage per e-fold of NO3 past the plant's nitrate edge. */
  nitrateStressSeverity: number;
  /**
   * NO3 (ppm) where a plant of hardiness 0 starts taking harm; hardiness
   * carries it out by `toleranceFactor`, as it does a fish's.
   */
  nitrateEdge: number;

  // Vitality benefit peaks (%/h), each at the best its factor gets, earned on
  // reserve density times the stores' Droop limit: good water is worth nothing
  // to a flora that has burned its reserve or run its stores dry. Sum at a
  // full reserve, a Droop limit of 1 and band centre: 0.375 %/h.
  /** CO2, earned in proportion to the species' carbon Monod. */
  co2BenefitPeak: number;
  /** Temperature at the centre of the tolerable band, falling to 0 at its edges. */
  temperatureBenefitPeak: number;
  /** pH at the centre of the tolerable band, falling to 0 at its edges. */
  phBenefitPeak: number;

  // Shedding and death.
  /**
   * Share of itself a plant sheds per hour at condition 0, falling with the
   * square of the condition deficit to nothing at 100.
   */
  maxSheddingRate: number;
}

export const plantsDefaults: PlantsConfig = {
  basePhotosynthesisRate: 1.0,
  // Submerged plants that take only free CO2 half-saturate at roughly 2–9
  // mg/L. A low-need epiphyte runs at 73 % of its rate on the 4 mg/L an
  // uninjected tank holds and a carpet at 33 %; at an injected 25 mg/L the
  // two read 94 % and 76 %.
  lowCo2HalfSaturation: 1.5,
  mediumCo2HalfSaturation: 3,
  highCo2HalfSaturation: 8,
  // A species saturates at twice the PAR its band starts at. What that reads
  // across the roster, and why it lands where the literature does, is in
  // `plants/species.ts`.
  saturationIrradianceFactor: 2.0,

  // Maintenance, owed 24/7 — a share of the rate at saturating light and
  // carbon. On the 4 mg/L an uninjected tank holds, 0.03 is 4–9 % of what a
  // plant actually fixes, low-need to high-need: at or just below the bottom
  // of the 5–15 % the macrophyte literature reports against light-saturated
  // gross photosynthesis.
  baseRespirationRate: 0.03,
  respirationQ10: 2.0, // Rate doubles per 10°C increase
  respirationReferenceTemp: 25.0, // °C
  // Submerged tissue takes its oxygen out of the water across a boundary layer
  // rather than out of air, so the limit a plant meets is diffusion into the
  // leaf and not the mitochondrion's own affinity — macrophyte tissue starts
  // losing respiratory rate below roughly 1–2 mg/L. Half rate at 0.5 leaves a
  // healthy tank untouched and only bites where the tank is already in
  // trouble.
  oxygenHalfSaturation: 0.5,

  // mg CO2 per rate unit. Pinned against a grown-in planted 150 L — three
  // swords, four monte carlo patches, two java ferns and an anubias, all full:
  // 13.4 rate units of leaf, 13.3 at their growth rates — which makes 0.5–1
  // mg/L/h of gross oxygen through the photoperiod. A rate unit is an hour of
  // 500 cm² of leaf at growth rate 1, at full carbon *and* saturating light.
  // Under the planted preset's 90 PAR and 0.5 bps that tank admits 14–32.
  co2PerRateUnit: 30.0,

  // Energy budget. κ is DEB's usual 0.8, the generalised animal's (Kooijman
  // 2010, Table 8.1). κ_G, the full reserve and the stores' fill time are
  // Tune's: nothing checked against its source fixes them for a submerged
  // plant.
  somaShare: 0.8,
  growthEfficiency: 0.8,
  reserveCapacity: 0.2,
  storeFillDays: 3,
  // A flora closes 5 % of its deficit an hour at 25 °C, a sick plant back to
  // full in a few days, and a point costs it an hour of its upkeep.
  healingRate: 0.05,
  healingCost: 1,
  // Plants share one composition, macrophyte dry-weight figures × 1.25 for ash.
  // N: PCLake submerged vegetation 1.0–3.5 % (Janse 2005); Gerloff 1975 culture
  // floors 0.4–1.1 %, maxima 3.3–4.3 %; critical 1.3 % (Gerloff & Krombholz
  // 1966). P: PCLake 0.08–0.35 %; Gerloff 1975 floors 0.03–0.06 %, maxima
  // 0.35–0.73 %; critical 0.13 % (G&K 1966). K: Gerloff 1975 floors 0.25–0.3 %,
  // maxima 1.1–5.1 %; Linn 1973 survey mean 1.54 %. Fe: Gerloff 1975 Elodea
  // floor 40 ppm, culture maximum 219 ppm.
  quotaMin: { nitrate: 12, phosphate: 0.8, potassium: 4, iron: 0.05 },
  quotaMax: { nitrate: 45, phosphate: 6, potassium: 25, iron: 0.25 },

  // Vitality stressor severities (pre-hardiness; the plant's builder
  // scales them by `1 − hardiness` for the species, except nitrate, whose edge
  // hardiness moves).
  //
  // A flora whose upkeep goes wholly unpaid loses 0.5 %/h before hardiness,
  // what a fish does: a plant that has burned its reserve in the dark melts
  // over a week or two.
  starvationSeverity: 0.5,
  // %/h per PAR unit over the species band: 10 PAR over costs 0.15 %/h
  // pre-hardiness.
  lightExcessiveSeverity: 0.015,
  temperatureStressSeverity: 0.4,
  phStressSeverity: 3.0,
  ghStressSeverity: 0.1,
  nutrientDeficiencySeverity: 0.3,
  // A plant's Droop limit runs 0.7–0.9 on full stores. Harm starts at 0.3,
  // where its nitrogen store has fallen to a sixth of full — a quota near the
  // critical 1.3 % of Gerloff & Krombholz 1966.
  droopEdge: 0.3,
  // Plants take nitrate far past where fish do: the edge sits at 100 ppm, so
  // only a runaway doser reaches it, and each e-fold past it costs what one
  // costs a fish.
  nitrateStressSeverity: 1.0,
  nitrateEdge: 100,

  co2BenefitPeak: 0.125,
  temperatureBenefitPeak: 0.125,
  phBenefitPeak: 0.125,

  // 2 %/h is the melt of a plant at condition 0, an e-fold every two days.
  // Squared in the deficit it is 0.5 %/h at condition 50 and 0.08 %/h at 80,
  // so a plant relit before its condition collapses keeps most of itself.
  maxSheddingRate: 0.02,
};

/**
 * A Droop limit reaches 1 only on an infinite store, so the store an edge
 * asks, `Q_min × edge / (1 − edge)`, runs away as the edge nears it.
 */
export const MAX_DROOP_EDGE = 0.95;

export interface PlantsConfigMeta {
  key: keyof PlantsConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const plantsConfigMeta: PlantsConfigMeta[] = [
  // Photosynthesis
  {
    key: 'basePhotosynthesisRate',
    label: 'Base Photosynthesis Rate',
    unit: '/hr',
    min: 0.1,
    max: 5.0,
    step: 0.1,
  },
  { key: 'lowCo2HalfSaturation', label: 'Low-Need CO2 Half-Saturation', unit: 'mg/L', min: 0.5, max: 20, step: 0.5 },
  { key: 'mediumCo2HalfSaturation', label: 'Medium-Need CO2 Half-Saturation', unit: 'mg/L', min: 0.5, max: 20, step: 0.5 },
  { key: 'highCo2HalfSaturation', label: 'High-Need CO2 Half-Saturation', unit: 'mg/L', min: 0.5, max: 20, step: 0.5 },
  {
    key: 'saturationIrradianceFactor',
    label: 'Saturation Irradiance Factor',
    unit: '× band low',
    min: 0.5,
    max: 5,
    step: 0.1,
  },

  // Respiration
  {
    key: 'baseRespirationRate',
    label: 'Base Respiration Rate',
    unit: '/hr',
    min: 0.005,
    max: 0.2,
    step: 0.005,
  },
  { key: 'respirationQ10', label: 'Respiration Q10', unit: '', min: 1.5, max: 3.0, step: 0.1 },
  {
    key: 'respirationReferenceTemp',
    label: 'Respiration Ref Temp',
    unit: '°C',
    min: 20,
    max: 30,
    step: 1,
  },
  { key: 'oxygenHalfSaturation', label: 'O2 Pace Half-Saturation', unit: 'mg/L', min: 0.05, max: 3, step: 0.05 },
  // Gas exchange
  { key: 'co2PerRateUnit', label: 'CO2 per Rate Unit', unit: 'mg', min: 1, max: 200, step: 1 },

  // Energy budget
  { key: 'somaShare', label: 'Soma Share (κ)', unit: '', min: 0.1, max: 1, step: 0.05 },
  { key: 'growthEfficiency', label: 'Growth Efficiency (κ_G)', unit: '', min: 0.5, max: 0.95, step: 0.05 },
  { key: 'reserveCapacity', label: 'Full Reserve (E_m)', unit: 'g/g', min: 0.05, max: 0.6, step: 0.01 },
  { key: 'storeFillDays', label: 'Store Fill Time', unit: 'days', min: 0.25, max: 14, step: 0.25 },
  { key: 'healingRate', label: 'Healing Rate', unit: '/hr at ref temp', min: 0, max: 0.5, step: 0.005 },
  { key: 'healingCost', label: 'Healing Cost', unit: 'h upkeep/pt', min: 0.05, max: 10, step: 0.05 },

  // Vitality stressor severities
  { key: 'starvationSeverity', label: 'Starvation Severity', unit: '%/hr unpaid', min: 0, max: 5, step: 0.05 },
  { key: 'lightExcessiveSeverity', label: 'Light Excess Severity', unit: '%/PAR/hr', min: 0.005, max: 0.1, step: 0.005 },
  { key: 'temperatureStressSeverity', label: 'Plant Temp Severity', unit: '%/°C/hr', min: 0.1, max: 2.0, step: 0.1 },
  { key: 'phStressSeverity', label: 'Plant pH Severity', unit: '%/pH/hr', min: 0.5, max: 10, step: 0.5 },
  { key: 'ghStressSeverity', label: 'Plant GH Severity', unit: '%/dGH/hr', min: 0, max: 2, step: 0.05 },
  { key: 'nutrientDeficiencySeverity', label: 'Nutrient Defic. Severity', unit: '%/hr', min: 0.1, max: 2.0, step: 0.1 },
  { key: 'droopEdge', label: 'Droop Edge', unit: '', min: 0.05, max: MAX_DROOP_EDGE, step: 0.05 },
  { key: 'nitrateStressSeverity', label: 'Plant Nitrate Severity', unit: '%/e-fold/hr', min: 0.1, max: 10, step: 0.1 },
  { key: 'nitrateEdge', label: 'Plant Nitrate Edge', unit: 'ppm', min: 50, max: 300, step: 10 },

  // Vitality benefit peaks
  { key: 'co2BenefitPeak', label: 'CO2 Benefit Peak', unit: '%/hr', min: 0.0, max: 0.5, step: 0.05 },
  { key: 'temperatureBenefitPeak', label: 'Temp Benefit Peak', unit: '%/hr', min: 0.0, max: 0.5, step: 0.05 },
  { key: 'phBenefitPeak', label: 'pH Benefit Peak', unit: '%/hr', min: 0.0, max: 0.5, step: 0.05 },

  // Lifecycle (shedding + death)
  { key: 'maxSheddingRate', label: 'Max Shedding Rate', unit: '/hr', min: 0.005, max: 0.1, step: 0.005 },
];

export const quotaMinMeta: NutrientVectorMeta[] = [
  { key: 'nitrate', label: 'Nitrogen floor (Q_min)', unit: 'mg N/g', min: 4, max: 20, step: 1 },
  { key: 'phosphate', label: 'Phosphorus floor (Q_min)', unit: 'mg P/g', min: 0.3, max: 2, step: 0.1 },
  { key: 'potassium', label: 'Potassium floor (Q_min)', unit: 'mg K/g', min: 1, max: 8, step: 0.5 },
  { key: 'iron', label: 'Iron floor (Q_min)', unit: 'mg Fe/g', min: 0.01, max: 0.1, step: 0.01 },
];

export const quotaMaxMeta: NutrientVectorMeta[] = [
  { key: 'nitrate', label: 'Nitrogen ceiling (Q_max)', unit: 'mg N/g', min: 25, max: 80, step: 1 },
  { key: 'phosphate', label: 'Phosphorus ceiling (Q_max)', unit: 'mg P/g', min: 3, max: 15, step: 0.5 },
  { key: 'potassium', label: 'Potassium ceiling (Q_max)', unit: 'mg K/g', min: 10, max: 60, step: 1 },
  { key: 'iron', label: 'Iron ceiling (Q_max)', unit: 'mg Fe/g', min: 0.15, max: 0.6, step: 0.01 },
];
