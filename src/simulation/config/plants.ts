/**
 * Plants system tunable configuration.
 *
 * Calibration targets:
 * - Photosynthesis: a grown-in planted 150 L runs 0.5–1.0 mg/L O2/hr by day
 * - Respiration: 5–15 % of the light-saturated rate at ambient carbon
 * - Growth: ~1-2% size increase per day at ideal conditions
 * - Nitrate consumption: ~5-10 mg/day
 */

import { SURPLUS_CAP_DEFAULT } from './vitality.js';

export interface PlantsConfig {
  // Photosynthesis constants
  /** Base photosynthesis rate per rate unit per hour */
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
  /** Base respiration rate per rate unit per hour */
  baseRespirationRate: number;
  /** Q10 temperature coefficient (rate multiplier per 10°C) */
  respirationQ10: number;
  /** Reference temperature for respiration calculations (°C) */
  respirationReferenceTemp: number;
  /** Dissolved O2 (mg/L) at which respiration runs at half its base rate. */
  respirationOxygenHalfSaturation: number;

  // Gas exchange
  /**
   * mg of CO2 carried by one rate unit — an hour of 500 cm² of leaf at base
   * rate under saturating light and carbon. Photosynthesis fixes it and respiration
   * releases it: one reaction run both ways, so one yield, and the day/night
   * asymmetry belongs to `baseRespirationRate`. The oxygen partner is not a
   * second knob — it derives at `CO2_TO_O2_MASS_RATIO`.
   */
  co2PerRateUnit: number;

  // Surplus-driven growth knobs.
  /**
   * Share of the bank a plant draws toward new tissue each hour, before the
   * taper `1 − size/100` closes it down as the unit fills.
   */
  growthDrawRate: number;
  /**
   * Rate, per hour and per unit of species `growthRate`, a plant's bank heals
   * condition below 100 at: a plant repairs at the pace it grows.
   */
  healingDrawRate: number;
  /**
   * Size gained per surplus unit converted, before the species growth-rate
   * multiplier. With species growth rates in the 0.3–1.8 band this knob sets
   * the order of magnitude of the surplus → size conversion.
   */
  sizePerSurplus: number;
  /**
   * Ceiling on the bank. Income past full condition banks up to it, and a full
   * bank buys an offshoot (see `propagate`).
   * Shared default across organism types — see `SURPLUS_CAP_DEFAULT`.
   */
  surplusCap: number;
  /**
   * Organic matter in a % of a rate unit of tissue (g): what growth draws the
   * recipe for, and shedding and death return as waste.
   */
  tissuePerSize: number;

  // Vitality stressor severities — see systems/plant-vitality.ts. Each is
  // a pre-hardiness damage rate (%/h per unit deviation), scaled by
  // `1 − hardiness` for the species, except nitrate, whose edge hardiness moves.
  /**
   * Damage at a daily light integral of zero, falling linearly to nothing at
   * the species' daily light edge and moved off `respirationReferenceTemp` by
   * the respiration Q10.
   */
  lightStarvationSeverity: number;
  /** Damage per PAR unit above the species' tolerable upper bound. */
  lightExcessiveSeverity: number;
  /** Damage per °C of temperature outside the species' tolerable range. */
  temperatureStressSeverity: number;
  /** Damage per pH unit outside the species' tolerable range. */
  phStressSeverity: number;
  /** Damage per dGH outside the species' tolerable range. */
  ghStressSeverity: number;
  /**
   * Damage at a Liebig sufficiency of 0 under saturating light, falling
   * linearly to nothing at `sufficiencyEdge`.
   */
  nutrientDeficiencySeverity: number;
  /** Liebig sufficiency a plant counts as fed: deficiency harm starts under it. */
  sufficiencyEdge: number;
  /** Damage per e-fold of NO3 past the plant's nitrate edge. */
  nitrateStressSeverity: number;
  /**
   * NO3 (ppm) where a plant of hardiness 0 starts taking harm; hardiness
   * carries it out by `toleranceFactor`, as it does a fish's.
   */
  nitrateEdge: number;
  /** Damage per algae unit above the shading threshold. */
  algaeShadingSeverity: number;
  /** Algae level (0–100) above which shading stress kicks in. */
  algaeShadingThreshold: number;

