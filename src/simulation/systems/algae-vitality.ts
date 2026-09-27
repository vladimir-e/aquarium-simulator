/**
 * Algae vitality — the bloom through the flora law (`flora.ts`), on the
 * plants' constants and the bloom's own traits, read at the column's mean PAR,
 * plus the one harm only a bloom takes: what thriving plants do to it.
 */

import type { AlgaeState, Plant, Resources } from '../state.js';
import type { AlgaeConfig } from '../config/algae.js';
import type { PlantsConfig } from '../config/plants.js';
import { bloomPace, type AlgaeTraits } from '../algae/traits.js';
import type { BloomLight } from '../algae/light.js';
import { floraBenefits, floraHealingRate, floraStressors, type FloraHour } from './flora.js';
import { getPlantPower } from './plant-power.js';
import { computeVitality, hardened, type VitalityFactor, type VitalityResult } from './vitality.js';

export interface AlgaeVitalityContext {
  bloom: AlgaeState;
  traits: AlgaeTraits;
  resources: Resources;
  /** The planting as the hour starts: its thriving leaf is what harms the bloom. */
  plants: readonly Plant[];
  /** Litres of the bloom's habitat. */
  litres: number;
  plantsConfig: PlantsConfig;
  algaeConfig: AlgaeConfig;
  /** Liebig sufficiency on the water column, 0–1. */
  nutrientSufficiency: number;
  light: BloomLight;
}

function floraHour({ traits, resources, plantsConfig, nutrientSufficiency, light }: AlgaeVitalityContext): FloraHour {
  return {
    traits,
    resources,
    plantsConfig,
    light,
    nutrientSufficiency,
    co2HalfSaturation: traits.co2HalfSaturation,
    vigour: 0,
    pace: bloomPace(traits),
  };
}

/** Rate units of thriving plant per litre of habitat. */
export function thrivingPlantDensity(plants: readonly Plant[], litres: number): number {
  return litres > 0 ? getPlantPower(plants) / litres : 0;
}

export function buildAlgaeStressors(ctx: AlgaeVitalityContext): VitalityFactor[] {
  return hardened(
    [
      ...floraStressors(floraHour(ctx)),
      {
        key: 'allelopathy',
        label: 'Plants',
        amount: ctx.algaeConfig.allelopathySeverity * thrivingPlantDensity(ctx.plants, ctx.litres),
      },
    ],
    ctx.traits.hardiness
  );
}

export function buildAlgaeBenefits(ctx: AlgaeVitalityContext): VitalityFactor[] {
  return floraBenefits(floraHour(ctx));
}

export function computeAlgaeVitality(ctx: AlgaeVitalityContext): VitalityResult {
  return computeVitality({
    stressors: buildAlgaeStressors(ctx),
    benefits: buildAlgaeBenefits(ctx),
    condition: ctx.bloom.condition,
    surplus: ctx.bloom.surplus,
    surplusCap: ctx.plantsConfig.surplusCap,
    healingRate: floraHealingRate(ctx.traits, ctx.plantsConfig),
  });
}
