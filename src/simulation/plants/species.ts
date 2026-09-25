import type { PlantsConfig } from '../config/plants.js';

/**
 * Plant species types.
 * Each species has different light/CO2 requirements and growth rates.
 */
export type PlantSpecies =
  | 'java_fern'
  | 'anubias'
  | 'amazon_sword'
  | 'dwarf_hairgrass'
  | 'monte_carlo';

/**
 * Nutrient demand level for plants.
 * Determines how much of the optimal nutrient levels a plant needs.
 */
export type NutrientDemand = 'low' | 'medium' | 'high';

export type Co2Requirement = 'low' | 'medium' | 'high';

/**
 * Plant species characteristics.
 */
export interface PlantSpeciesData {
  /** Display name */
  name: string;
  /** Carbon need: picks the half-saturation its photosynthesis runs on */
  co2Requirement: Co2Requirement;
  /** Relative growth rate (higher = faster biomass distribution) */
  growthRate: number;
  /** Substrate requirement for planting */
  substrateRequirement: 'none' | 'sand' | 'aqua_soil';
  /** Nutrient demand level - affects how much fertilizer is needed */
  nutrientDemand: NutrientDemand;
  /**
   * Per-plant biological maximum size (% units, same scale as `Plant.size`).
   * Drives the asymptotic growth factor in `spendSurplus`:
   * `factor = max(0, 1 - size / maxSize)`. The factor reduces spending
   * efficiency as the plant approaches `maxSize` so it self-limits.
   *
   * Values are sized so that within calibration test windows (peak per-plant
   * size ≤ ~100%), the factor stays > 0.9 — the asymptotic term is
   * effectively 1.0 during calibration runs. Slow attached species (Java
   * Fern, Anubias) cap lower than fast column / carpet species, reflecting
   * relative biological growth ceilings in real tanks.
   */
  maxSize: number;
  /**
   * Hardiness 0–1. Multiplies all stressor severities through the
   * vitality engine — higher = species tolerates poor conditions
   * better. Mirrors `FishSpeciesData.hardiness`. Anubias / Java Fern
   * sit at 0.7 (forgiving), high-tech carpet species at 0.3 (fussy).
   */
  hardiness: number;
  /**
   * Tolerable PAR range (µmol/m²/s) at the substrate. Outside this band a
   * light-insufficient (low) or light-excessive (high) stressor activates.
   * The two-sided shape lets shade species like Anubias burn under a
   * high-output fixture, in addition to the usual carpet-species low-light
   * complaints. The hobby's published tiers are low 15-30, medium 30-50,
   * high 50-80+.
   */
  tolerableLight: [number, number];
  /** Tolerable temperature range in °C — outside is stress. */
  tolerableTemp: [number, number];
  /** Tolerable pH range — outside is stress. */
  tolerablePH: [number, number];
  /** Tolerable general hardness in dGH — outside is stress. */
  tolerableGH: [number, number];
}

/**
 * Species catalog with characteristics for each plant type.
 */
