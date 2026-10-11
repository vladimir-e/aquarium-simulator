/**
 * Livestock system tunable configuration. A fish's energy budget comes from
 * its species' Add-my-Pet entry; these are what the tank does with it.
 *
 * Calibration targets:
 * - Feeding: a full gut clears in about a day at 25 °C, slower cold
 * - Health: per-factor benefits sum to ≈ 0.7 %/h well fed in ideal
 *   conditions, ≈ 0.9 with a saturating planting; reserve density scales them all
 * - Death: health reaching 0, or old age when a fish's survival falls under
 *   the threshold it drew at creation.
 */

import { N_TO_NH3_MASS_RATIO, N_TO_NO3_MASS_RATIO } from '../core/chemistry.js';
import type { VectorMeta } from './nutrients.js';

/** What a fish loads from the water: free NH₃, nitrite as NO₂⁻ and nitrate as NO₃⁻. */
export const TOXINS = ['ammonia', 'nitrite', 'nitrate'] as const;

export type Toxin = (typeof TOXINS)[number];

export type ToxinVector = Record<Toxin, number>;

export function mapToxins(value: (t: Toxin) => number): ToxinVector {
  return Object.fromEntries(TOXINS.map((t) => [t, value(t)])) as ToxinVector;
}

export const ZERO_TOXINS: Readonly<ToxinVector> = Object.freeze(mapToxins(() => 0));

export interface LivestockConfig {
  // Feeding
  /** First-order rate, per hour, a gut digests at 20 °C; the species' τ paces it. */
  digestionRate: number;

  // Metabolism
  /** Dissolved O2 (mg/L) at which a fish's oxygen pace ω is half what saturated water gives. */
  oxygenHalfSaturation: number;
  /**
   * Fraction of digested food mass that is nitrogen (g N / g food).
   *
   * Typical aquarium flake/pellet food is 35–50 % protein, protein is
   * ≈16 % N by mass, giving 5.6–8 % N in food. 0.05 is a conservative
   * floor. Waste is food that went uneaten or undigested, and a fish is made
   * of what it ate, so both carry the same fraction.
   */
  foodNitrogenFraction: number;
  /** mg of O2 a gram of organics a fish burns takes. */
  oxygenPerGramBurned: number;
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

  /** Water below this % of capacity activates the stressor. */
  waterLevelStressThreshold: number;
  /** Damage, %/h before hardiness, at a maintenance left wholly unpaid. */
  starvationSeverity: number;
  /** Damage, %/h, per unit of DEB hazard (per hour): what age does to health. */
  hazardSeverity: number;

  // Toxicokinetics
  /** Dominant rate constant, per hour at 20 °C, a fish of 1 cm structural length loads and clears each toxin at. */
  loadRate: ToxinVector;
  /** How hard a fish's load, in e-folds past its own edges summed, cuts its assimilation ceiling. */
  loadAssimilationSeverity: number;

  // Vitality benefit peaks (%/h) — each earned in full only on a full
  // reserve. Sum at all-good (no plants) ≈ 0.7 %/h; with saturated
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

  // Repair
  /** First-order rate, per hour at 20 °C, a fish repairs its health deficit at, paid from reserve. */
  healingRate: number;
  /** Hours of somatic maintenance one point of repair costs. */
  healingCost: number;

  // Broods
  /** First-order rate, per hour at 20 °C, a male burns the brood buffer he has not spent fathering, on courtship and gametes. */
  maleBufferTurnover: number;

  // Clutches
  /** How many times harder the water harms a laid egg than a fish; an egg's harm is the share of the clutch lost an hour. */
  eggSensitivity: number;
  /** Share of a clutch's eggs an hour one gram of fish per litre finds, before the clutch's exposure. */
  eggPredationRate: number;

  // Predation
  /** Damage an hour, before hardiness, that one gram per litre of predator mass does a fish at no size at all. */
  predationRate: number;
  /** How steeply a fish outgrows its predators: vulnerability is `(1 − size / 100)` to this power. */
  preyVulnerabilityExponent: number;
}

