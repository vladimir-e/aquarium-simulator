/**
 * Plants system tunable configuration.
 *
 * Calibration targets:
 * - Photosynthesis: 100% total plant size with optimal CO2/nitrate = ~0.5-1.0 mg/L O2/hr
 * - Respiration: ~10-20% of max photosynthesis rate
 * - Growth: ~1-2% size increase per day at ideal conditions
 * - Nitrate consumption: ~5-10 mg/day
 */

export interface PlantsConfig {
  // Photosynthesis constants
  /** Base photosynthesis rate per 100% plant size per hour */
  basePhotosynthesisRate: number;
  /** Optimal CO2 concentration for max photosynthesis (mg/L) */
  optimalCo2: number;
  /** Optimal nitrate concentration for max growth (ppm) */
  optimalNitrate: number;
  /** Oxygen produced per unit photosynthesis (mg/L) */
  o2PerPhotosynthesis: number;
  /** CO2 consumed per unit photosynthesis (mg/L) */
  co2PerPhotosynthesis: number;
  /**
   * Total plant nutrients (NO3 + PO4 + K + Fe) consumed per unit of "potential
   * photosynthesis" (plant size × light × CO2, pre-Liebig). Consumption is
   * split across the four nutrients by the fertilizer formula ratio.
   * Calibrated so at Variant A steady state the plants' daily uptake roughly
   * matches the 1 ml/day auto-dose + fish bioload (scenario 02).
   */
  nutrientsPerPhotosynthesis: number;
  /** Biomass produced per unit of actual photosynthesis (post-Liebig). */
  biomassPerPhotosynthesis: number;

  // Respiration constants
  /** Base respiration rate per 100% plant size per hour */
  baseRespirationRate: number;
  /** Oxygen consumed per unit respiration (mg/L) */
  o2PerRespiration: number;
  /** CO2 produced per unit respiration (mg/L) */
  co2PerRespiration: number;
  /** Q10 temperature coefficient (rate multiplier per 10°C) */
  respirationQ10: number;
  /** Reference temperature for respiration calculations (°C) */
  respirationReferenceTemp: number;

  // Growth constants
  /** Size increase per unit biomass (% per biomass unit) */
  sizePerBiomass: number;
  /** Scale for overgrowth penalty calculation */
  overgrowthPenaltyScale: number;
  /** Waste released per unit excess size above 200% */
  wastePerExcessSize: number;

  // Algae competition
  /** Scale factor for plant competition with algae (200% plants = halved algae growth) */
  competitionScale: number;

  // Vitality stressor severities — see systems/plant-vitality.ts. Each is
  // a pre-hardiness damage rate (%/h per unit deviation); the species
  // hardiness multiplies the sum centrally.
  /** Damage per W of light below the species' tolerable lower bound. */
  lightInsufficientSeverity: number;
  /** Damage per W of light above the species' tolerable upper bound. */
  lightExcessiveSeverity: number;
  /** Damage per mg/L of CO2 below the species' tolerable lower bound. */
  co2InsufficientSeverity: number;
  /** Damage per °C of temperature outside the species' tolerable range. */
  temperatureStressSeverity: number;
  /** Damage per pH unit outside the species' tolerable range. */
  phStressSeverity: number;
  /** Damage per (1 − sufficiency) for nutrient deficiency. */
  nutrientDeficiencySeverity: number;
  /**
   * Damage per ppm of NO3 above the toxicity ceiling (the auto-doser
   * overdose case). Plants tolerate large surpluses; this only fires
   * at gross excess.
   */
  nutrientToxicitySeverity: number;
  /** Threshold (ppm NO3) above which nutrient toxicity activates. */
  nutrientToxicityThresholdNitrate: number;
  /** Damage per algae unit above the shading threshold. */
  algaeShadingSeverity: number;
  /** Algae level (0–100) above which shading stress kicks in. */
  algaeShadingThreshold: number;

  // Vitality benefit peaks (%/h) when the corresponding factor is in
  // its tolerable band. Sum at all-good ≈ 0.5 %/h — the calibration
  // budget the plant recovery curves were pinned against.
  /** Light in tolerable range. */
  lightBenefitPeak: number;
  /** CO2 in tolerable range. */
  co2BenefitPeak: number;
  /** Temperature in tolerable range. */
  temperatureBenefitPeak: number;
  /** pH in tolerable range. */
  phBenefitPeak: number;
  /** Nutrient sufficiency 1.0 (Liebig). */
  nutrientBenefitPeak: number;
}

