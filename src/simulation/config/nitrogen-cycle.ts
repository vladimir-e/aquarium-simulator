/**
 * Nitrogen cycle system tunable configuration.
 */

export interface NitrogenCycleConfig {
  /** Fraction of waste converted to ammonia per tick */
  wasteConversionRate: number;
  /** Conversion ratio: grams waste to mg ammonia */
  wasteToAmmoniaRatio: number;
  /** ppm processed per bacteria unit per tick */
  bacteriaProcessingRate: number;
  /** ppm ammonia to trigger AOB spawn */
  aobSpawnThreshold: number;
  /** ppm nitrite to trigger NOB spawn */
  nobSpawnThreshold: number;
  /** Initial bacteria when spawning */
  spawnAmount: number;
  /** AOB growth rate per tick at full utilization */
  aobGrowthRate: number;
  /** NOB growth rate per tick at full utilization */
  nobGrowthRate: number;
  /** Max bacteria per cm² surface */
  bacteriaPerCm2: number;
  /** Fraction of bacteria that die per tick */
  bacteriaDeathRate: number;
}

export const nitrogenCycleDefaults: NitrogenCycleConfig = {
  wasteConversionRate: 0.3,
  // Stoichiometric: fish waste ≈ 5% N by dry mass; 1 g waste → 0.05 g N →
  // 0.05 × MW_NH3/MW_N = 0.05 × 17.03/14.01 ≈ 60.8 mg NH3. The chain
  // NH3 → NO2 → NO3 then picks up the MW ratios at each conversion step
  // inside the nitrogen-cycle system, so this coefficient is purely the
  // waste → NH3 first stage. See systems/nitrogen-cycle.ts for MW math.
  wasteToAmmoniaRatio: 60,
  // Calibrated for fishless cycle completing in 25-35 days
  bacteriaProcessingRate: 0.0002,
  // Spawn thresholds set to "detectable by hobbyist" ranges — 0.5 ppm
  // NH3 and 0.5 ppm NO2 are the levels where a nitrifier lag-phase
  // typically ends. Previous 0.02 / 0.125 led to bacteria colonising
  // within the first day, which contradicted the scenario 1 timeline
  // (cycle visible only after 10+ days in a fresh tank).
  aobSpawnThreshold: 0.5,
  nobSpawnThreshold: 0.5,
  // What drifts in from the air and the tap: everything after this is
  // doublings, so the inoculum sets the clock. Derived from the cycling
  // timeline rather than from a cell count — the only value that lands the
  // nitrite peak on day 12–16 and a cycled tank on day 21–28 at both 20 L
  // and 150 L.
  //
  // Measured by sweep, the window is 0.62–0.68 and no wider. Below it the
  // peak clears 5 ppm; above it a 150 L cycles before day 21 — at 0.70 it
  // lands on day 20.96. The value below is the last one that passes, so
  // there is no headroom upward at all. Peak height and peak day are not
  // separate knobs: the bed's nitrogen budget is fixed, so every day the
  // peak is delayed is another day of it standing as nitrite.
  spawnAmount: 0.68,
  // Growth is per-capita at *full* utilization, so each rate is read straight
  // off a saturated doubling time: rate = ln2 / hours. AOB double in 15–24 h
  // under non-limiting ammonia, NOB in 24–48 h; the midpoints below keep the
  // AOB-before-NOB succession (Hovanec & DeLong, 1996) that makes nitrite
  // peak after ammonia rather than alongside it.
  aobGrowthRate: Math.LN2 / 20,
  nobGrowthRate: Math.LN2 / 36,
  bacteriaPerCm2: 0.01,
  // Maintenance loss, not starvation: a colony cut off from ammonia fades over
  // weeks, which is why a tank survives a holiday. ln2 / (3 weeks) — a 21-day
  // half-life. A colony settles where g·u·(1 − p/K) = d, which is
  // deathRate / growthRate of capacity (4 % AOB, 7 % NOB) only while the
  // ceiling is far off; at the `bacteriaPerCm2` this engine ships, an ordinary
  // load parks a colony at 50–90 % of K and the logistic term stops it first.
  bacteriaDeathRate: Math.LN2 / (21 * 24),
};

export interface NitrogenCycleConfigMeta {
  key: keyof NitrogenCycleConfig;
  label: string;
  unit: string;
  step: number;
}

// `step` is the debug panel's spinner increment. The rates above are derived
// from doubling times, so no decimal grid contains them: each step is fine
// enough that a click nudges its value instead of snapping it to a round one.
export const nitrogenCycleConfigMeta: NitrogenCycleConfigMeta[] = [
  { key: 'wasteConversionRate', label: 'Waste Conversion Rate', unit: '/tick', step: 0.05 },
  { key: 'wasteToAmmoniaRatio', label: 'Waste to Ammonia Ratio', unit: 'mg/g', step: 5 },
  { key: 'bacteriaProcessingRate', label: 'Bacteria Processing Rate', unit: 'ppm/unit', step: 0.00005 },
  { key: 'aobSpawnThreshold', label: 'AOB Spawn Threshold', unit: 'ppm', step: 0.005 },
  { key: 'nobSpawnThreshold', label: 'NOB Spawn Threshold', unit: 'ppm', step: 0.025 },
  { key: 'spawnAmount', label: 'Spawn Amount', unit: '', step: 0.01 },
  { key: 'aobGrowthRate', label: 'AOB Growth Rate', unit: '/tick', step: 0.0001 },
  { key: 'nobGrowthRate', label: 'NOB Growth Rate', unit: '/tick', step: 0.0001 },
  { key: 'bacteriaPerCm2', label: 'Max Bacteria per cm²', unit: '/cm²', step: 0.001 },
  { key: 'bacteriaDeathRate', label: 'Bacteria Death Rate', unit: '/tick', step: 0.00001 },
];
