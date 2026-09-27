/**
 * Livestock system tunable configuration.
 *
 * Calibration targets:
 * - Feeding: a fish eats 1–3 % of its body mass a day; a full gut clears in
 *   about a day at 25 °C, slower cold
 * - Health: per-factor benefits sum to ~1 %/h at full nourishment in ideal
 *   conditions; what a fish digests scales them all
 * - Death: vitality-driven (no probabilistic check); past `maxAge` the
 *   age stressor kicks in for a smooth decline.
 */

import { MAX_SURPLUS_CAP, SURPLUS_CAP_DEFAULT } from './vitality.js';
import { MW_N, MW_NO3, N_TO_NH3_MASS_RATIO } from '../core/chemistry.js';

export interface LivestockConfig {
  // Feeding
  /** Grams of food a full gut holds, per gram of fish. */
  gutCapacity: number;
  /** First-order rate, per hour, a gut digests at the reference temperature in unlimited oxygen. */
  digestionRate: number;
  digestionQ10: number;
  digestionReferenceTemp: number;
  /**
   * Grams of food a day, per gram of fish, a fish must digest to hold its
   * condition: its income runs at half rate there, and hunger harms it below.
   */
  maintenanceRation: number;
  /** Hunger damage at an empty gut, %/h before hardiness. */
  hungerSeverity: number;

  // Metabolism
  /**
   * Base oxygen consumption rate per gram of fish mass per hour (mg O2).
   *
   * Intrinsic physiological rate — independent of tank volume. The
   * livestock pipeline converts the absolute mg/hr draw into a mg/L
   * concentration delta using the tank's water volume.
   *
   * Real-world freshwater teleosts at 25°C sit in 0.2–0.5 mg O2/g/hr,
   * scaling with Q10 ≈ 2 against temperature.
   */
  baseRespirationRate: number;
  /** Dissolved O2 (mg/L) at which a fish takes up half its base rate. */
  respirationOxygenHalfSaturation: number;
  /**
   * Fraction of ingested food mass that is nitrogen (g N / g food).
   *
   * Typical aquarium flake/pellet food is 35–50 % protein, protein is
   * ≈16 % N by mass, giving 5.6–8 % N in food. 0.05 is a conservative
   * floor. Waste is food that went uneaten or undigested, so it carries the
   * same fraction into mineralization.
   */
  foodNitrogenFraction: number;
  /**
   * Fraction of ingested food nitrogen excreted directly via the gills
   * as NH3/NH4⁺ (0–1). The remainder leaves as feces-bound N that
   * mineralizes through the waste → NH3 path.
   *
   * Aquarium fish are ammoniotelic: canonical split is ≈75–80 % gill
   * ammonia, ≈15–20 % feces, ≈5 % urine. We collapse urine into the
   * gill stream for simulation, giving a ~80 / 20 split.
   */
  gillNFraction: number;
  /**
   * Moles of CO2 exhaled per mole of O2 consumed. A *molar* ratio, as the
   * literature defines it — converting it to a mass takes the molar step
   * through `O2_TO_CO2_MASS_RATIO`.
   */
  respiratoryQuotient: number;

  // Stressor severities (damage per hour per unit deviation)
  /** Health damage per °C outside safe temperature range */
  temperatureStressSeverity: number;
  /** Health damage per pH unit outside safe range */
  phStressSeverity: number;
  /** Health damage per dGH outside safe range */
  ghStressSeverity: number;
  /** Damage per e-fold of free (unionized) NH₃ past the fish's own edge. */
  ammoniaStressSeverity: number;
  /** Damage per e-fold of nitrite past the fish's own edge. */
  nitriteStressSeverity: number;
  /** Damage per e-fold of nitrate past the fish's own edge. */
  nitrateStressSeverity: number;
  /** Damage per e-fold of dissolved oxygen under the fish's own edge, both read `OXYGEN_LOG_OFFSET` higher. */
  oxygenStressSeverity: number;
  /** Health damage per % water below 50% capacity */
  waterLevelStressSeverity: number;
  /** Health damage per turnover (tank volumes/h) above species tolerance */
  flowStressSeverity: number;
  /**
   * Health damage per hour past species `maxAge`, applied per hour: past its
   * lifespan a fish takes damage that grows with how far past it is, scaled
   * by `1 − hardiness`, until health reaches zero.
   */
  ageStressSeverity: number;

