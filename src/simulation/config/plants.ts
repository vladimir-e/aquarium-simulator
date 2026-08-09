/**
 * Plants system tunable configuration.
 *
 * Calibration targets:
 * - Photosynthesis: a grown-in planted 150 L runs 0.5–1.0 mg/L O2/hr by day
 * - Respiration: 5–15 % of the light-saturated rate at ambient carbon
 * - Growth: ~1-2% size increase per day at ideal conditions
 * - Nitrate consumption: ~5-10 mg/day
 */

import { SURPLUS_CAP_DEFAULT } from './vitality.js';

export interface PlantsConfig {
  // Photosynthesis constants
  /** Base photosynthesis rate per 100% plant size per hour */
  basePhotosynthesisRate: number;
  /** Optimal CO2 concentration for max photosynthesis (mg/L) */
  optimalCo2: number;
  /** Optimal nitrate concentration for max growth (ppm) */
  optimalNitrate: number;
  /**
   * Multiple of a species' `tolerableLight` lower bound at which it saturates.
   * The product is the `Ik` of the Jassby–Platt curve, in PAR: a species'
   * saturating irradiance is a fixed multiple of where its damage threshold
   * sits, so one number carries both light channels. At the shipped 2.0 a plant
   * at the bottom of its band runs at 46 % of its rate while the
   * light-insufficient stressor charges it.
   */
  saturationIrradianceFactor: number;
  /**
   * Total plant nutrients (NO3 + PO4 + K + Fe) consumed per unit of "potential
   * photosynthesis" (plant size × light × CO2, pre-Liebig). Consumption is
   * split across the four nutrients by the fertilizer formula ratio.
   * Calibrated so at Variant A steady state the plants' daily uptake roughly
   * matches the 1 ml/day auto-dose + fish bioload (scenario 02).
   */
  nutrientsPerPhotosynthesis: number;

  // Respiration constants
  /** Base respiration rate per 100% plant size per hour */
  baseRespirationRate: number;
  /** Q10 temperature coefficient (rate multiplier per 10°C) */
  respirationQ10: number;
  /** Reference temperature for respiration calculations (°C) */
  respirationReferenceTemp: number;
  /** Dissolved O2 (mg/L) at which respiration runs at half its base rate. */
  respirationOxygenHalfSaturation: number;

  // Gas exchange
  /**
   * mg of CO2 carried by one rate unit — one hour of 100 % plant size at base
   * rate under optimal conditions. Photosynthesis fixes it and respiration
   * releases it: one reaction run both ways, so one yield, and the day/night
   * asymmetry belongs to `baseRespirationRate`. The oxygen partner is not a
   * second knob — it derives at `CO2_TO_O2_MASS_RATIO`.
   */
  co2PerRateUnit: number;

  // Surplus-driven growth knobs.
  /**
   * Share of the banked reserve a plant mobilises toward new tissue each lit
   * hour. Why a share of the stock rather than a flat ceiling on the flow:
   * `docs/6-PLANTS.md` § Growth and Size.
   */
  growthDrawRate: number;
  /**
   * Size gained per surplus unit converted, before the species growth-rate
   * multiplier. With species growth rates in the 0.3–1.8 band this knob sets
   * the order of magnitude of the surplus → size conversion.
   */
  sizePerSurplus: number;
  /**
   * Saturation cap for the surplus reserve bank. Damage drains the bank
   * before condition falls; accrual (photoperiod-gated) saturates here.
   * Shared default across organism types — see `SURPLUS_CAP_DEFAULT`.
   */
  surplusCap: number;

