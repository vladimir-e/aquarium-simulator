/**
 * The flora law — what a plant and a bloom share, written over the traits both
 * are described in: the light they saturate and starve at, the pace their
 * tissue runs at, how fast they heal, how the bank draws toward growth, what
 * low condition sheds, and the vitality channels both have. Each caller adds
 * the channels only it has and hardens the list itself.
 */

import type { Resources } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { getPh } from '../core/carbonate.js';
import { lightSaturationFactor, monodFactor } from '../core/kinetics.js';
import { parHoursToDli } from '../equipment/light.js';
import { getRespirationTemperatureFactor } from './respiration.js';
import { bandComfort, outsideBand, shortfall, type VitalityFactor } from './vitality.js';

/** Hours a day the care-sheet PAR bands assume the lamps are on. */
export const CARE_SHEET_PHOTOPERIOD = 8;

/** What a plant species and a bloom are both written in. */
export interface FloraTraits {
  /** Relative growth rate: what a bank point buys, and how fast the bank heals. */
  growthRate: number;
  /** How many times faster than a leaf its tissue fixes, respires and starves. */
  pace: number;
  /** PAR at the low end of its band. */
  lowLight: number;
  tolerableTemp: readonly [number, number];
  tolerablePH: readonly [number, number];
}

/**
 * The PAR it stops answering more of — `Ik` of the Jassby–Platt curve its
 * photosynthesis and income run on: `saturationIrradianceFactor × lowLight`.
 */
export function saturationIrradiance(traits: FloraTraits, config: PlantsConfig): number {
  return config.saturationIrradianceFactor * traits.lowLight;
}

/**
 * Daily light integral (mol/m²/d) under which it starves: the low end of its
 * PAR band held for a care-sheet photoperiod.
 */
export function dailyLightEdge(traits: FloraTraits): number {
  return parHoursToDli(traits.lowLight, CARE_SHEET_PHOTOPERIOD);
}

/** Rate its bank heals condition below 100 at, per hour: it repairs at the pace it grows. */
export function floraHealingRate(traits: FloraTraits, config: PlantsConfig): number {
  return traits.growthRate * config.healingDrawRate;
}

/** Share of the draw it can still turn into growth: 1 empty, none at a full 100. */
export function growthTaper(fill: number): number {
  return 1 - fill / 100;
}

/** Bank points drawn toward growth this hour: `growthDrawRate` of the bank, through the taper. */
export function bankDraw(surplus: number, fill: number, config: PlantsConfig): number {
  return Math.max(0, surplus) * config.growthDrawRate * growthTaper(fill);
}

/** Growth one bank point buys: a plant's size in points, a bloom's mass in percent e-folds. */
export function bankConversion(traits: FloraTraits, config: PlantsConfig): number {
  return traits.growthRate * config.sizePerSurplus;
}

/** Grams of organic matter in a rate unit of tissue, a leaf's or a bloom's. */
export function tissuePerRateUnit(config: PlantsConfig): number {
  return 100 * config.tissuePerSize;
}

/** Rate units its metabolism runs at: the rate units its tissue is, at its pace. */
export function metabolicRateUnits(tissueRateUnits: number, traits: FloraTraits): number {
  return tissueRateUnits * traits.pace;
}

/** Share of itself it sheds in an hour at this condition: the square of its deficit, at `maxSheddingRate`. */
export function shedShare(condition: number, config: PlantsConfig): number {
  const deficit = Math.max(0, Math.min(1, 1 - condition / 100));
  return config.maxSheddingRate * deficit * deficit;
}

/** The organism after the hour's losses — none where condition 0 killed it — and the grams of waste each loss left. */
export interface FloraLoss<T> {
  survivor: T | null;
  shed: number;
  died: number;
}

/**
 * Low condition sheds its `shedShare` of the stand — a plant's size, a
 * bloom's mass — and condition 0 kills what is left, bank and all. `grams`
 * weighs an amount of the stand.
 */
export function loseFlora<K extends string, T extends { condition: number } & Record<K, number>>(
  organism: T,
  stand: K,
  grams: (amount: number) => number,
  config: PlantsConfig
): FloraLoss<T> {
  const lost = shedShare(organism.condition, config) * organism[stand];
  const left = organism[stand] - lost;
  const shed = grams(lost);
  if (organism.condition > 0) return { survivor: { ...organism, [stand]: left }, shed, died: 0 };
  return { survivor: null, shed, died: grams(left) };
}

/** One feeder's hour, as the channels a plant and a bloom share read it. */
export interface FloraHour {
  traits: FloraTraits;
  resources: Resources;
  plantsConfig: PlantsConfig;
  /** PAR on its mean leaf, and the day's light there. */
  light: { par: number; dailyLight: number };
  /** Liebig sufficiency, 0–1. */
  nutrientSufficiency: number;
  /** Dissolved CO₂ (mg/L) it fixes at half rate on. */
  co2HalfSaturation: number;
  /** Scales everything it earns by `1 + vigour`. */
  vigour: number;
}

function lightResponse({ traits, plantsConfig, light }: FloraHour): number {
  return lightSaturationFactor(light.par, saturationIrradiance(traits, plantsConfig));
}

/**
 * The harms both have, unhardened. Starvation reads the day it has had, so a
 * scheduled night costs nothing; its cost is respiration's, so it runs on
 * respiration's Q10 and at the feeder's pace. Nutrient demand rides the light
 * curve, as income does: a feeder in the dark asks for nothing.
 */
export function floraStressors(hour: FloraHour): VitalityFactor[] {
  const { traits, resources, plantsConfig, nutrientSufficiency, light } = hour;
  return [
    {
      key: 'lightStarvation',
      label: 'Light starvation',
      amount:
        plantsConfig.lightStarvationSeverity *
        traits.pace *
        shortfall(light.dailyLight, dailyLightEdge(traits)) *
        getRespirationTemperatureFactor(resources.temperature, plantsConfig),
    },
    {
      key: 'temperature',
      label: 'Temperature',
      amount: plantsConfig.temperatureStressSeverity * outsideBand(resources.temperature, traits.tolerableTemp),
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
        lightResponse(hour) *
        plantsConfig.nutrientDeficiencySeverity *
        shortfall(nutrientSufficiency, plantsConfig.sufficiencyEdge),
    },
  ];
}

/**
 * Income, every channel realised through photosynthesis and so run on its
 * drive: the light term times the Liebig sufficiency, times vigour.
 */
export function floraBenefits(hour: FloraHour): VitalityFactor[] {
  const { traits, resources, plantsConfig, nutrientSufficiency, co2HalfSaturation, vigour } = hour;
  const earning = lightResponse(hour) * nutrientSufficiency * (1 + vigour);
  return [
    {
      key: 'co2',
      label: 'CO₂',
      amount: earning * plantsConfig.co2BenefitPeak * monodFactor(resources.co2, co2HalfSaturation),
    },
    {
      key: 'temperature',
      label: 'Temperature',
      amount: earning * plantsConfig.temperatureBenefitPeak * bandComfort(resources.temperature, traits.tolerableTemp),
    },
    {
      key: 'ph',
      label: 'pH',
      amount: earning * plantsConfig.phBenefitPeak * bandComfort(getPh(resources), traits.tolerablePH),
    },
  ];
}