export const plantsDefaults: PlantsConfig = {
  // Photosynthesis - calibrated for ~0.7 mg/L O2/hr at 100% plant size, optimal conditions
  basePhotosynthesisRate: 1.0,
  optimalCo2: 20.0, // mg/L - typical target for planted tanks
  optimalNitrate: 10.0, // ppm - typical target for planted tanks
  o2PerPhotosynthesis: 0.7, // mg/L per photosynthesis unit
  co2PerPhotosynthesis: 0.5, // mg/L per photosynthesis unit
  // Calibrated against scenario 02: at ~300 % total plant size with 8 hr
  // photoperiod and optimal CO2, potential photosynthesis ≈ 1.0 × 3.0 × 1.0
  // = 3.0 / hr → 24 units / day. 4 mg/unit × 24 × 1.2 (active biomass +
  // 20 % maintenance draw) ≈ 115 mg/day total nutrient uptake at full
  // sufficiency — matches the 1 ml/day auto-dose (96 mg) + fish bioload
  // + ambient mineralization so NO3 plateaus instead of runaway.
  // See `systems/photosynthesis.ts` for the uptake formula; it blends
  // Liebig-gated biomass draw with a smaller potential-rate maintenance
  // draw, so Variant B plants keep trickling nutrients down even with a
  // starved limiting factor.
  nutrientsPerPhotosynthesis: 4.0,
  biomassPerPhotosynthesis: 1.0, // biomass units per photosynthesis unit

  // Respiration - ~15% of photosynthesis, runs 24/7
  baseRespirationRate: 0.15,
  o2PerRespiration: 0.7, // Same stoichiometry as photosynthesis (reversed)
  co2PerRespiration: 0.5,
  respirationQ10: 2.0, // Rate doubles per 10°C increase
  respirationReferenceTemp: 25.0, // °C

  // Growth — calibrated for scenario 02: 5 plants starting at 35 % size reach
  // roughly 60–85 % by day 28 under optimal conditions (Variant A). At
  // biomass rate 1.0 per 100 % plant size, 8 hr/day photoperiod, and the
  // per-species growth-rate share, this gives the MC carpet the visible
  // "filled in" behavior hobbyists expect in a high-tech tank.
  sizePerBiomass: 0.4,
  overgrowthPenaltyScale: 200, // Penalty reaches 50% at 200% size
  wastePerExcessSize: 0.01, // Grams waste per % excess above 200

  // Algae competition - 100% total plant size halves algae growth
  // Real planted tanks with dense coverage almost eliminate algae
  competitionScale: 100,

  // Vitality stressor severities (pre-hardiness; the species hardiness
  // factor multiplies damage centrally inside `computeVitality`).
  // Calibrated so a Monte Carlo (hardiness 0.3) loses visible condition
  // within ~24 sim hours when CO2 falls from 20 mg/L to 5 mg/L (gap of
  // 5 mg/L below tolerableCO2 lower bound) — matches the spec acceptance
  // scenario.
  lightInsufficientSeverity: 0.2,
  lightExcessiveSeverity: 0.05,
  co2InsufficientSeverity: 1.5,
  temperatureStressSeverity: 0.4,
  phStressSeverity: 3.0,
  // Nutrient deficiency severity: drives how fast plants decline when
  // their Liebig sufficiency falls. Calibrated against scenario 02
  // Variant B: a Monte Carlo with Fe limited (sufficiency drops to
  // ~0.1 by day 14 as substrate-leach Fe runs out) should bottom out
  // in the 30–55 condition band by day 28 rather than dying. Severity
  // 0.6 keeps the MC trajectory inside the band; tighter severities
  // crash MC mid-scenario.
  nutrientDeficiencySeverity: 0.7,
  // Toxicity threshold is high (100 ppm NO3) so normal dosing never
  // triggers — only the auto-doser massive-overdose case. Severity
  // is small so the stress climbs gradually past the threshold
  // rather than killing instantly.
  nutrientToxicitySeverity: 0.01,
  nutrientToxicityThresholdNitrate: 100,
  algaeShadingSeverity: 0.01,
  algaeShadingThreshold: 50,

  // Vitality benefit peaks. Sum at all-good = 0.5 %/h. With a healthy
  // tank the plant heals to 100 in under 4 sim days, then surplus
  // drives growth.
  lightBenefitPeak: 0.1,
  co2BenefitPeak: 0.1,
  temperatureBenefitPeak: 0.1,
  phBenefitPeak: 0.1,
  nutrientBenefitPeak: 0.1,
};

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
  { key: 'optimalCo2', label: 'Optimal CO2', unit: 'mg/L', min: 5, max: 40, step: 1 },
  { key: 'optimalNitrate', label: 'Optimal Nitrate', unit: 'ppm', min: 5, max: 30, step: 1 },
  {
    key: 'o2PerPhotosynthesis',
    label: 'O2 per Photosynthesis',
    unit: 'mg/L',
    min: 0.1,
    max: 2.0,
    step: 0.1,
  },
  {
    key: 'co2PerPhotosynthesis',
    label: 'CO2 per Photosynthesis',
    unit: 'mg/L',
    min: 0.1,
    max: 2.0,
    step: 0.1,
  },
  {
    key: 'nutrientsPerPhotosynthesis',
    label: 'Nutrients per Photosynthesis',
    unit: 'mg',
    min: 0.5,
    max: 20,
    step: 0.5,
  },
  {
    key: 'biomassPerPhotosynthesis',
    label: 'Biomass per Photosynthesis',
    unit: '',
    min: 0.1,
    max: 5.0,
    step: 0.1,
  },
  // Respiration
  {
    key: 'baseRespirationRate',
    label: 'Base Respiration Rate',
    unit: '/hr',
    min: 0.01,
    max: 0.5,
    step: 0.01,
  },
  { key: 'o2PerRespiration', label: 'O2 per Respiration', unit: 'mg/L', min: 0.1, max: 2.0, step: 0.1 },
  {
    key: 'co2PerRespiration',
    label: 'CO2 per Respiration',
    unit: 'mg/L',
    min: 0.1,
    max: 2.0,
    step: 0.1,
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
  // Growth
  { key: 'sizePerBiomass', label: 'Size per Biomass', unit: '%', min: 0.01, max: 1.0, step: 0.01 },
  {
    key: 'overgrowthPenaltyScale',
    label: 'Overgrowth Penalty Scale',
    unit: '%',
    min: 100,
    max: 400,
    step: 10,
  },
  {
    key: 'wastePerExcessSize',
    label: 'Waste per Excess Size',
    unit: 'g/%',
    min: 0.001,
    max: 0.1,
    step: 0.001,
  },
  // Algae competition
  { key: 'competitionScale', label: 'Competition Scale', unit: '%', min: 50, max: 300, step: 10 },

  // Vitality stressor severities
  { key: 'lightInsufficientSeverity', label: 'Light Insuff. Severity', unit: '%/W/hr', min: 0.01, max: 1.0, step: 0.05 },
  { key: 'lightExcessiveSeverity', label: 'Light Excess Severity', unit: '%/W/hr', min: 0.01, max: 0.5, step: 0.01 },
  { key: 'co2InsufficientSeverity', label: 'CO2 Insuff. Severity', unit: '%/(mg/L)/hr', min: 0.1, max: 5.0, step: 0.1 },
  { key: 'temperatureStressSeverity', label: 'Plant Temp Severity', unit: '%/°C/hr', min: 0.1, max: 2.0, step: 0.1 },
  { key: 'phStressSeverity', label: 'Plant pH Severity', unit: '%/pH/hr', min: 0.5, max: 10, step: 0.5 },
  { key: 'nutrientDeficiencySeverity', label: 'Nutrient Defic. Severity', unit: '%/(1-suff)/hr', min: 0.1, max: 2.0, step: 0.1 },
  { key: 'nutrientToxicitySeverity', label: 'Nutrient Tox. Severity', unit: '%/ppm/hr', min: 0.001, max: 0.2, step: 0.005 },
  { key: 'nutrientToxicityThresholdNitrate', label: 'NO3 Tox. Threshold', unit: 'ppm', min: 50, max: 300, step: 10 },
  { key: 'algaeShadingSeverity', label: 'Algae Shading Severity', unit: '%/algae/hr', min: 0.001, max: 0.1, step: 0.005 },
  { key: 'algaeShadingThreshold', label: 'Algae Shading Threshold', unit: '', min: 20, max: 80, step: 5 },

  // Vitality benefit peaks
  { key: 'lightBenefitPeak', label: 'Light Benefit Peak', unit: '%/hr', min: 0.0, max: 0.5, step: 0.05 },
  { key: 'co2BenefitPeak', label: 'CO2 Benefit Peak', unit: '%/hr', min: 0.0, max: 0.5, step: 0.05 },
  { key: 'temperatureBenefitPeak', label: 'Temp Benefit Peak', unit: '%/hr', min: 0.0, max: 0.5, step: 0.05 },
  { key: 'phBenefitPeak', label: 'pH Benefit Peak', unit: '%/hr', min: 0.0, max: 0.5, step: 0.05 },
  { key: 'nutrientBenefitPeak', label: 'Nutrient Benefit Peak', unit: '%/hr', min: 0.0, max: 0.5, step: 0.05 },
];