  // Vitality benefit peaks (%/h), each at the best its factor gets. Every one
  // of them is realised through photosynthesis, so all three run on its drive:
  // the light term `tanh(PAR / Ik)` times the Liebig sufficiency. The budget is
  // the plant's income, and good water is worth nothing at midnight or with a
  // nutrient run dry. Sum at saturating light, full sufficiency and band
  // centre: 0.375 %/h.
  /** CO2, earned in proportion to the species' carbon Monod. */
  co2BenefitPeak: number;
  /** Temperature at the centre of the tolerable band, falling to 0 at its edges. */
  temperatureBenefitPeak: number;
  /** pH at the centre of the tolerable band, falling to 0 at its edges. */
  phBenefitPeak: number;

  // Lifecycle (shedding + death) — see `systems/plant-lifecycle.ts`.
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

  // Dark respiration, runs 24/7 — a share of the rate at saturating light and
  // carbon. On the 4 mg/L an uninjected tank holds, 0.03 is 4–9 % of what a
  // plant actually fixes, low-need to high-need: at or just below the bottom
  // of the 5–15 % the macrophyte literature reports against light-saturated
  // gross photosynthesis. The Monod below leaves 94 % of it standing in
  // air-saturated water.
  baseRespirationRate: 0.03,
  respirationQ10: 2.0, // Rate doubles per 10°C increase
  respirationReferenceTemp: 25.0, // °C
  // Submerged tissue takes its oxygen out of the water across a boundary layer
  // rather than out of air, so the limit a plant meets is diffusion into the
  // leaf and not the mitochondrion's own affinity — macrophyte tissue starts
  // losing respiratory rate below roughly 1–2 mg/L. Half rate at 0.5 leaves a
  // healthy tank untouched (94 % at 8 mg/L) and only bites where the tank is
  // already in trouble.
  respirationOxygenHalfSaturation: 0.5,

  // mg CO2 per rate unit. Pinned against a grown-in planted 150 L (≈10 rate
  // units, some 5,000 cm² of leaf): it produces 0.5–1 mg/L/h of gross oxygen
  // through the photoperiod. A rate unit is an hour of 500 cm² of leaf at full
  // carbon *and* saturating light. That tank admits 22.3–44.6, and the same
  // claim read on a planting grown in from 3.5 rate units admits 21.6–43.4.
  co2PerRateUnit: 30.0,

  // Surplus-driven growth — vitality banks the income a full-condition plant
  // earns; growth draws a share of the bank round the clock and only what
  // becomes size leaves it.
  //
  // 2 %/h is a ~50-hour time constant, two days: how long a cutting takes to
  // stop sulking and start growing. The bank settles near a day or two of
  // income, what a plant carries into a bad spell, and stays well under
  // `surplusCap` until the taper closes the draw down and it fills to buy an
  // offshoot.
  growthDrawRate: 0.02,
  // 0.05 /h at growth rate 1: a sword spends a bank on repair with a 20 h time
  // constant, a monte carlo in half that, an anubias over three days.
  healingDrawRate: 0.05,
  sizePerSurplus: 0.4, // size % per (surplus × growthRate) unit converted
  surplusCap: SURPLUS_CAP_DEFAULT,
  tissuePerSize: 0.01,

  // Vitality stressor severities (pre-hardiness; the plant's builder
  // scales them by `1 − hardiness` for the species, except nitrate, whose edge
  // hardiness moves).
  //
  // Full darkness costs 0.3 %/h pre-hardiness at 25 °C — 0.21 %/h for a monte
  // carlo, so a carpet lasts two to three weeks unlit and the hobby's
  // three-day algae blackout costs a plant its bank and little else.
  lightStarvationSeverity: 0.3,
  // %/h per PAR unit over the species band: 10 PAR over costs 0.15 %/h
  // pre-hardiness.
  lightExcessiveSeverity: 0.015,
  temperatureStressSeverity: 0.4,
  phStressSeverity: 3.0,
  ghStressSeverity: 0.1,
  nutrientDeficiencySeverity: 0.3,
  // Monod never reaches 1, so the edge sits where a plant has 90 % of its
  // need met.
  sufficiencyEdge: 0.9,
  // Plants take nitrate far past where fish do: the edge sits at 100 ppm, so
  // only a runaway doser reaches it, and each e-fold past it costs what one
  // costs a fish.
  nitrateStressSeverity: 1.0,
  nitrateEdge: 100,
  // Algae shading kicks in past 30 % bloom mass — that threshold makes
  // the player feel the bloom on their plants. Severity 0.05 % / h per
  // mass-point means a 60 % bloom delivers ~1.5 %/h pre-hardiness damage
  // (calibration-grade — task 42 first-pass; recalibration follows).
  algaeShadingSeverity: 0.05,
  algaeShadingThreshold: 30,

