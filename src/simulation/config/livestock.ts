/**
 * Livestock system tunable configuration.
 *
 * Calibration targets:
 * - Metabolism: A 1g fish consumes ~0.01g food/hr, produces proportional waste/CO2
 * - Hunger: Increases ~4%/hr when unfed (full to starving in ~24hr)
 * - Health: Per-factor benefits sum to ~1%/h in ideal conditions; degrades faster under stress
 * - Death: 1% chance per tick after max age
 */

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
  /**
   * Fraction of ingested food mass that is nitrogen (g N / g food).
   *
   * Typical aquarium flake/pellet food is 35–50 % protein, protein is
   * ≈16 % N by mass, giving 5.6–8 % N in food. 0.05 is a conservative
   * floor and matches the engine's existing waste → NH3 assumption
   * (`wasteToAmmoniaRatio = 60 mg NH3/g waste` embeds 5 % N). Surfacing
   * this here makes the coupling explicit for calibration.
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
   * Basal gill NH3 excretion rate (mg NH3 per g fish per hour) —
   * produced continuously from body protein turnover regardless of
   * feeding. Real freshwater teleosts at 25 °C excrete roughly
   * 0.3–1.0 mg NH3-N / g / day (≈ 0.015–0.05 mg NH3 / g / hr). This
   * is additive to the food-driven (post-prandial) NH3 in
   * `gillNFraction`; skipping it undercounts N output during
   * fasting or sparse feeding.
   */
  basalAmmoniaRate: number;
  /** CO2 produced per unit oxygen consumed (respiratory quotient) */
  respiratoryQuotient: number;

  // Hunger
  /** Hunger increase per hour (percentage points) */
  hungerIncreaseRate: number;

  // Stressor severities (damage per hour per unit deviation)
  /** Health damage per °C outside safe temperature range */
  temperatureStressSeverity: number;
  /** Health damage per pH unit outside safe range */
  phStressSeverity: number;
  /**
   * Health damage per ppm of *unionized* NH3 (not total TAN).
   *
   * Only the unionized form crosses gill epithelium; NH4⁺ is orders of
   * magnitude less toxic. Fish-health multiplies this by
   * `unionizedAmmoniaFraction(pH, T)` × TAN ppm, so a 2 ppm TAN reading
   * at pH 6.5 / 25 °C contributes ~30× less stress than the same 2 ppm
   * at pH 8.0. Reference: free-NH3 lethal threshold for sensitive
   * freshwater teleosts is ~0.05 ppm sustained.
   */
  ammoniaStressSeverity: number;
  /** Health damage per ppm of nitrite */
  nitriteStressSeverity: number;
  /** Health damage per ppm of nitrate above 40 */
  nitrateStressSeverity: number;
  /** Health damage when hunger exceeds 50% (per % above 50) */
  hungerStressSeverity: number;
  /** Health damage per mg/L oxygen below 5 */
  oxygenStressSeverity: number;
  /** Health damage per % water below 50% capacity */
  waterLevelStressSeverity: number;
  /** Health damage per LPH of flow above species max */
  flowStressSeverity: number;

  // Death
  /** Fraction of fish mass added as waste on death */
  deathDecayFactor: number;
  /** Chance of death per tick when past max age (0-1) */
  oldAgeDeathChance: number;
}