  // Vitality stressor severities — see systems/plant-vitality.ts. Each is
  // a pre-hardiness damage rate (%/h per unit deviation); the species
  // hardiness multiplies the sum centrally.
  /** Damage per PAR unit below the species' tolerable lower bound. */
  lightInsufficientSeverity: number;
  /** Damage per PAR unit above the species' tolerable upper bound. */
  lightExcessiveSeverity: number;
  /** Damage per mg/L of CO2 below the species' tolerable lower bound. */
  co2InsufficientSeverity: number;
  /** Damage per °C of temperature outside the species' tolerable range. */
  temperatureStressSeverity: number;
  /** Damage per pH unit outside the species' tolerable range. */
  phStressSeverity: number;
  /** Damage per (1 − sufficiency) for nutrient deficiency. */
  nutrientDeficiencySeverity: number;
  /**
   * Damage per ppm of NO3 above the toxicity ceiling (the auto-doser
   * overdose case). Plants tolerate large surpluses; this only fires
   * at gross excess.
   */
  nutrientToxicitySeverity: number;
  /** Threshold (ppm NO3) above which nutrient toxicity activates. */
  nutrientToxicityThresholdNitrate: number;
  /** Damage per algae unit above the shading threshold. */
  algaeShadingSeverity: number;
  /** Algae level (0–100) above which shading stress kicks in. */
  algaeShadingThreshold: number;
  /**
   * Cost per hour of simply being alive, quoted at
   * `respirationReferenceTemp` and moved off it by the same Q10 factor the
   * gas layer's respiration runs on. Its reference is the compensation point
   * — the irradiance where photosynthesis pays for respiration; where the
   * shipped value puts that is derived in `plantsDefaults`.
   *
   * It is upkeep rather than damage, so a plant that cannot pay it sheds
   * tissue instead of losing condition.
   */
  upkeepCost: number;
  /**
   * Hours of upkeep the reserve keeps back from damage — the survival
   * rations. Above the line the bank is spare and buffers a stressor
   * before condition falls; at or below it the bank belongs to staying
   * alive, and damage takes condition instead.
   *
   * Real hours: the bank empties at the post-hardiness rate, so the line is
   * `maintenance × (1 − hardiness) × this` in banked units and the same
   * number of hours for every species. Quoted as a duration rather than a
   * share of `surplusCap` because growth withdraws `growthDrawRate` of the
   * bank every lit hour, more per day than a plant can earn, so a growing
   * plant settles far below the cap and would never read as provisioned
   * there.
   */
  upkeepReserveHours: number;

  // Vitality benefit peaks (%/h) when the corresponding factor is in its
  // tolerable band. Every one of them is realised through photosynthesis, so
  // all four are multiplied by the light term `tanh(PAR / Ik)`: the budget is
  // the plant's income, and good water is worth nothing at midnight. Sum at
  // saturating light ≈ 0.5 %/h — the calibration budget the plant recovery
  // curves were pinned against.
  /** CO2 in tolerable range. */
  co2BenefitPeak: number;
  /** Temperature in tolerable range. */
  temperatureBenefitPeak: number;
  /** pH in tolerable range. */
  phBenefitPeak: number;
  /** Nutrient sufficiency 1.0 (Liebig). */
  nutrientBenefitPeak: number;

  // Lifecycle (shedding + death) — see `systems/plant-lifecycle.ts`.
  /**
   * Share of itself a plant sheds per hour when it can pay none of its
   * upkeep. Scales down with the share it *can* pay, so the same number
   * covers a blackout and a dim afternoon.
   */
  maxSheddingRate: number;
  /** Waste produced per unit of shed size (g per % size shed). */
  wastePerShedSize: number;
  /** Condition below this triggers death. */
  deathConditionThreshold: number;
  /** Size below this triggers death (%). */
  deathSizeThreshold: number;
  /** Waste produced when plant dies (g per % size). */
  wastePerPlantDeath: number;
}

