import type { PlantsConfig } from '../config/plants.js';
import { parHoursToDli } from '../equipment/light.js';
import { CARE_SHEET_PHOTOPERIOD, type NutrientDemand } from '../plants/species.js';

/**
 * What a bloom is, in the terms a plant species is written in — without the
 * growth form, since a bloom has no height, footprint or offshoots.
 */
export interface AlgaeTraits {
  name: string;
  /**
   * Relative growth rate on the plants' scale: the bank's conversion into mass,
   * the healing share, and the pace its tissue photosynthesises and respires at.
   */
  growthRate: number;
  hardiness: number;
  /** PAR at the low end of its band — its daily light edge and its `Ik`, as a plant's. */
  lowLight: number;
  nutrientDemand: NutrientDemand;
  tolerableTemp: [number, number];
  tolerablePH: [number, number];
}

/**
 * Green algae. A bloom doubles in about two days: at the income a lit day
 * averages, a growth rate of 30 buys that. It saturates by 12 PAR, lives on a
 * lean water column, and takes the warm, alkaline water plants struggle in.
 */
export const ALGAE: AlgaeTraits = {
  name: 'Algae',
  growthRate: 30,
  hardiness: 0.4,
  lowLight: 6,
  nutrientDemand: 'low',
  tolerableTemp: [12, 34],
  tolerablePH: [5.5, 9.5],
};

export function algaeSaturationIrradiance(traits: AlgaeTraits, config: PlantsConfig): number {
  return config.saturationIrradianceFactor * traits.lowLight;
}

export function algaeDailyLightEdge(traits: AlgaeTraits): number {
  return parHoursToDli(traits.lowLight, CARE_SHEET_PHOTOPERIOD);
}