export const livestockDefaults: LivestockConfig = {
  // Half a gut digests in about 7 h at 25 °C and 95 % in 30 h; ten degrees
  // colder roughly halves the pace.
  digestionRate: 0.07,

  // A fish regulates its uptake until the water falls past its critical oxygen
  // tension, which for warm-water teleosts sits around 1–2 mg/L; half its
  // saturated pace at 1.0 puts the taper across that band.
  oxygenHalfSaturation: 1.0,
  // 5 % N in food — conservative; typical flake is 6–8 % N.
  foodNitrogenFraction: 0.05,
  // Burning AmP's reserve, CH1.8O0.5N0.15 at 23.9 g/mol, to CO2, water and
  // ammonia takes 1.09 mol O2 a C-mole.
  oxygenPerGramBurned: 1450,
  respiratoryQuotient: 0.8, // textbook mixed-diet value

  // Stressor severities
  // Per °C outside the species' temperatureRange, scaled by (1 − hardiness).
  // A betta (hardiness 0.6) 1 °C under its range pays 0.34 %/h, inside what a
  // fed fish earns; 4 °C under, 1.4 %/h, twice the whole benefit budget.
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

  waterLevelStressThreshold: 50, // % capacity — below this water level damages fish
  // A mid-hardiness fish whose upkeep goes wholly unpaid loses 0.25 %/h,
  // seventeen days from full health.
  starvationSeverity: 0.5,
  // Hazard at the species lifespan runs 2–9 × 10⁻⁵ /h, so 0.1–0.5 %/h there.
  hazardSeverity: 5000,

  loadRate: {
    ammonia: 0.015, // half-time ~2 d at 1 cm: NH₃ crosses the gill in hours, repair sets it; 96 h LC50 well under the 24 h one
    nitrite: 0.03, // half-time ~1 d at 1 cm: methaemoglobin's turnover sets it; 96 h LC50 under 24 h
    nitrate: 0.004, // half-time ~1 wk at 1 cm: the gill barely passes it; acute LC50 thousands of ppm, chronic tens over weeks
  },
  // At one e-fold past the edge a fish eats a third less; build-first, Tune settles it.
  loadAssimilationSeverity: 0.5,

  // Benefit peaks (%/h), each scaled by reserve density. Sum at all-good in a
  // bare tank, pH at its band centre: pH 0.4 + O2 0.3 = 0.7 %/h. With a
  // saturating planting (see `plantBenefitSaturationPoint`): +0.2 → 0.9 %/h.
  phBenefitPeak: 0.4,
  oxygenBenefitPeak: 0.3,
  plantBenefitPeak: 0.2,
  plantBenefitSaturationPoint: 3.0,

  // A fish closes half a percent of its deficit an hour at 20 °C, so water
  // at its LC50 still kills it, in about a week; a full 100-point repair
  // costs it two days of upkeep.
  healingRate: 0.005,
  healingCost: 0.5,

  // A male holds about a week of the buffer he fills: enough to father a
  // livebearer's month-long brood at a fifth of its cost.
  maleBufferTurnover: 0.006,

  // Water at a fish's 96-hour LC50 costs a clutch about 5 %/h — most of a
  // neon clutch before it hatches — while the adults ride it out.
  eggSensitivity: 3,
  // A grown neon pair in 30 gal finds an eighth of an open clutch an hour, so
  // one egg in twenty-five hatches — three of an 80-egg spawn — and every fry
  // already swimming finds more.
  eggPredationRate: 15,
  // The same pair costs a newborn neon 0.45 %/h and a grown guppy pair a
  // newborn guppy 0.35 %/h, about half what a fed fry earns: a fed fry
  // outlasts it, a hungry one does not, and every fry that grows joins the
  // hunt.
  predationRate: 100,
  preyVulnerabilityExponent: 4,
};

/** mg of NH₃ a gram of food yields once mineralized. */
export function ammoniaPerGramOfFood(config: LivestockConfig): number {
  return config.foodNitrogenFraction * N_TO_NH3_MASS_RATIO * 1000;
}

