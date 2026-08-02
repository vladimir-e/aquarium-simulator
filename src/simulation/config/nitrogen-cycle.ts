/**
 * Nitrogen cycle system tunable configuration.
 *
 * **A bacteria unit is 10⁶ cells.** Populations, the surface ceiling, the
 * inoculum and the throughput rate are all quoted in those units, which is
 * what makes `bacteriaPerCm2` a biofilm density you can look up rather than
 * an arbitrary score. See `bacteriaPerCm2` below for the pin.
 */

export interface NitrogenCycleConfig {
  /** Fraction of waste converted to ammonia per tick */
  wasteConversionRate: number;
  /** Conversion ratio: grams waste to mg ammonia */
  wasteToAmmoniaRatio: number;
  /** mg NH₃ processed per bacteria unit per tick */
  bacteriaProcessingRate: number;
  /** ppm ammonia to trigger AOB spawn */
  aobSpawnThreshold: number;
  /** ppm nitrite to trigger NOB spawn */
  nobSpawnThreshold: number;
  /** Bacteria units the tank is seeded with per cm² of surface, on spawn */
  inoculumPerCm2: number;
  /** AOB growth rate per tick at full utilization */
  aobGrowthRate: number;
  /** NOB growth rate per tick at full utilization */
  nobGrowthRate: number;
  /** Max bacteria units per cm² surface */
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
  // mg NH₃ one bacteria unit (10⁶ cells) oxidises per hour.
  //
  // Numerically unchanged from the value this engine shipped before the units
  // fix, and it means something else entirely. The old one was multiplied by
  // the tank's litres, so a bacterium in a 300 L cleared fifteen times the
  // mass of the same bacterium in a 20 L. This one is absolute — throughput
  // is a property of the cell.
  //
  // 0.0002 mg per 10⁶ cells per hour is 2×10⁻¹³ g/cell/h, inside the
  // 10⁻¹⁴–10⁻¹³ g/cell/h measured for Nitrosomonas. That is the independent
  // check on the gauge pinned at `bacteriaPerCm2`: the pair lands on real
  // biology, not only on the anchors.
  bacteriaProcessingRate: 0.0002,
  // Spawn thresholds set to "detectable by hobbyist" ranges — 0.5 ppm
  // NH3 and 0.5 ppm NO2 are the levels where a nitrifier lag-phase
  // typically ends. Previous 0.02 / 0.125 led to bacteria colonising
  // within the first day, which contradicted the scenario 1 timeline
  // (cycle visible only after 10+ days in a fresh tank).
  aobSpawnThreshold: 0.5,
  nobSpawnThreshold: 0.5,
  // What drifts in from the air and the tap, per cm² of the surface it lands
  // on. A density and not a count: the seed has to scale with the bed, or a
  // 1000 L tank starts with the same colony as a 10 L against a hundred times
  // the load. Gravel and sand therefore seed proportionally lighter than aqua
  // soil, which is the same ordering as their surface areas.
  //
  // Everything after the seed is doublings, so the inoculum sets the clock —
  // this is the one constant of the three read off the cycling timeline rather
  // than pinned to a measurement. Peak height and cycled day are not separate
  // knobs: the bed's nitrogen budget is fixed, so every day the peak is delayed
  // is another day of it standing as nitrite.
  //
  // Swept at 20 L and 150 L, the whole passing window is 5.0e-4 – 5.7e-4 and no
  // wider: below it the peak clears the 5 ppm ceiling, above it a tank cycles
  // before day 21. The value below sits mid-window, ~0.05 ppm under the peak
  // ceiling and ~0.17 d over the cycled-day floor. Those margins are the widest
  // the window allows — they trade against each other one for one.
  inoculumPerCm2: 5.4e-4,
  // Growth is per-capita at *full* utilization, so each rate is read straight
  // off a saturated doubling time: rate = ln2 / hours. AOB double in 15–24 h
  // under non-limiting ammonia, NOB in 24–48 h; the midpoints below keep the
  // AOB-before-NOB succession (Hovanec & DeLong, 1996) that makes nitrite
  // peak after ammonia rather than alongside it.
  aobGrowthRate: Math.LN2 / 20,
  nobGrowthRate: Math.LN2 / 36,
  // Carrying capacity in 10⁶ cells per cm² of biofilm — 10⁷ cells/cm², mid-range
  // for mature nitrifying media.
  //
  // This constant is the units convention rather than a fitted value. The three
  // constants above and here — throughput R, ceiling density K, inoculum
  // density s — carry an exact gauge symmetry: (R → αR, K → K/α, s → s/α)
  // produces bit-identical trajectories, because a population only ever enters
  // the model multiplied by R or divided by K. Three numbers, two physical
  // degrees of freedom. Pinning K to a real biofilm density spends the spare
  // one on meaning, and gives the literature cross-check on R something to
  // check against.
  bacteriaPerCm2: 10,
  // Maintenance loss, not starvation: a colony cut off from ammonia fades over
  // weeks, which is why a tank survives a holiday. ln2 / (3 weeks) — a 21-day
  // half-life. A colony settles where g·u·(1 − p/K) = d, so utilization rests
  // at deathRate / growthRate (4 % AOB, 7 % NOB) divided by the headroom
  // 1 − p/K. With the ceiling above, an ordinary load leaves that headroom
  // near 1 and maintenance decay is what the colony balances against.
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
  { key: 'bacteriaProcessingRate', label: 'Bacteria Processing Rate', unit: 'mg/unit/tick', step: 0.00005 },
  { key: 'aobSpawnThreshold', label: 'AOB Spawn Threshold', unit: 'ppm', step: 0.005 },
  { key: 'nobSpawnThreshold', label: 'NOB Spawn Threshold', unit: 'ppm', step: 0.025 },
  { key: 'inoculumPerCm2', label: 'Inoculum Density', unit: 'units/cm²', step: 0.00005 },
  { key: 'aobGrowthRate', label: 'AOB Growth Rate', unit: '/tick', step: 0.0001 },
  { key: 'nobGrowthRate', label: 'NOB Growth Rate', unit: '/tick', step: 0.0001 },
  { key: 'bacteriaPerCm2', label: 'Max Bacteria per cm²', unit: 'units/cm²', step: 0.5 },
  { key: 'bacteriaDeathRate', label: 'Bacteria Death Rate', unit: '/tick', step: 0.00001 },
];