export const PLANT_SPECIES_DATA: Record<PlantSpecies, PlantSpeciesData> = {
  java_fern: {
    name: 'Java Fern',
    co2Requirement: 'low',
    growthRate: 0.5,
    substrateRequirement: 'none', // Attaches to hardscape
    nutrientDemand: 'low', // Can survive on fish waste alone
    // Slow attached fern. Calibration peak (S2A day 28): 54%.
    // factor at peak = 1 - 54/600 = 0.91 → calibration-safe.
    maxSize: 600,
    hardiness: 0.7, // Forgiving — survives most beginner setups
    // Alive at 10 PAR — below anything the hobby calls low light — and
    // bleaches past 90, which takes the brightest fixture in the catalog.
    tolerableLight: [10, 90],
    tolerableTemp: [18, 30],
    tolerablePH: [5.5, 8.0],
    tolerableGH: [1, 20],
  },
  anubias: {
    name: 'Anubias',
    co2Requirement: 'low',
    growthRate: 0.3,
    substrateRequirement: 'none', // Attaches to hardscape
    nutrientDemand: 'low', // Can survive on fish waste alone
    // Slowest, attached. S4A day 56 anubias hits 68%.
    // factor at peak = 1 - 68/700 = 0.903 → calibration-safe.
    maxSize: 700,
    hardiness: 0.75, // Hardiest of the bunch — bombproof
    // Deepest-shade tolerance of the five — 8 PAR is the understory of a
    // stocked scape. Its thick slow leaves scorch past 70.
    tolerableLight: [8, 70],
    tolerableTemp: [18, 30],
    tolerablePH: [5.5, 8.0],
    tolerableGH: [1, 20],
  },
  amazon_sword: {
    name: 'Amazon Sword',
    co2Requirement: 'medium',
    growthRate: 1.0,
    substrateRequirement: 'sand',
    nutrientDemand: 'medium', // Benefits from dosing
    // Medium-rate column plant. Calibration peak (S2A day 28): 73%.
    // factor at peak = 1 - 73/800 = 0.909 → calibration-safe.
    maxSize: 800,
    hardiness: 0.5,
    // Medium-light plant, and a big one: it holds on at 20 PAR but only
    // fills out toward the middle of the band, and 120 is past anything
    // a sword is asked to take.
    tolerableLight: [20, 120],
    tolerableTemp: [20, 28],
    tolerablePH: [5.5, 7.8],
    tolerableGH: [2, 20],
  },
  dwarf_hairgrass: {
    name: 'Dwarf Hairgrass',
    co2Requirement: 'high',
    growthRate: 1.5,
    substrateRequirement: 'aqua_soil',
    nutrientDemand: 'high', // Requires regular dosing
    // Fast carpet. No direct calibration coverage; matched to monte_carlo
    // since both are high-demand carpet species with similar growth rates.
    maxSize: 1100,
    hardiness: 0.3, // Fussy — needs everything dialled in
    // High-light carpet — below 25 PAR at the substrate it grows upward
    // instead of across. Tolerates the 200 PAR a high-tech scape runs.
    tolerableLight: [25, 200],
    tolerableTemp: [20, 28],
    tolerablePH: [5.5, 7.8],
    tolerableGH: [1, 18],
  },
  monte_carlo: {
    name: 'Monte Carlo',
    co2Requirement: 'high',
    growthRate: 1.8,
    substrateRequirement: 'aqua_soil',
    nutrientDemand: 'high', // Requires regular dosing
    // Fast carpet. Calibration peak (S2A day 28): 103%.
    // factor at peak = 1 - 103/1100 = 0.906 → calibration-safe.
    maxSize: 1100,
    hardiness: 0.3, // Fussy — same band as hairgrass
    // Hungrier for light than hairgrass — 30 PAR at the substrate is the
    // usual advice for a carpet that actually carpets.
    tolerableLight: [30, 200],
    tolerableTemp: [20, 28],
    tolerablePH: [5.5, 7.8],
    tolerableGH: [1, 15],
  },
};

/**
 * The PAR a species stops answering more of — `Ik` of the Jassby–Platt curve
 * both light channels run on.
 *
 * Derived from the band rather than declared, at `saturationIrradianceFactor ×
 * tolerableLight[0]`: anubias 16, java fern 20, amazon sword 40, dwarf
 * hairgrass 50, monte carlo 60. That is inside the published macrophyte range —
 * shade species saturate at 10–30 µmol/m²/s, sun species at 50–150 — and it
 * makes a species' saturating irradiance a fixed multiple of where its damage
 * threshold sits, so one number carries both light channels. At the shipped
 * factor a plant at its lower bound runs at 46 % of its rate while the
 * light-insufficient stressor charges it.
 */
export function getSaturationIrradiance(species: PlantSpecies, config: PlantsConfig): number {
  return config.saturationIrradianceFactor * PLANT_SPECIES_DATA[species].tolerableLight[0];
}

export function getCo2HalfSaturation(species: PlantSpecies, config: PlantsConfig): number {
  switch (PLANT_SPECIES_DATA[species].co2Requirement) {
    case 'low':
      return config.lowCo2HalfSaturation;
    case 'medium':
      return config.mediumCo2HalfSaturation;
    case 'high':
      return config.highCo2HalfSaturation;
  }
}
