/**
 * Algae vitality — a bloom through the flora law (`flora.ts`), on the plants'
 * constants and its kind's own traits, read off its budget.
 */

import type { AlgaeState, Resources } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import type { AlgaeTraits } from '../algae/traits.js';
import type { FloraFluxes, FloraParams } from './flora-budget.js';
import { droopFactor, fullDroopFactor } from './flora-budget.js';
import { pointsHealed, starvation, wellFed } from './reserve.js';
import { floraBenefits, floraStressors, type FloraHour } from './flora.js';
import { computeVitality, hardened, type VitalityFactor, type VitalityResult } from './vitality.js';

export interface AlgaeVitalityContext {
  /** The bloom as the hour found it. */
  bloom: AlgaeState;
  /** What its budget did over the hour. */
  fluxes: FloraFluxes;
  traits: AlgaeTraits;
  params: FloraParams;
  resources: Resources;
  plantsConfig: PlantsConfig;
}

function floraHour({ bloom, fluxes, traits, params, resources, plantsConfig }: AlgaeVitalityContext): FloraHour {
  return {
    traits,
    resources,
    plantsConfig,
    wellFed: wellFed(bloom.budget, params),
    droop: droopFactor(bloom.budget, params),
    fullDroop: fullDroopFactor(params),
    starvation: starvation({ fluxes }),
    co2HalfSaturation: traits.co2HalfSaturation,
  };
}

export function buildAlgaeStressors(ctx: AlgaeVitalityContext): VitalityFactor[] {
  return hardened(floraStressors(floraHour(ctx)), ctx.traits.hardiness);
}

export function buildAlgaeBenefits(ctx: AlgaeVitalityContext): VitalityFactor[] {
  return floraBenefits(floraHour(ctx));
}

export function computeAlgaeVitality(ctx: AlgaeVitalityContext): VitalityResult {
  return computeVitality({
    stressors: buildAlgaeStressors(ctx),
    benefits: buildAlgaeBenefits(ctx),
    condition: ctx.bloom.condition,
    healed: pointsHealed(ctx.fluxes.burned.healing, ctx.bloom.budget, ctx.params, ctx.plantsConfig),
  });
}