export const livestockDefaults: LivestockConfig = {
  // Metabolism - a 1g fish eats ~0.01g/hr = 0.24g/day
  baseFoodRate: 0.01,
  // 0.3 mg O2 / g fish / hr — midpoint of real-world 0.2–0.5 at 25°C for
  // small freshwater teleosts. Applied as absolute mg/hr and converted to
  // mg/L by the livestock pipeline using tank volume.
  baseRespirationRate: 0.3,
  // 5 % N in food — conservative; typical flake is 6–8 % N. Matches the
  // engine's existing waste → NH3 ratio.
  foodNitrogenFraction: 0.05,
  // 80 % of ingested N excreted directly through gills; 20 % via feces.
  gillNFraction: 0.8,
  // 0.03 mg NH3 / g fish / hr = 0.72 mg/g/day — mid of the 0.3–1.0
  // mg N/g/day range (converted via MW_NH3/MW_N), representative of a
  // small freshwater teleost at 25 °C. For 5 g of neon tetras this
  // is 3.6 mg NH3/day, roughly equal to the food-driven contribution
  // at lean feeding — matching the real-world observation that
  // basal output is non-negligible.
  basalAmmoniaRate: 0.03,
  respiratoryQuotient: 0.8, // CO2/O2 ratio

  // Hunger - increases ~0.6%/hr; fish can survive 3-7 days without food
  // Reaches 50% (stress threshold) in ~3.5 days, 100% in ~7 days
  hungerIncreaseRate: 0.6,

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
  // Per ppm of UNIONIZED NH3. Sensitive freshwater teleosts show acute
  // gill damage at ~0.05 ppm free NH3 sustained. 175 puts ~0.9 %/hr
  // net damage at that threshold for a mid-hardiness fish (factor
  // 0.5), giving multi-day survival at 1–2 ppm TAN and certain death
  // at 3–5 ppm TAN once the unionized fraction climbs.
  ammoniaStressSeverity: 175.0,
  // Neon-tetra-scale teleosts show 96-hr LC50 for nitrite in the
  // 5–10 ppm band; chronic stress starts around 1–2 ppm. With a
  // mid-hardiness fish (factor 0.5), severity 2.5 gives:
  //   1 ppm → 0.625 %/hr (net +0.375 — healing marginal),
  //   3 ppm → 1.875 %/hr (net -0.875 — dies in ~115 hr),
  //   5 ppm → 3.125 %/hr (net -2.125 — dies in ~47 hr).
  // 96-hr LC50 lands near ~4–5 ppm — consistent with literature.
  nitriteStressSeverity: 2.5,
  nitrateStressSeverity: 0.5, // Mild - 0.5% damage per ppm above 40
  hungerStressSeverity: 0.1, // 0.1% per % hunger above 50
  oxygenStressSeverity: 3.0, // 3% damage per mg/L below 5
  waterLevelStressSeverity: 0.2, // 0.2% per % below 50% capacity
  flowStressSeverity: 0.01, // 0.01% per LPH above species max

  // Death
  deathDecayFactor: 0.5, // Half fish mass becomes waste
  oldAgeDeathChance: 0.01, // 1% per tick after max age
};

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
    key: 'foodNitrogenFraction',
    label: 'Food N Fraction',
    unit: 'g N/g food',
    min: 0.03,
    max: 0.12,
    step: 0.005,
  },
  { key: 'gillNFraction', label: 'Gill N Fraction', unit: '', min: 0.5, max: 0.95, step: 0.05 },
  {
    key: 'basalAmmoniaRate',
    label: 'Basal NH3 Rate',
    unit: 'mg NH3/g/hr',
    min: 0.005,
    max: 0.1,
    step: 0.005,
  },
  { key: 'respiratoryQuotient', label: 'Respiratory Quotient', unit: '', min: 0.5, max: 1.2, step: 0.1 },
  // Hunger
  { key: 'hungerIncreaseRate', label: 'Hunger Rate', unit: '%/hr', min: 0.1, max: 5, step: 0.1 },
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
  {
    key: 'ammoniaStressSeverity',
    label: 'Ammonia Stress Severity',
    unit: '%/ppm free NH3/hr',
    min: 50,
    max: 500,
    step: 25,
  },
  {
    key: 'nitriteStressSeverity',
    label: 'Nitrite Stress Severity',
    unit: '%/ppm/hr',
    min: 5,
    max: 50,
    step: 5,
  },
  {
    key: 'nitrateStressSeverity',
    label: 'Nitrate Stress Severity',
    unit: '%/ppm/hr',
    min: 0.1,
    max: 2,
    step: 0.1,
  },
  { key: 'hungerStressSeverity', label: 'Hunger Stress', unit: '%/%/hr', min: 0.01, max: 0.5, step: 0.01 },
  {
    key: 'oxygenStressSeverity',
    label: 'O2 Stress Severity',
    unit: '%/mg/L/hr',
    min: 1,
    max: 10,
    step: 0.5,
  },
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
    unit: '%/LPH/hr',
    min: 0.001,
    max: 0.05,
    step: 0.001,
  },
  // Death
  { key: 'deathDecayFactor', label: 'Death Decay Factor', unit: '', min: 0.1, max: 1.0, step: 0.1 },
  { key: 'oldAgeDeathChance', label: 'Old Age Death Chance', unit: '/tick', min: 0.001, max: 0.05, step: 0.001 },
];
