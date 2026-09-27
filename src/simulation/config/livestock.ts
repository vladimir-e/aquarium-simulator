/**
 * Livestock system tunable configuration.
 *
 * Calibration targets:
 * - Metabolism: A 1g fish consumes ~0.01g food/hr, produces proportional waste/CO2
 * - Satiation: Decays ~0.6%/hr when unfed (stuffed to fully starving in ~7 days)
 * - Health: Per-factor benefits sum to ~1%/h in ideal conditions; degrades faster under stress
 * - Death: vitality-driven (no probabilistic check); past `maxAge` the
 *   age stressor kicks in for a smooth decline.
 */

import { MAX_SURPLUS_CAP, SURPLUS_CAP_DEFAULT } from './vitality.js';
import { MW_N, MW_NO3, N_TO_NH3_MASS_RATIO } from '../core/chemistry.js';

export interface LivestockConfig {
  // Metabolism
  /** Base food consumption rate per gram of fish mass per hour */
  baseFoodRate: number;
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

  // Satiation
  /**
   * Satiation decay per hour (percentage points). Fish digest and burn
   * through stored energy whether or not they're feeding; a fish at
   * satiation 100 with no food will fall to 0 in ~100 / `satiationDecayRate`
   * hours.
   */
  satiationDecayRate: number;

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

  // Satiation band edges (% on the 0–100 satiation axis) — these define
  // the boundaries between the five UI bands and the inflection points
  // of the single piecewise-linear contribution function. See
  // `satiation.ts` for the curve.
  /** Top of well-fed / bottom of overfed. Above this satiation: overfed stress. */
  satiationOverfedFloor: number;
  /** Top of peckish / bottom of well-fed. Above this satiation up to overfed: well-fed benefit. */
  satiationWellFedFloor: number;
  /** Top of hungry / bottom of peckish. Below this satiation: hunger stress. */
  satiationHungryCeiling: number;
  /** Top of starving / bottom of hungry. Below this satiation: starving stress (steeper). */
  satiationStarvingCeiling: number;

  // Satiation band peak severities (%/h, per anchor — the curve linearly
  // interpolates between them; see `satiation.ts`).
  /** Peak overfed stress at satiation = 100 (fully stuffed). */
  satiationOverfedSeverity: number;
  /** Peak well-fed benefit at the midpoint between the two well-fed band edges. */
  satiationWellFedPeak: number;
  /** Hungry stress at satiation = `satiationStarvingCeiling` (entry to starving). */
  satiationHungrySeverity: number;
  /** Starving stress at satiation = 0 (fully empty). */
  satiationStarvingSeverity: number;

  // Vitality benefit peaks (%/h) — recovery rate when each factor is
  // at its best. Sum at all-good (no plants) ≈ 1.0 %/h; with
  // saturated planting it rises to ≈ 1.2 %/h.
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
  // Metabolism - a 1g fish eats ~0.01g/hr = 0.24g/day
  baseFoodRate: 0.01,
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

  // Satiation - decays ~0.6%/hr; fish can survive 3-7 days without food.
  // From 100 (stuffed) → 50 (peckish boundary) takes ~3.5 days; → 0
  // (fully starving) takes ~7 days.
  satiationDecayRate: 0.6,

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

  // Satiation band edges (anchors of the piecewise-linear contribution).
  // 100 → 99  Overfed     (stressor)         — 1%-wide sliver
  //  99 → 75  Well fed    (benefit, peak at 87)
  //  75 → 50  Peckish     (neutral)
  //  50 → 25  Hungry      (stressor)
  //  25 →  0  Starving    (stressor, steeper)
  //
  // The narrow overfed band is intentional: under steady-state eating
  // the per-tick equilibrium sits at sat ≈ 99.4 (100 − 0.6 %/hr decay),
  // so a 99-floor band charges only ~0.4× peak overfed severity at the
  // moment after eating and drops cleanly into well-fed once the food
  // drains. A 90-floor would have charged near peak severity continuously
  // — turning the well-fed steady state into perpetual stress.
  satiationOverfedFloor: 99,
  satiationWellFedFloor: 75,
  satiationHungryCeiling: 50,
  satiationStarvingCeiling: 25,

  // Severity peaks:
  // - Overfed at 100 lands at 2.0 %/h. With the well-fed benefit
  //   already gone above the band (so the abiotic budget shrinks to
  //   pH 0.4 + O2 0.3 = 0.7 %/h), a mid-hardiness fish (factor 0.5)
  //   sees net ≈ 1.0 × 0.5 − 0.7 = −0.3 %/h — slow drift over hours,
  //   not a cliff.
  // - Well-fed peak 0.3 %/h keeps the all-good budget ≈ 1.0 %/h in a
  //   bare tank.
  // - Hungry at the bottom of its band (satiation 25) lands at 2.5 %/h
  //   (0.1 × 25) — moderately stressed.
  // - Starving at satiation 0 lands at 6.0 %/h — visibly steeper than
  //   merely hungry; the per-percent slope inside the starving band
  //   (0.14 %/%) is ~40 % steeper than the hungry slope (0.10 %/%),
  //   so survival drops sharply once a fish enters the band.
  satiationOverfedSeverity: 2.0,
  satiationWellFedPeak: 0.3,
  satiationHungrySeverity: 2.5,
  satiationStarvingSeverity: 6.0,

  // Benefit peaks (%/h) for the non-satiation channels. Sum at
  // all-good in a bare tank, pH at its band centre: pH 0.4 + well-fed 0.3 +
  // O2 0.3 = 1.0 %/h. With a saturating planting (see
  // `plantBenefitSaturationPoint`): +0.2 → 1.2 %/h.
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
  // Metabolism
  { key: 'baseFoodRate', label: 'Base Food Rate', unit: 'g/g/hr', min: 0.001, max: 0.05, step: 0.001 },
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
  // Satiation
  { key: 'satiationDecayRate', label: 'Satiation Decay', unit: '%/hr', min: 0.1, max: 5, step: 0.1 },
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
  // Satiation band edges and peak severities
  { key: 'satiationOverfedFloor', label: 'Overfed Floor', unit: '%', min: 80, max: 100, step: 1 },
  { key: 'satiationWellFedFloor', label: 'Well-fed Floor', unit: '%', min: 60, max: 90, step: 1 },
  { key: 'satiationHungryCeiling', label: 'Hungry Ceiling', unit: '%', min: 30, max: 70, step: 1 },
  { key: 'satiationStarvingCeiling', label: 'Starving Ceiling', unit: '%', min: 5, max: 40, step: 1 },
  { key: 'satiationOverfedSeverity', label: 'Overfed Severity', unit: '%/hr', min: 0, max: 5, step: 0.05 },
  { key: 'satiationWellFedPeak', label: 'Well-fed Peak', unit: '%/hr', min: 0, max: 1, step: 0.05 },
  { key: 'satiationHungrySeverity', label: 'Hungry Severity', unit: '%/hr', min: 0, max: 10, step: 0.1 },
  { key: 'satiationStarvingSeverity', label: 'Starving Severity', unit: '%/hr', min: 0, max: 20, step: 0.1 },
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
