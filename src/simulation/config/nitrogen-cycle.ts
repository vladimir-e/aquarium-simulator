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
  spawnAmount: 10,
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
  // half-life. Against the growth rates above this settles the colony at
  // deathRate / growthRate of its capacity (4 % AOB, 7 % NOB), i.e. an
  // established biofilter carries ~15–25× headroom over its standing load.
  bacteriaDeathRate: Math.LN2 / (21 * 24),
};

export interface NitrogenCycleConfigMeta {
  key: keyof NitrogenCycleConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const nitrogenCycleConfigMeta: NitrogenCycleConfigMeta[] = [
  { key: 'wasteConversionRate', label: 'Waste Conversion Rate', unit: '/tick', min: 0.1, max: 0.9, step: 0.05 },
  { key: 'wasteToAmmoniaRatio', label: 'Waste to Ammonia Ratio', unit: 'mg/g', min: 10, max: 200, step: 5 },
  { key: 'bacteriaProcessingRate', label: 'Bacteria Processing Rate', unit: 'ppm/unit', min: 0.00005, max: 0.001, step: 0.00005 },
  { key: 'aobSpawnThreshold', label: 'AOB Spawn Threshold', unit: 'ppm', min: 0.005, max: 0.1, step: 0.005 },
  { key: 'nobSpawnThreshold', label: 'NOB Spawn Threshold', unit: 'ppm', min: 0.05, max: 0.5, step: 0.025 },
  { key: 'spawnAmount', label: 'Spawn Amount', unit: '', min: 1, max: 50, step: 1 },
  { key: 'aobGrowthRate', label: 'AOB Growth Rate', unit: '/tick', min: 0.01, max: 0.1, step: 0.01 },
  { key: 'nobGrowthRate', label: 'NOB Growth Rate', unit: '/tick', min: 0.01, max: 0.15, step: 0.01 },
  { key: 'bacteriaPerCm2', label: 'Max Bacteria per cm²', unit: '/cm²', min: 0.001, max: 0.1, step: 0.001 },
  { key: 'bacteriaDeathRate', label: 'Bacteria Death Rate', unit: '/tick', min: 0.0005, max: 0.02, step: 0.0005 },
];