/** mg of NO₃ the same gram's nitrogen makes once it is nitrate. */
export function nitratePerGramOfFood(config: LivestockConfig): number {
  return config.foodNitrogenFraction * N_TO_NO3_MASS_RATIO * 1000;
}

export interface LivestockConfigMeta {
  key: keyof LivestockConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const loadRateMeta: VectorMeta<Toxin>[] = [
  { key: 'ammonia', label: 'Free NH3 load rate', unit: '/hr at 1 cm, 20 °C', min: 0.0001, max: 1, step: 0.0001 },
  { key: 'nitrite', label: 'Nitrite load rate', unit: '/hr at 1 cm, 20 °C', min: 0.0001, max: 1, step: 0.0001 },
  { key: 'nitrate', label: 'Nitrate load rate', unit: '/hr at 1 cm, 20 °C', min: 0.0001, max: 1, step: 0.0001 },
];

export const livestockConfigMeta: LivestockConfigMeta[] = [
  // Feeding
  { key: 'digestionRate', label: 'Digestion Rate', unit: '/hr at 20 °C', min: 0.01, max: 1, step: 0.01 },
  // Metabolism
  { key: 'oxygenHalfSaturation', label: 'O2 Pace Half-Saturation', unit: 'mg/L', min: 0.1, max: 4, step: 0.1 },
  {
    key: 'foodNitrogenFraction',
    label: 'Food N Fraction',
    unit: 'g N/g food',
    min: 0.03,
    max: 0.12,
    step: 0.005,
  },
  { key: 'oxygenPerGramBurned', label: 'O2 per Gram Burned', unit: 'mg O2/g', min: 500, max: 2500, step: 50 },
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
  { key: 'waterLevelStressThreshold', label: 'Water Level Stress Threshold', unit: '%', min: 20, max: 80, step: 5 },
  { key: 'starvationSeverity', label: 'Starvation Severity', unit: '%/hr unpaid', min: 0, max: 5, step: 0.05 },
  { key: 'hazardSeverity', label: 'Hazard Severity', unit: '%/hr per hazard', min: 0, max: 50000, step: 500 },
  // Toxicokinetics
  { key: 'loadAssimilationSeverity', label: 'Load Assimilation Severity', unit: '/e-fold', min: 0, max: 5, step: 0.05 },
  // Vitality benefit peaks
  { key: 'phBenefitPeak', label: 'pH Benefit Peak', unit: '%/hr', min: 0, max: 1, step: 0.05 },
  { key: 'oxygenBenefitPeak', label: 'O2 Benefit Peak', unit: '%/hr', min: 0, max: 1, step: 0.05 },
  { key: 'plantBenefitPeak', label: 'Plant Benefit Peak', unit: '%/hr', min: 0, max: 1, step: 0.05 },
  { key: 'plantBenefitSaturationPoint', label: 'Plant Benefit Saturation', unit: 'power', min: 1, max: 10, step: 0.5 },
  // Repair
  { key: 'healingRate', label: 'Healing Rate', unit: '/hr at 20 °C', min: 0, max: 0.5, step: 0.005 },
  { key: 'healingCost', label: 'Healing Cost', unit: 'h upkeep/pt', min: 0.05, max: 5, step: 0.05 },
  // Broods
  { key: 'maleBufferTurnover', label: 'Male Buffer Turnover', unit: '/hr at 20 °C', min: 0, max: 0.1, step: 0.001 },
  // Clutches
  { key: 'eggSensitivity', label: 'Egg Sensitivity', unit: '× fish', min: 0, max: 10, step: 0.5 },
  { key: 'eggPredationRate', label: 'Egg Predation Rate', unit: 'L/g/hr', min: 0, max: 50, step: 0.5 },
  // Predation
  { key: 'predationRate', label: 'Predation Rate', unit: '%/hr per g/L', min: 0, max: 500, step: 5 },
  { key: 'preyVulnerabilityExponent', label: 'Prey Vulnerability Exponent', unit: '', min: 1, max: 10, step: 0.5 },
];
