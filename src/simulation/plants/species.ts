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

/**
 * Plant species characteristics.
 */
export interface PlantSpeciesData {
  /** Display name */
  name: string;
  /** CO2 requirement level */
  co2Requirement: 'low' | 'medium' | 'high';
  /** Relative growth rate (higher = faster biomass distribution) */
  growthRate: number;
  /** Substrate requirement for planting */
  substrateRequirement: 'none' | 'sand' | 'aqua_soil';
  /** Nutrient demand level - affects how much fertilizer is needed */
  nutrientDemand: NutrientDemand;
  /**
   * Per-plant biological maximum size (% units, same scale as `Plant.size`).
   * Drives the asymptotic growth factor in `spendSurplusOnGrowth`:
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
  /**
   * Tolerable CO2 range in mg/L. High-tech species suffer when CO2 falls
   * below their lower bound (the auto-doser-failure case from this
   * task's motivating bug). Low-tech species' lower bound is just above
   * atmospheric so they don't false-trigger.
   */
  tolerableCO2: [number, number];
  /** Tolerable temperature range in °C — outside is stress. */
  tolerableTemp: [number, number];
  /** Tolerable pH range — outside is stress. */
  tolerablePH: [number, number];
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
    // No CO2 dependency — atmospheric (~3 mg/L) is enough.
    tolerableCO2: [1, 40],
    tolerableTemp: [18, 30],
    tolerablePH: [6.0, 8.0],
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
    tolerableCO2: [1, 40],
    tolerableTemp: [18, 30],
    tolerablePH: [6.0, 8.0],
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
    // Mild CO2 dependence — sword grows happily on atmospheric (~4 mg/L)
    // CO2 in low-tech tanks, so the lower bound sits just above
    // atmospheric. The spec's "high-tech tank loses CO2" scenario has
    // sword decline slower than Monte Carlo: the engine produces this
    // through milder daytime damage that nightly healing partially
    // offsets, so sword degrades over weeks rather than days.
    tolerableCO2: [6, 40],
    tolerableTemp: [20, 28],
    tolerablePH: [6.0, 7.5],
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
    tolerableCO2: [10, 40], // Stalls without CO2 — high-tech species
    tolerableTemp: [20, 28],
    tolerablePH: [6.0, 7.5],
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
    tolerableCO2: [10, 40], // Same — needs CO2 to thrive
    tolerableTemp: [20, 28],
    tolerablePH: [6.0, 7.5],
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
 * ties the two readings of the band together, since the lower bound is where
 * damage starts and also where the plant already runs at 76 % of its rate.
 */
export function getSaturationIrradiance(species: PlantSpecies, config: PlantsConfig): number {
  return config.saturationIrradianceFactor * PLANT_SPECIES_DATA[species].tolerableLight[0];
}