  /** Water below this % of capacity activates the stressor. */
  waterLevelStressThreshold: number;

  // Vitality benefit peaks (%/h) — each earned in full only at full
  // nourishment. Sum at all-good (no plants) ≈ 0.7 %/h; with saturated
  // planting it rises to ≈ 0.9 %/h.
  /** pH at the centre of the species range, falling to 0 at its edges. */
  phBenefitPeak: number;
  /** Oxygen, rising on log scale from `OXYGEN_EDGE` to full at `OXYGEN_COMFORT`. */
  oxygenBenefitPeak: number;
  /** Plant-presence benefit at saturation — see `plantBenefitSaturationPoint`. */
  plantBenefitPeak: number;
  /**
   * Plant-presence saturation point — plant power (`getPlantPower`: rate
   * units × condition/100, summed) at which the benefit hits its peak. Three
   * full thriving fern clumps saturate it, and a sword alone comes close;
   * beyond that adding more plants doesn't keep boosting fish vitality.
   */
  plantBenefitSaturationPoint: number;

  // Surplus
  /**
   * Ceiling on the bank. Income past full health banks up to it, and a
   * female spawns once hers is full.
   * Shared default across organism types — see `SURPLUS_CAP_DEFAULT`.
   */
  surplusCap: number;
  /**
   * Rate, per hour, a 1 g fish's bank heals health below 100 at; scaled by
   * adult mass to the −¼ power (see `fishHealingRate`).
   */
  healingDrawRate: number;

  // Death
  /** Fraction of fish mass added as waste on death */
  deathDecayFactor: number;
}