  // Vitality benefit peaks. The light term and sufficiency take the whole
  // budget down together: a monte carlo at 30 PAR earns 0.46 of it, and every
  // plant earns none of it in the dark or starved. With a healthy lit tank the
  // plant heals to 100 in a few sim days, then surplus drives growth.
  co2BenefitPeak: 0.125,
  temperatureBenefitPeak: 0.125,
  phBenefitPeak: 0.125,

  // 2 %/h is the melt of a plant at condition 0, an e-fold every two days.
  // Squared in the deficit it is 0.5 %/h at condition 50 and 0.08 %/h at 80,
  // so a plant relit before its condition collapses keeps most of itself.
  maxSheddingRate: 0.02,
};

/**
 * A Monod share reaches 1 only at infinite concentration, so the need an edge
 * sets, `K × edge / (1 − edge)`, runs away as the edge nears it.
 */
export const MAX_SUFFICIENCY_EDGE = 0.95;

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
  {
    key: 'respirationOxygenHalfSaturation',
    label: 'Respiration O2 Half-Saturation',
    unit: 'mg/L',
    min: 0.05,
    max: 3,
    step: 0.05,
  },
  // Gas exchange
  { key: 'co2PerRateUnit', label: 'CO2 per Rate Unit', unit: 'mg', min: 1, max: 200, step: 1 },
  // Surplus-driven growth
  { key: 'growthDrawRate', label: 'Growth Draw Rate', unit: '/hr', min: 0.005, max: 0.2, step: 0.005 },
  { key: 'healingDrawRate', label: 'Healing Draw Rate', unit: '/hr per growth rate', min: 0.005, max: 0.5, step: 0.005 },
  { key: 'sizePerSurplus', label: 'Size per Bank Point', unit: '%/pt', min: 0.01, max: 2.0, step: 0.01 },
  { key: 'surplusCap', label: 'Bank Cap', unit: 'pts', min: 0, max: 100, step: 5 },
  { key: 'tissuePerSize', label: 'Tissue per Size', unit: 'g/%', min: 0.001, max: 0.05, step: 0.001 },

  // Vitality stressor severities
  { key: 'lightStarvationSeverity', label: 'Light Starvation Severity', unit: '%/hr', min: 0.05, max: 2, step: 0.05 },
  { key: 'lightExcessiveSeverity', label: 'Light Excess Severity', unit: '%/PAR/hr', min: 0.005, max: 0.1, step: 0.005 },
  { key: 'temperatureStressSeverity', label: 'Plant Temp Severity', unit: '%/°C/hr', min: 0.1, max: 2.0, step: 0.1 },
  { key: 'phStressSeverity', label: 'Plant pH Severity', unit: '%/pH/hr', min: 0.5, max: 10, step: 0.5 },
  { key: 'ghStressSeverity', label: 'Plant GH Severity', unit: '%/dGH/hr', min: 0, max: 2, step: 0.05 },
  { key: 'nutrientDeficiencySeverity', label: 'Nutrient Defic. Severity', unit: '%/hr', min: 0.1, max: 2.0, step: 0.1 },
  { key: 'sufficiencyEdge', label: 'Sufficiency Edge', unit: '', min: 0.1, max: MAX_SUFFICIENCY_EDGE, step: 0.05 },
  { key: 'nitrateStressSeverity', label: 'Plant Nitrate Severity', unit: '%/e-fold/hr', min: 0.1, max: 10, step: 0.1 },
  { key: 'nitrateEdge', label: 'Plant Nitrate Edge', unit: 'ppm', min: 50, max: 300, step: 10 },
  { key: 'algaeShadingSeverity', label: 'Algae Shading Severity', unit: '%/algae/hr', min: 0.001, max: 0.1, step: 0.005 },
  { key: 'algaeShadingThreshold', label: 'Algae Shading Threshold', unit: '', min: 20, max: 80, step: 5 },

  // Vitality benefit peaks
  { key: 'co2BenefitPeak', label: 'CO2 Benefit Peak', unit: '%/hr', min: 0.0, max: 0.5, step: 0.05 },
  { key: 'temperatureBenefitPeak', label: 'Temp Benefit Peak', unit: '%/hr', min: 0.0, max: 0.5, step: 0.05 },
  { key: 'phBenefitPeak', label: 'pH Benefit Peak', unit: '%/hr', min: 0.0, max: 0.5, step: 0.05 },

  // Lifecycle (shedding + death)
  { key: 'maxSheddingRate', label: 'Max Shedding Rate', unit: '/hr', min: 0.005, max: 0.1, step: 0.005 },
];
