import type { PlantsConfig } from '../config/plants.js';
import { parHoursToDli } from '../equipment/light.js';

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
 * How a species builds one unit — a carpet patch, a rosette specimen, a rhizome
 * clump. `Plant.size` is how full that unit is, so the form fixes what size 100
 * means: how tall it stands, how much floor it claims and how much leaf it
 * carries over it. It also names what a full bank buys — a runner, a plantlet,
 * a rhizome branch — though every form buys it the same way.
 */
export type GrowthForm = 'carpet' | 'rosette' | 'attached';

export interface GrowthFormData {
  heightCm: number;
  /** Height runs as size^heightExponent: 0 grows across, ⅓ grows isometrically. */
  heightExponent: number;
  footprintCm2: number;
  leafAreaIndex: number;
  offshootVerb: string;
}

/**
 * One full unit of each form. Heights are the care-sheet ones — monte carlo
 * 2–5 cm, amazon sword 30–50, java fern and anubias 15–30. A carpet cup covers
 * about 10 × 10 cm, a sword is given 30 cm across, and an epiphyte clump takes
 * a hand's width of rock. Leaf area index is leaf over footprint: herb mats run
 * 2–4, a sword is some 25 leaves of 55 cm² over its 700, a fern clump a dozen
 * fronds of 40 cm² over its 200.
 */
export const GROWTH_FORMS: Record<GrowthForm, GrowthFormData> = {
  carpet: { heightCm: 5, heightExponent: 0, footprintCm2: 100, leafAreaIndex: 2.5, offshootVerb: 'sent a runner' },
  rosette: { heightCm: 40, heightExponent: 1 / 3, footprintCm2: 700, leafAreaIndex: 2.0, offshootVerb: 'threw a plantlet' },
  attached: { heightCm: 20, heightExponent: 1 / 3, footprintCm2: 200, leafAreaIndex: 2.5, offshootVerb: 'branched at the rhizome' },
};

/**
 * Nutrient demand tier. Scales both a plant's uptake and its half-saturation,
 * per nutrient.
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
  /** Nutrient demand tier */
  nutrientDemand: NutrientDemand;
  /** How one unit of the species is built — see {@link GROWTH_FORMS}. */
  growthForm: GrowthForm;
  /**
   * Hardiness 0–1. Scales most stressors by `1 − hardiness` and carries the
   * nitrate edge out — higher = species tolerates poor conditions better.
   * Anubias / Java Fern sit around 0.7 (forgiving), high-tech carpet species
   * at 0.3 (fussy).
   */
  hardiness: number;
  /**
   * Tolerable PAR range (µmol/m²/s) on the plant's own leaves, as care sheets
   * quote it for a {@link CARE_SHEET_PHOTOPERIOD}-hour day. The low end held
   * that long is the daily light the species starves under (see
   * {@link dailyLightEdge}); past the high end the light-excessive stressor
   * burns the top of its crown while the lamps are on. The hobby's published
   * tiers are low 15-30, medium 30-50, high 50-80+.
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
    growthForm: 'attached',
    co2Requirement: 'low',
    growthRate: 0.5,
    substrateRequirement: 'none', // Attaches to hardscape
    nutrientDemand: 'low', // Can survive on fish waste alone
    hardiness: 0.7, // Forgiving — survives most beginner setups
    // Alive at 10 PAR — below anything the hobby calls low light — and
    // bleaches past 90, which takes the brightest fixture in the catalog.
    tolerableLight: [10, 90],
    tolerableTemp: [18, 30],
    tolerablePH: [5.0, 8.0],
    tolerableGH: [1, 20],
  },
  anubias: {
    name: 'Anubias',
    growthForm: 'attached',
    co2Requirement: 'low',
    growthRate: 0.3,
    substrateRequirement: 'none', // Attaches to hardscape
    nutrientDemand: 'low', // Can survive on fish waste alone
    hardiness: 0.75, // Hardiest of the bunch — bombproof
    // Deepest-shade tolerance of the five — 8 PAR is the understory of a
    // stocked scape. Its thick slow leaves scorch past 70.
    tolerableLight: [8, 70],
    tolerableTemp: [18, 30],
    tolerablePH: [5.0, 8.0],
    tolerableGH: [1, 20],
  },
  amazon_sword: {
    name: 'Amazon Sword',
    growthForm: 'rosette',
    co2Requirement: 'medium',
    growthRate: 1.0,
    substrateRequirement: 'sand',
    nutrientDemand: 'medium', // Benefits from dosing
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
    growthForm: 'carpet',
    co2Requirement: 'high',
    growthRate: 1.5,
    substrateRequirement: 'aqua_soil',
    nutrientDemand: 'high', // Requires regular dosing
    hardiness: 0.3, // Fussy — needs everything dialled in
    // High-light carpet — it wants 25 PAR on its leaves, and tolerates the
    // 200 PAR a high-tech scape runs.
    tolerableLight: [25, 200],
    tolerableTemp: [20, 28],
    tolerablePH: [5.0, 7.8],
    tolerableGH: [1, 18],
  },
  monte_carlo: {
    name: 'Monte Carlo',
    growthForm: 'carpet',
    co2Requirement: 'high',
    growthRate: 1.8,
    substrateRequirement: 'aqua_soil',
    nutrientDemand: 'high', // Requires regular dosing
    hardiness: 0.3, // Fussy — same band as hairgrass
    // Hungrier for light than hairgrass — 30 PAR on its leaves is the usual
    // advice for a carpet that actually carpets.
    tolerableLight: [30, 200],
    tolerableTemp: [20, 28],
    tolerablePH: [5.0, 7.8],
    tolerableGH: [1, 15],
  },
};

export function growthFormOf(species: PlantSpecies): GrowthFormData {
  return GROWTH_FORMS[PLANT_SPECIES_DATA[species].growthForm];
}

/** Hours a day the care-sheet PAR bands assume the lamps are on. */
export const CARE_SHEET_PHOTOPERIOD = 8;

/**
 * Daily light integral (mol/m²/d) under which a species starves: the low end
 * of its PAR band held for a care-sheet photoperiod.
 */
export function dailyLightEdge(species: PlantSpecies): number {
  return parHoursToDli(PLANT_SPECIES_DATA[species].tolerableLight[0], CARE_SHEET_PHOTOPERIOD);
}

/**
 * The PAR a species stops answering more of — `Ik` of the Jassby–Platt curve
 * its photosynthesis and benefits run on.
 *
 * Derived from the band rather than declared, at `saturationIrradianceFactor ×
 * tolerableLight[0]`: anubias 16, java fern 20, amazon sword 40, dwarf
 * hairgrass 50, monte carlo 60. That is inside the published macrophyte range —
 * shade species saturate at 10–30 µmol/m²/s, sun species at 50–150 — and it
 * makes a species' saturating irradiance a fixed multiple of where its daily
 * light edge sits. At the shipped factor a plant at its lower bound runs at
 * 46 % of its rate.
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