export const livestockDefaults: LivestockConfig = {
  // A fish's stomach takes a meal of about 3 % of its body mass.
  gutCapacity: 0.03,
  // Half a gut digests in about 7 h at 25 °C and 95 % in 30 h; ten degrees
  // colder doubles both.
  digestionRate: 0.1,
  digestionQ10: 2.0,
  digestionReferenceTemp: 25,
  // Half a percent of body mass a day holds a fish; the hobby's 1–3 % a day
  // feeds it past that, and the excess is what banks.
  maintenanceRation: 0.005,
  // An empty gut costs a mid-hardiness fish 0.3 %/h: unfed, a fish with an
  // empty bank lasts about two weeks and one with a full bank about three.
  hungerSeverity: 0.6,

  // 0.3 mg O2 / g fish / hr, inside the real-world 0.2–0.5 at 25°C for small
  // freshwater teleosts. Applied as absolute mg/hr and converted to mg/L by the
  // livestock pipeline using tank volume.
  baseRespirationRate: 0.3,
  // A fish regulates its uptake until the water falls past its critical oxygen
  // tension, which for warm-water teleosts sits around 1–2 mg/L; below it the
  // gills simply cannot extract what is not there and the fish conforms. Half
  // rate at 1.0 puts the taper across that band. That makes the rate above a
  // Monod maximum rather than a figure read in real water: air-saturated water
  // leaves 89 % of it, so what the model reproduces is 0.268.
  //
  // It scales the gill ammonia stream as well as the draw — deamination is the
  // same metabolism — so this one constant sets both what a roster breathes and
  // what it loads the water with.
  //
  // Damage is a separate reading: each fish's own oxygen edge still charges it
  // for the water it is in, so a suffocating fish draws less and suffers more.
  respirationOxygenHalfSaturation: 1.0,
  // 5 % N in food — conservative; typical flake is 6–8 % N.
  foodNitrogenFraction: 0.05,
  // 80 % of ingested N excreted directly through gills; 20 % via feces.
  gillNFraction: 0.8,
  respiratoryQuotient: 0.8, // textbook mixed-diet value

  // Stressor severities
  // Per °C outside the species' preferred temperatureRange, scaled by
  // (1 - hardiness). Calibrated to scenario 04 A.1: a betta (hardiness
  // 0.6, tempMin 24 °C) at 20 °C sustained should decline ~5 %/day,
  // landing in the 40–65 band after 7 days and risk dying around day
  // 21. Net per-hour damage ≈ severity × gap × (1 − hardiness) −
  // benefit budget (≈1 %/h at all-good). At severity 0.75 / 4 °C gap
  // / 0.4 factor = 1.2 %/hr stress − 1 %/hr recovery = 0.2 %/hr =
  // 4.8 %/day loss. At 1 °C below (23 °C), stress = 0.3 %/hr, net
  // +0.7 %/hr healing — matches the scenario's "sub-stress band for
  // betta, mild decline over weeks, not cliff" expectation for the
  // 23 °C failure mode.
  temperatureStressSeverity: 0.85, // %/°C/hr before hardiness scaling
  phStressSeverity: 3.0, // 3% damage per pH unit outside range per hour
  // Hardness out of range is a chronic harm, not an acute one: a guppy
  // (factor 0.2) five degrees under its range pays 0.1 %/h — felt, but
  // inside what a fed, oxygenated tank gives back, even a cold one.
  ghStressSeverity: 0.1,
  // Each puts a mid-hardiness fish at its 96-hour LC50 one %/h past what a
  // clean tank gives back, so it dies in about four days.
  ammoniaStressSeverity: 0.56, // LC50 ≈ 1 ppm free NH₃
  nitriteStressSeverity: 0.75, // LC50 ≈ 10 ppm NO₂
  nitrateStressSeverity: 1.0, // LC50 ≈ 800 ppm NO₃
  oxygenStressSeverity: 2.7, // LC50 ≈ 1.5 mg/L O₂
  waterLevelStressSeverity: 0.2, // 0.2% per % below threshold
  // 0.3 %/h per turnover above species tolerance. A 150 L on a canister
  // plus a 240 GPH powerhead runs 14×, so a neon is 4 over and pays
  // 0.61 %/h after hardiness — most of what a fed tank gives back, and
  // a roster of six is gone by day 10 unless the player pulls the
  // powerhead. The same powerhead alone in a 20 L is 45×, 5.3 %/h,
  // dead inside a day.
  flowStressSeverity: 0.3,
  // 0.05 %/h per hour past maxAge. At 24 h past, 1.2 %/h damage —
  // just exceeds the all-good benefit budget of ~1.2 %/h, so a fish
  // begins a slow decline. By a week past, 8.4 %/h — clear decline.
  ageStressSeverity: 0.05,

  waterLevelStressThreshold: 50, // % capacity — below this water level damages fish

  // Benefit peaks (%/h), each scaled by nourishment. Sum at all-good in a
  // bare tank, pH at its band centre: pH 0.4 + O2 0.3 = 0.7 %/h. With a
  // saturating planting (see `plantBenefitSaturationPoint`): +0.2 → 0.9 %/h.
  phBenefitPeak: 0.4,
  oxygenBenefitPeak: 0.3,
  plantBenefitPeak: 0.2,
  plantBenefitSaturationPoint: 3.0,

  // Bank ceiling — half the condition scale by default.
  surplusCap: SURPLUS_CAP_DEFAULT,
  // 0.05 /h at 1 g: a full bank heals a 1 g fish 2.4 %/h at first, more than
  // its whole benefit budget, and runs out with a 20 h time constant under a
  // steady insult. A neon heals at 0.06 /h, an angelfish at 0.025.
  healingDrawRate: 0.05,

  // Death
  deathDecayFactor: 0.5, // Half fish mass becomes waste
};

/** mg of NH₃ a gram of food, or of the waste it becomes, yields once mineralized. */
export function ammoniaPerGramOfFood(config: LivestockConfig): number {
  return config.foodNitrogenFraction * N_TO_NH3_MASS_RATIO * 1000;
}

/** mg of NO₃ the same gram's nitrogen makes once it is nitrate. */
export function nitratePerGramOfFood(config: LivestockConfig): number {
  return (config.foodNitrogenFraction * MW_NO3 * 1000) / MW_N;
}

