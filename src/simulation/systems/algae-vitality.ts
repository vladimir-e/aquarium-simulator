/**
 * Algae vitality — a bloom through the flora law (`flora.ts`), on the plants'
 * constants and its kind's own traits, read off its budget, plus the one harm
 * only a bloom takes: what thriving plants do to it.
 */

import type { AlgaeState, Plant, Resources } from '../state.js';
import type { AlgaeConfig } from '../config/algae.js';
import type { PlantsConfig } from '../config/plants.js';
import type { AlgaeTraits } from '../algae/traits.js';
import type { FloraFluxes, FloraParams } from './flora-budget.js';
import { droopFactor } from './flora-budget.js';
import { starvation, wellFed } from './reserve.js';
import { floraBenefits, floraStressors, healingPrice, type FloraHour } from './flora.js';
import { getPlantPower } from './plant-power.js';
import { computeVitality, hardened, type VitalityFactor, type VitalityResult } from './vitality.js';

export interface AlgaeVitalityContext {
  /** The bloom as the hour found it. */
  bloom: AlgaeState;
  /** What its budget did over the hour. */
  fluxes: FloraFluxes;
  traits: AlgaeTraits;
  params: FloraParams;
  resources: Resources;
  /** The planting as the hour starts: its thriving leaf is what harms the bloom. */
  plants: readonly Plant[];
  plantsConfig: PlantsConfig;
  algaeConfig: AlgaeConfig;
}

function floraHour({ bloom, fluxes, traits, params, resources, plantsConfig }: AlgaeVitalityContext): FloraHour {
  return {
    traits,
    resources,
    plantsConfig,
    wellFed: wellFed(bloom.budget, params),
    droop: droopFactor(bloom.budget, params),
    starvation: starvation({ fluxes }),
    co2HalfSaturation: traits.co2HalfSaturation,
    vigour: 0,
  };
}

/** Rate units of thriving plant per litre of water. */
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
        amount: ctx.algaeConfig.allelopathySeverity * thrivingPlantDensity(ctx.plants, ctx.resources.water),
      },
    ],
    ctx.traits.hardiness
  );
}

export function buildAlgaeBenefits(ctx: AlgaeVitalityContext): VitalityFactor[] {
  return floraBenefits(floraHour(ctx));
}

export function computeAlgaeVitality(ctx: AlgaeVitalityContext): VitalityResult {
  const price = healingPrice(ctx.bloom.budget, ctx.params, ctx.plantsConfig);
  return computeVitality({
    stressors: buildAlgaeStressors(ctx),
    benefits: buildAlgaeBenefits(ctx),
    condition: ctx.bloom.condition,
    healed: price > 0 ? ctx.fluxes.burned.healing / price : 0,
  });
}
