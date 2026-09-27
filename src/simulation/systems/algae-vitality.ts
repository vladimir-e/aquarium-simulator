/**
 * Algae vitality — the bloom through the plants' vitality model, on the
 * plants' constants and the bloom's own traits.
 *
 * Income is a plant's: CO₂, temperature and pH comfort, all on the drive
 * `tanh(PAR / Ik) × sufficiency`, with the light read as the mean over the
 * water column. Harm is a plant's where a bloom has the channel — starvation
 * against its daily light edge, temperature and pH out of band, nutrient
 * deficiency on the light curve — plus what thriving plants do to it.
 *
 * Starvation's cost is respiration's, and a bloom respires at its growth rate
 * (see `bloomRateUnits`), so it starves at that rate too: a few days of dark
 * take a bloom's bank and then the bloom.
 */

import type { AlgaeState, Plant, Resources } from '../state.js';
import type { AlgaeConfig } from '../config/algae.js';
import type { PlantsConfig } from '../config/plants.js';
import {
  algaeDailyLightEdge,
  algaeSaturationIrradiance,
  type AlgaeTraits,
} from '../algae/traits.js';
import type { BloomLight } from '../algae/light.js';
import { getPh } from '../core/carbonate.js';
import { lightSaturationFactor, monodFactor } from '../core/kinetics.js';
import { getPlantPower } from './plant-power.js';
import { getRespirationTemperatureFactor } from './respiration.js';
import {
  bandComfort,
  computeVitality,
  hardened,
  outsideBand,
  shortfall,
  type VitalityFactor,
  type VitalityResult,
} from './vitality.js';

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

function lightSaturation({ traits, plantsConfig, light }: AlgaeVitalityContext): number {
  return lightSaturationFactor(light.par, algaeSaturationIrradiance(traits, plantsConfig));
}

/** Rate units of thriving plant per litre of habitat. */
export function thrivingPlantDensity(plants: readonly Plant[], litres: number): number {
  return litres > 0 ? getPlantPower(plants) / litres : 0;
}

export function buildAlgaeStressors(ctx: AlgaeVitalityContext): VitalityFactor[] {
  const { traits, resources, plants, litres, plantsConfig, algaeConfig, nutrientSufficiency, light } = ctx;

  return hardened(
    [
      {
        key: 'lightStarvation',
        label: 'Light starvation',
        amount:
          plantsConfig.lightStarvationSeverity *
          traits.growthRate *
          shortfall(light.dailyLight, algaeDailyLightEdge(traits)) *
          getRespirationTemperatureFactor(resources.temperature, plantsConfig),
      },
      {
        key: 'temperature',
        label: 'Temperature',
        amount:
          plantsConfig.temperatureStressSeverity * outsideBand(resources.temperature, traits.tolerableTemp),
      },
      {
        key: 'ph',
        label: 'pH',
        amount: plantsConfig.phStressSeverity * outsideBand(getPh(resources), traits.tolerablePH),
      },
      {
        key: 'nutrients',
        label: 'Nutrient deficiency',
        amount:
          lightSaturation(ctx) *
          plantsConfig.nutrientDeficiencySeverity *
          shortfall(nutrientSufficiency, plantsConfig.sufficiencyEdge),
      },
      {
        key: 'allelopathy',
        label: 'Plants',
        amount: algaeConfig.allelopathySeverity * thrivingPlantDensity(plants, litres),
      },
    ],
    traits.hardiness
  );
}

export function buildAlgaeBenefits(ctx: AlgaeVitalityContext): VitalityFactor[] {
  const { traits, resources, plantsConfig, algaeConfig, nutrientSufficiency } = ctx;
  const earning = lightSaturation(ctx) * nutrientSufficiency;

  return [
    {
      key: 'co2',
      label: 'CO₂',
      amount:
        earning * plantsConfig.co2BenefitPeak * monodFactor(resources.co2, algaeConfig.co2HalfSaturation),
    },
    {
      key: 'temperature',
      label: 'Temperature',
      amount:
        earning * plantsConfig.temperatureBenefitPeak * bandComfort(resources.temperature, traits.tolerableTemp),
    },
    {
      key: 'ph',
      label: 'pH',
      amount: earning * plantsConfig.phBenefitPeak * bandComfort(getPh(resources), traits.tolerablePH),
    },
  ];
}

/** Share of its bank a bloom heals from per hour, on the plants' law: it repairs at the pace it grows. */
export function algaeHealingRate(traits: AlgaeTraits, plantsConfig: PlantsConfig): number {
  return traits.growthRate * plantsConfig.healingDrawRate;
}

export function computeAlgaeVitality(ctx: AlgaeVitalityContext): VitalityResult {
  return computeVitality({
    stressors: buildAlgaeStressors(ctx),
    benefits: buildAlgaeBenefits(ctx),
    condition: ctx.bloom.condition,
    surplus: ctx.bloom.surplus,
    surplusCap: ctx.plantsConfig.surplusCap,
    healingRate: algaeHealingRate(ctx.traits, ctx.plantsConfig),
  });
}