export const plantsDefaults: PlantsConfig = {
  basePhotosynthesisRate: 1.0,
  optimalCo2: 20.0, // mg/L - typical target for planted tanks
  optimalNitrate: 10.0, // ppm - typical target for planted tanks
  // A species saturates at twice the PAR its band starts at. What that reads
  // across the roster, and why it lands where the literature does, is in
  // `plants/species.ts`.
  saturationIrradianceFactor: 2.0,
  // Calibrated against scenario 02: at ~300 % total plant size with 8 hr
  // photoperiod and optimal CO2, potential photosynthesis ≈ 1.0 × 3.0 × 1.0
  // = 3.0 / hr → 24 units / day. 4 mg/unit × 24 × 1.2 (active biomass +
  // 20 % maintenance draw) ≈ 115 mg/day total nutrient uptake at full
  // sufficiency — matches the 1 ml/day auto-dose (96 mg) + fish bioload
  // + ambient mineralization so NO3 plateaus instead of runaway.
  // See `systems/photosynthesis.ts` for the uptake formula; it blends
  // Liebig-gated biomass draw with a smaller potential-rate maintenance
  // draw, so Variant B plants keep trickling nutrients down even with a
  // starved limiting factor.
  nutrientsPerPhotosynthesis: 4.0,

  // Dark respiration, runs 24/7 — a share of the light-saturated rate at the
  // carbon a tank actually carries, which is not `basePhotosynthesisRate`. That
  // is the rate at `optimalCo2`, five times the 4 mg/L `atmosphericCo2` an
  // aquarium without an injector equilibrates to, so a fraction quoted against
  // it is a fraction of an injected tank's ceiling. The ambient-carbon ceiling
  // is 0.2 rate units/h, and 0.03 is 15 % of it — the top of the 5–15 % the
  // macrophyte literature reports against light-saturated gross photosynthesis,
  // with the Monod below leaving 14 % standing in air-saturated water. It is
  // 3 % of the injected-carbon rate, which is what the old figure was quoting.
  // See `docs/calibration/runs/2026-08-07-plant-respiration.md`.
  baseRespirationRate: 0.03,
  respirationQ10: 2.0, // Rate doubles per 10°C increase
  respirationReferenceTemp: 25.0, // °C
  // Submerged tissue takes its oxygen out of the water across a boundary layer
  // rather than out of air, so the limit a plant meets is diffusion into the
  // leaf and not the mitochondrion's own affinity — macrophyte tissue starts
  // losing respiratory rate below roughly 1–2 mg/L. Half rate at 0.5 leaves a
  // healthy tank untouched (94 % at 8 mg/L) and only bites where the tank is
  // already in trouble.
  respirationOxygenHalfSaturation: 0.5,

  // mg CO2 per rate unit. Pinned against a grown-in planted 150 L (≈1000 total
  // plant size): it produces 0.5–1 mg/L/h of gross oxygen through the
  // photoperiod. A rate unit is an hour of 100 % plant size at full carbon
  // *and* saturating light. On the corrected gas reader that tank admits
  // 22.3–44.6, and the same claim read on a planting grown in from 350 admits
  // 21.6–43.4. `tests/planted-gas-budget.test.ts` asserts that tank; the
  // derivations are in `docs/calibration/runs/2026-08-07-light-response.md` and
  // `docs/calibration/runs/2026-08-07-plant-respiration.md`.
  co2PerRateUnit: 30.0,

  // Surplus-driven growth — vitality banks surplus when condition is full and
  // net is positive; growth converts a share of the bank into size, and only
  // what became size leaves the bank.
  //
  // 2 %/h is a ~50-lit-hour time constant, four days of photoperiod: how long a
  // cutting takes to stop sulking and start growing. Against the 0.5 %/h a
  // plant earns at its best it settles a young plant's reserve just under 28
  // units, over half the cap, which is what such a plant carries into a bad
  // night; a plant past half its `maxSize` settles above the cap and pegs there.
  growthDrawRate: 0.02,
  sizePerSurplus: 0.4, // size % per (surplus × growthRate) unit converted
  surplusCap: SURPLUS_CAP_DEFAULT,

  // Vitality stressor severities (pre-hardiness; the species hardiness
  // factor multiplies damage centrally inside `computeVitality`).
  //
  // %/h per PAR unit outside the species band, against a 0.5 %/h benefit
  // budget: 10 PAR short costs 0.20 %/h pre-hardiness, 10 PAR over 0.15 %/h.
  lightInsufficientSeverity: 0.02,
  lightExcessiveSeverity: 0.015,
  // Calibrated so a Monte Carlo (hardiness 0.3) loses visible condition
  // within ~24 sim hours when CO2 falls from 20 mg/L to 5 mg/L (gap of
  // 5 mg/L below tolerableCO2 lower bound) — matches the spec acceptance
  // scenario.
  co2InsufficientSeverity: 1.5,
  temperatureStressSeverity: 0.4,
  phStressSeverity: 3.0,
  // Pinned from both ends against a starved carpet and a neglected nano.
  //
  // Severe: a monte carlo under a fixture that suits it, in water with no
  // nitrogen in it at all, melts in **28 days** — weeks, which is what a
  // carpet does when it is starved, and not the eleven weeks 0.2 would give
  // it. Marginal: the shipped `planted` and `betta` presets, undosed and
  // planted with the java fern and anubias every beginner guide names, keep
  // all five plants alive at condition 96–100 for **180 days** — a hardy
  // plant in a tank nobody doses is outlived, not killed. Between the ends
  // the dose–response is a real one: a carpet at half every optimum takes
  // five months, at a quarter ten weeks, at a tenth six.
  //
  // The old 0.7 was quoted against an income that paid 0.4 %/h in the dark,
  // and its own docstring's reference — "bottoms out at 30–55 by day 28
  // rather than dying" — became day 4 when the light term took that income
  // away. `docs/calibration/runs/2026-08-08-reserve-by-priority.md` § 2 has
  // the sweep and the one claim this value does not satisfy, which belongs to
  // the sufficiency curve rather than to the severity.
  nutrientDeficiencySeverity: 0.3,
  // Toxicity threshold is high (100 ppm NO3) so normal dosing never
  // triggers — only the auto-doser massive-overdose case. Severity
  // is small so the stress climbs gradually past the threshold
  // rather than killing instantly.
  nutrientToxicitySeverity: 0.01,
  nutrientToxicityThresholdNitrate: 100,
  // Algae shading kicks in past 30 % bloom mass — that threshold makes
  // the player feel the bloom on their plants. Severity 0.05 % / h per
  // mass-point means a 60 % bloom delivers ~1.5 %/h pre-hardiness damage
  // (calibration-grade — task 42 first-pass; recalibration follows).
  algaeShadingSeverity: 0.05,
  algaeShadingThreshold: 30,
  // The compensation point, put where the macrophyte literature puts it: a
  // hardiness-0.3 species breaks even at 10.5 % of its own Ik — 6.3 PAR for
  // monte carlo, 5.3 for dwarf hairgrass — which is the bottom of the 10–20 %
  // of saturating irradiance the published figures span. 0.075 × (1 − 0.3) is
  // 0.0525, and 0.5 %/h × tanh(0.105) is the same. Hardier species carry a
  // lower point (anubias 3.8 % of its Ik), which is the direction shade
  // adaptation goes. Below a species' band the light-insufficient stressor
  // sits on top of this, so the PAR a plant actually needs is the band.
  upkeepCost: 0.075,
  // Four days of a plant's own drain is what it keeps back for staying alive
  // — 5.3 banked units for monte carlo against 1.9 for anubias, because the
  // hardy plant makes the same reserve last longer. It is the line that lets
  // one bank serve two claims: damage burns the ~20 units a working plant
  // carries above it, a day or two of buffer, and stops there rather than
  // leaving the next dark hour unpayable. What the line is worth either side
  // of it is in `docs/calibration/runs/2026-08-08-reserve-by-priority.md`.
  upkeepReserveHours: 100,

  // Vitality benefit peaks. Four channels at 0.125 sum to the 0.5 %/h budget
  // at saturating light, and the light term takes the whole of it down
  // together: a monte carlo at 30 PAR earns 0.46 of the budget, and every
  // plant earns none of it in the dark. With a healthy lit tank the plant
  // heals to 100 in a few sim days, then surplus drives growth.
  co2BenefitPeak: 0.125,
  temperatureBenefitPeak: 0.125,
  phBenefitPeak: 0.125,
  nutrientBenefitPeak: 0.125,

  // Lifecycle thresholds — forgiving by default.
  //
  // 2 %/h is the melt of a plant paying nothing at all: an e-folding every
  // two days, so a grown-in carpet is gone within a week of its bank running
  // out and a plant that only misses part of its bill loses that share of the
  // rate. The value is unchanged from when it was the rate at condition 0, but
  // its reference is not — a bill rather than a condition. The alternative,
  // converting the unpaid bill back into tissue as the mirror of
  // `sizePerSurplus`, is measured and rejected in
  // `docs/calibration/runs/2026-08-08-tissue-not-condition.md` § 6. Only an
  // energy shortfall reaches it: damage is buffered down to
  // `upkeepReserveHours`, so a poisoned plant never sheds for want of a bank.
  maxSheddingRate: 0.02,
  wastePerShedSize: 0.005, // 0.005 g waste per % size shed
  deathConditionThreshold: 10, // death at condition < 10 %
  deathSizeThreshold: 10, // death if size < 10 %
  wastePerPlantDeath: 0.01, // 0.01 g waste per % size when dying
};