export interface LivestockConfigMeta {
  key: keyof LivestockConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const livestockConfigMeta: LivestockConfigMeta[] = [
  // Feeding
  { key: 'gutCapacity', label: 'Gut Capacity', unit: 'g/g', min: 0.005, max: 0.1, step: 0.005 },
  { key: 'digestionRate', label: 'Digestion Rate', unit: '/hr', min: 0.01, max: 1, step: 0.01 },
  { key: 'digestionQ10', label: 'Digestion Q10', unit: '', min: 1, max: 4, step: 0.1 },
  { key: 'digestionReferenceTemp', label: 'Digestion Reference Temp', unit: '°C', min: 15, max: 30, step: 1 },
  { key: 'maintenanceRation', label: 'Maintenance Ration', unit: 'g/g/day', min: 0.001, max: 0.03, step: 0.001 },
  { key: 'hungerSeverity', label: 'Hunger Severity', unit: '%/hr', min: 0, max: 5, step: 0.1 },
  // Metabolism
  {
    key: 'baseRespirationRate',
    label: 'Base Respiration Rate',
    unit: 'mg O2/g/hr',
    min: 0.05,
    max: 1.0,
    step: 0.05,
  },
  {
    key: 'respirationOxygenHalfSaturation',
    label: 'Respiration O2 Half-Saturation',
    unit: 'mg/L',
    min: 0.1,
    max: 4,
    step: 0.1,
  },
  {
    key: 'foodNitrogenFraction',
    label: 'Food N Fraction',
    unit: 'g N/g food',
    min: 0.03,
    max: 0.12,
    step: 0.005,
  },
  { key: 'gillNFraction', label: 'Gill N Fraction', unit: '', min: 0.5, max: 0.95, step: 0.05 },
  { key: 'respiratoryQuotient', label: 'Respiratory Quotient', unit: '', min: 0.5, max: 1.2, step: 0.1 },
  // Stressor severities
  {
    key: 'temperatureStressSeverity',
    label: 'Temp Stress Severity',
    unit: '%/°C/hr',
    min: 0.5,
    max: 10,
    step: 0.5,
  },
  { key: 'phStressSeverity', label: 'pH Stress Severity', unit: '%/pH/hr', min: 1, max: 10, step: 0.5 },
  { key: 'ghStressSeverity', label: 'GH Stress Severity', unit: '%/dGH/hr', min: 0, max: 2, step: 0.05 },
  { key: 'ammoniaStressSeverity', label: 'Free NH3 Stress Severity', unit: '%/e-fold/hr', min: 0.1, max: 10, step: 0.1 },
  { key: 'nitriteStressSeverity', label: 'Nitrite Stress Severity', unit: '%/e-fold/hr', min: 0.1, max: 10, step: 0.1 },
  { key: 'nitrateStressSeverity', label: 'Nitrate Stress Severity', unit: '%/e-fold/hr', min: 0.1, max: 10, step: 0.1 },
  { key: 'oxygenStressSeverity', label: 'O2 Stress Severity', unit: '%/e-fold under/hr', min: 0.1, max: 10, step: 0.1 },
  {
    key: 'waterLevelStressSeverity',
    label: 'Water Level Stress',
    unit: '%/%/hr',
    min: 0.05,
    max: 1,
    step: 0.05,
  },
  {
    key: 'flowStressSeverity',
    label: 'Flow Stress Severity',
    unit: '%/turnover/hr',
    min: 0.05,
    max: 1.5,
    step: 0.05,
  },
  {
    key: 'ageStressSeverity',
    label: 'Age Stress Severity',
    unit: '%/(h past maxAge)/h',
    min: 0.01,
    max: 0.5,
    step: 0.01,
  },
  { key: 'waterLevelStressThreshold', label: 'Water Level Stress Threshold', unit: '%', min: 20, max: 80, step: 5 },
  // Vitality benefit peaks
  { key: 'phBenefitPeak', label: 'pH Benefit Peak', unit: '%/hr', min: 0, max: 1, step: 0.05 },
  { key: 'oxygenBenefitPeak', label: 'O2 Benefit Peak', unit: '%/hr', min: 0, max: 1, step: 0.05 },
  { key: 'plantBenefitPeak', label: 'Plant Benefit Peak', unit: '%/hr', min: 0, max: 1, step: 0.05 },
  { key: 'plantBenefitSaturationPoint', label: 'Plant Benefit Saturation', unit: 'power', min: 1, max: 10, step: 0.5 },
  // Surplus
  { key: 'surplusCap', label: 'Bank Cap', unit: 'pts', min: 0, max: MAX_SURPLUS_CAP, step: 5 },
  { key: 'healingDrawRate', label: 'Healing Draw Rate', unit: '/hr at 1 g', min: 0.005, max: 0.5, step: 0.005 },
  // Death
  { key: 'deathDecayFactor', label: 'Death Decay Factor', unit: '', min: 0.1, max: 1.0, step: 0.1 },
];
