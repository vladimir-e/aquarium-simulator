/**
 * The flora law — what a plant and a bloom share, written over the traits both
 * are described in: the light they saturate at, the pace their tissue lives
 * at, what low condition sheds, and the vitality channels both have. Each
 * caller adds the channels only it has and hardens the list itself.
 */

import type { Resources } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { getPh } from '../core/carbonate.js';
import { monodFactor, q10Factor } from '../core/kinetics.js';
import { parHoursToDli } from '../equipment/light.js';
import { NO_ORGANICS, type Organics } from '../core/organics.js';
import {
  droopFactor,
  fullDroopFactor,
  remains,
  shed,
  type FloraFluxes,
  type FloraParams,
  type FloraState,
} from './flora-budget.js';
import { starvation, wellFed } from './reserve.js';
import { bandComfort, outsideBand, shortfall, type VitalityFactor } from './vitality.js';

/** Hours a day the care-sheet PAR bands assume the lamps are on. */
export const CARE_SHEET_PHOTOPERIOD = 8;

/** What a plant species and a bloom are both written in. */
export interface FloraTraits {
  /** Relative growth rate: the pace its tissue fixes and respires at, against a leaf at 1. */
  growthRate: number;
  /** PAR at the low end of its band. */
  lowLight: number;
  tolerableTemp: readonly [number, number];
  tolerablePH: readonly [number, number];
}

/**
 * Grams of organic matter in a rate unit of tissue, 500 cm² of leaf with the
 * stem, rhizome and root that carry it. Submergence drives leaf mass per area
 * down hardest of anything (Poorter et al. 2009, New Phytol. 182:565), to 2.8
 * and 3.9 g/m² in the thinnest hydrophytes (Gerber & Les 1994, Am. J. Bot.
 * 81:973; Neundorfer & Kemp 1993, MEPS 94:71). The roster's leathery,
 * amphibious leaves run far heavier, and 3 g to the rate unit — 60 g/m² of
 * leaf, whole plant — is Tune's within that span.
 */
export const TISSUE_PER_RATE_UNIT = 3;

/**
 * The PAR it stops answering more of — `Ik` of the Jassby–Platt curve its
 * photosynthesis runs on: `saturationIrradianceFactor × lowLight`.
 */
export function saturationIrradiance(traits: FloraTraits, plantsConfig: PlantsConfig): number {
  return plantsConfig.saturationIrradianceFactor * traits.lowLight;
}

/**
 * Daily light integral (mol/m²/d) at the low end of its PAR band held for a
 * care-sheet photoperiod: the day it is rated to live on.
 */
export function dailyLightEdge(traits: FloraTraits): number {
  return parHoursToDli(traits.lowLight, CARE_SHEET_PHOTOPERIOD);
}

/**
 * τ, the pace its tissue lives at: every rate of its budget — what it
 * assimilates, mobilises and owes, and what its stores take up — runs on this
 * Q10 off the reference temperature.
 */
export function floraPace(temperature: number, plantsConfig: PlantsConfig): number {
  return q10Factor(temperature, plantsConfig.paceQ10, plantsConfig.paceReferenceTemp);
}

/** Share of its growth room left: 1 empty, none at a full 100 or past it. */
export function growthTaper(fill: number): number {
  return Math.max(0, 1 - fill / 100);
}

/** Rate units its metabolism runs at: the rate units its tissue is, at its growth rate. */
export function metabolicRateUnits(tissueRateUnits: number, traits: FloraTraits): number {
  return tissueRateUnits * traits.growthRate;
}

/** Share of itself it sheds in an hour at this condition: the square of its deficit, at `maxSheddingRate`. */
export function shedShare(condition: number, plantsConfig: PlantsConfig): number {
  const deficit = Math.max(0, Math.min(1, 1 - condition / 100));
  return plantsConfig.maxSheddingRate * deficit * deficit;
}

/** A flora after the hour's losses, and what each loss left. */
export interface FloraLoss {
  /** Its budget, null where condition 0 killed it. */
  survivor: FloraState | null;
  shed: Organics;
  /** Its remains, where it died. */
  died: Organics;
}

/** Low condition sheds its `shedShare` of the structure, and condition 0 kills what is left. */
export function loseFlora(state: FloraState, p: FloraParams, condition: number, plantsConfig: PlantsConfig): FloraLoss {
  const shedding = shed(state, p, shedShare(condition, plantsConfig) * state.structure);
  if (condition > 0) return { survivor: shedding.state, shed: shedding.waste, died: NO_ORGANICS };
  return { survivor: null, shed: shedding.waste, died: remains(shedding.state, p) };
}

/** One feeder's hour, as the channels a plant and a bloom share read it. */
export interface FloraVitalityInput {
  traits: FloraTraits;
  resources: Resources;
  plantsConfig: PlantsConfig;
  /** Its reserve density as the hour starts, 0–1. */
  wellFed: number;
  /** Its stores' Droop limit as the hour starts, 0–1. */
  droop: number;
  /** The Droop limit its full stores reach, 0–1. */
  fullDroop: number;
  /** Share of its upkeep the hour's budget left unpaid. */
  starvation: number;
  /** Dissolved CO₂ (mg/L) it fixes at half rate on. */
  co2HalfSaturation: number;
}

/** Its vitality input off its budget as the hour found it and what the hour's budget did. */
export function floraVitalityInput(
  budget: FloraState,
  p: FloraParams,
  fluxes: FloraFluxes,
  reads: Pick<FloraVitalityInput, 'traits' | 'resources' | 'plantsConfig' | 'co2HalfSaturation'>
): FloraVitalityInput {
  return {
    ...reads,
    wellFed: wellFed(budget, p),
    droop: droopFactor(budget, p),
    fullDroop: fullDroopFactor(p),
    starvation: starvation({ fluxes }),
  };
}

/** The harms both have, unhardened. */
export function floraStressors(input: FloraVitalityInput): VitalityFactor[] {
  const { traits, resources, plantsConfig, droop, fullDroop, starvation } = input;
  return [
    { key: 'starvation', label: 'Starvation', amount: plantsConfig.starvationSeverity * starvation },
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
      amount: plantsConfig.nutrientDeficiencySeverity * shortfall(droop, plantsConfig.droopEdge * fullDroop),
    },
  ];
}

/** Income, every channel earned on its reserve density and its stores' share of the Droop limit full stores reach. */
export function floraBenefits(input: FloraVitalityInput): VitalityFactor[] {
  const { traits, resources, plantsConfig, wellFed, droop, fullDroop, co2HalfSaturation } = input;
  const earning = (wellFed * droop) / fullDroop;
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