export interface PlantsConfigMeta {
  key: keyof PlantsConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const plantsConfigMeta: PlantsConfigMeta[] = [
  // Photosynthesis
  {
    key: 'basePhotosynthesisRate',
    label: 'Base Photosynthesis Rate',
    unit: '/hr',
    min: 0.1,
    max: 5.0,
    step: 0.1,
  },
  { key: 'optimalCo2', label: 'Optimal CO2', unit: 'mg/L', min: 5, max: 40, step: 1 },
  { key: 'optimalNitrate', label: 'Optimal Nitrate', unit: 'ppm', min: 5, max: 30, step: 1 },
  {
    key: 'saturationIrradianceFactor',
    label: 'Saturation Irradiance Factor',
    unit: '× band low',
    min: 0.5,
    max: 5,
    step: 0.1,
  },
  {
    key: 'nutrientsPerPhotosynthesis',
    label: 'Nutrients per Photosynthesis',
    unit: 'mg',
    min: 0.5,
    max: 20,
    step: 0.5,
  },
  // Respiration
  {
    key: 'baseRespirationRate',
    label: 'Base Respiration Rate',
    unit: '/hr',
    min: 0.005,
    max: 0.2,
    step: 0.005,
  },
  { key: 'respirationQ10', label: 'Respiration Q10', unit: '', min: 1.5, max: 3.0, step: 0.1 },
  {
    key: 'respirationReferenceTemp',
    label: 'Respiration Ref Temp',
    unit: '°C',
    min: 20,
    max: 30,
    step: 1,
  },
  {
    key: 'respirationOxygenHalfSaturation',
    label: 'Respiration O2 Half-Saturation',
    unit: 'mg/L',
    min: 0.05,
    max: 3,
    step: 0.05,
  },
  // Gas exchange
  { key: 'co2PerRateUnit', label: 'CO2 per Rate Unit', unit: 'mg', min: 1, max: 200, step: 1 },
  // Surplus-driven growth
  { key: 'growthDrawRate', label: 'Growth Draw Rate', unit: '/hr', min: 0.005, max: 0.2, step: 0.005 },
  { key: 'sizePerSurplus', label: 'Size per Surplus', unit: '%', min: 0.01, max: 2.0, step: 0.01 },
  { key: 'surplusCap', label: 'Surplus Cap', unit: '%', min: 0, max: 100, step: 5 },

  // Vitality stressor severities
  { key: 'lightInsufficientSeverity', label: 'Light Insuff. Severity', unit: '%/PAR/hr', min: 0.005, max: 0.1, step: 0.005 },
  { key: 'lightExcessiveSeverity', label: 'Light Excess Severity', unit: '%/PAR/hr', min: 0.005, max: 0.1, step: 0.005 },
  { key: 'co2InsufficientSeverity', label: 'CO2 Insuff. Severity', unit: '%/(mg/L)/hr', min: 0.1, max: 5.0, step: 0.1 },
  { key: 'temperatureStressSeverity', label: 'Plant Temp Severity', unit: '%/°C/hr', min: 0.1, max: 2.0, step: 0.1 },
  { key: 'phStressSeverity', label: 'Plant pH Severity', unit: '%/pH/hr', min: 0.5, max: 10, step: 0.5 },
  { key: 'nutrientDeficiencySeverity', label: 'Nutrient Defic. Severity', unit: '%/(1-suff)/hr', min: 0.1, max: 2.0, step: 0.1 },
  { key: 'nutrientToxicitySeverity', label: 'Nutrient Tox. Severity', unit: '%/ppm/hr', min: 0.001, max: 0.2, step: 0.005 },
  { key: 'nutrientToxicityThresholdNitrate', label: 'NO3 Tox. Threshold', unit: 'ppm', min: 50, max: 300, step: 10 },
  { key: 'algaeShadingSeverity', label: 'Algae Shading Severity', unit: '%/algae/hr', min: 0.001, max: 0.1, step: 0.005 },
  { key: 'algaeShadingThreshold', label: 'Algae Shading Threshold', unit: '', min: 20, max: 80, step: 5 },
  { key: 'upkeepCost', label: 'Upkeep Cost', unit: '%/hr', min: 0, max: 0.5, step: 0.005 },
  { key: 'upkeepReserveHours', label: 'Upkeep Reserve', unit: 'hr upkeep', min: 10, max: 500, step: 10 },

  // Vitality benefit peaks
  { key: 'co2BenefitPeak', label: 'CO2 Benefit Peak', unit: '%/hr', min: 0.0, max: 0.5, step: 0.05 },
  { key: 'temperatureBenefitPeak', label: 'Temp Benefit Peak', unit: '%/hr', min: 0.0, max: 0.5, step: 0.05 },
  { key: 'phBenefitPeak', label: 'pH Benefit Peak', unit: '%/hr', min: 0.0, max: 0.5, step: 0.05 },
  { key: 'nutrientBenefitPeak', label: 'Nutrient Benefit Peak', unit: '%/hr', min: 0.0, max: 0.5, step: 0.05 },

  // Lifecycle (shedding + death)
  { key: 'maxSheddingRate', label: 'Max Shedding Rate', unit: '/hr', min: 0.005, max: 0.1, step: 0.005 },
  { key: 'wastePerShedSize', label: 'Waste per Shed Size', unit: 'g/%', min: 0.001, max: 0.05, step: 0.001 },
  { key: 'deathConditionThreshold', label: 'Death Condition Threshold', unit: '%', min: 5, max: 20, step: 1 },
  { key: 'deathSizeThreshold', label: 'Death Size Threshold', unit: '%', min: 5, max: 20, step: 1 },
  { key: 'wastePerPlantDeath', label: 'Waste per Plant Death', unit: 'g/%', min: 0.001, max: 0.05, step: 0.001 },
];
