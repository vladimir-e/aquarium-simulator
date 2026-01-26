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
  /** Nitrate consumed per unit photosynthesis (mg per L of tank) */
  nitratePerPhotosynthesis: number;
  /** Biomass produced per unit photosynthesis */
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
}

export const plantsDefaults: PlantsConfig = {
  // Photosynthesis - calibrated for ~0.7 mg/L O2/hr at 100% plant size, optimal conditions
  basePhotosynthesisRate: 1.0,
  optimalCo2: 20.0, // mg/L - typical target for planted tanks
  optimalNitrate: 10.0, // ppm - typical target for planted tanks
  o2PerPhotosynthesis: 0.7, // mg/L per photosynthesis unit
  co2PerPhotosynthesis: 0.5, // mg/L per photosynthesis unit
  nitratePerPhotosynthesis: 0.02, // mg per L per photosynthesis unit (~0.4 mg/day at 10hr lights)
  biomassPerPhotosynthesis: 1.0, // biomass units per photosynthesis unit

  // Respiration - ~15% of photosynthesis, runs 24/7
  baseRespirationRate: 0.15,
  o2PerRespiration: 0.7, // Same stoichiometry as photosynthesis (reversed)
  co2PerRespiration: 0.5,
  respirationQ10: 2.0, // Rate doubles per 10°C increase
  respirationReferenceTemp: 25.0, // °C

  // Growth - ~1.5% per day at ideal conditions (10hr light, optimal resources)
  sizePerBiomass: 0.15, // 10hr light × 1.0 biomass × 0.15 = 1.5% per day
  overgrowthPenaltyScale: 200, // Penalty reaches 50% at 200% size
  wastePerExcessSize: 0.01, // Grams waste per % excess above 200

  // Algae competition - 200% total plant size halves algae growth
  competitionScale: 200,
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
    key: 'nitratePerPhotosynthesis',
    label: 'Nitrate per Photosynthesis',
    unit: 'mg/L',
    min: 0.001,
    max: 0.1,
    step: 0.001,
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
  { key: 'competitionScale', label: 'Competition Scale', unit: '%', min: 100, max: 400, step: 10 },
];
