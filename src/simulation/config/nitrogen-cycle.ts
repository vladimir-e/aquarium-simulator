/**
 * Nitrogen cycle system tunable configuration.
 *
 * **A bacteria unit is 10⁶ cells.** Populations, the surface ceiling, the
 * inoculum and the throughput rate are all quoted in those units, which is
 * what makes `bacteriaPerCm2` a biofilm density you can look up rather than
 * an arbitrary score. See `bacteriaPerCm2` below for the pin.
 *
 * Three of the rates below are Monod maxima read at {@link AIR_SATURATED_O2}
 * rather than figures a culture would hand you, and each says so where it is
 * defined. `docs/4-CORE-SYSTEMS.md` carries the rule and which constants in the
 * engine follow it.
 */

import { monodFactor } from '../core/kinetics.js';

/**
 * Dissolved O2 in air-saturated freshwater at `referenceTemp`, mg/L — the water
 * every rate below is quoted in, being the water a stirred culture and a healthy
 * tank both sit in.
 *
 * A literal rather than `calculateO2Saturation(referenceTemp)`: that function
 * lives in `systems/`, and no other constant in `config/` reaches across that
 * boundary. `config/index.test.ts` holds the two together to a part in a
 * million, which buys the same protection without the dependency.
 */
export const AIR_SATURATED_O2 = 8.38;

const AOB_OXYGEN_HALF_SATURATION = 0.3;
const NOB_OXYGEN_HALF_SATURATION = 1.1;

/** What the oxygen term leaves of each guild's maximum in that water. */
const AOB_AT_AIR_SATURATION = monodFactor(AIR_SATURATED_O2, AOB_OXYGEN_HALF_SATURATION);
const NOB_AT_AIR_SATURATION = monodFactor(AIR_SATURATED_O2, NOB_OXYGEN_HALF_SATURATION);

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
  /** Bacteria units the tank is seeded with per litre of water, on spawn */
  inoculumPerLiter: number;
  /** AOB growth rate per tick at full utilization */
  aobGrowthRate: number;
  /** NOB growth rate per tick at full utilization */
  nobGrowthRate: number;
  /** Max bacteria units per cm² surface */
  bacteriaPerCm2: number;
  /** Fraction of bacteria that die per tick */
  bacteriaDeathRate: number;
  /** Factor every nitrifier rate multiplies by per 10 °C */
  q10: number;
  /** Temperature the nitrifier rates are quoted at (°C) */
  referenceTemp: number;
  /** Dissolved O2 (mg/L) at which AOB oxidise and grow at half rate */
  aobOxygenHalfSaturation: number;
  /** Dissolved O2 (mg/L) at which NOB oxidise and grow at half rate */
  nobOxygenHalfSaturation: number;
}

export const nitrogenCycleDefaults: NitrogenCycleConfig = {
  wasteConversionRate: 0.3,
  // Stoichiometric: fish waste ≈ 5% N by dry mass; 1 g waste → 0.05 g N →
  // 0.05 × MW_NH3/MW_N = 0.05 × 17.03/14.01 ≈ 60.8 mg NH3. The chain
  // NH3 → NO2 → NO3 then picks up the MW ratios at each conversion step
  // inside the nitrogen-cycle system, so this coefficient is purely the
  // waste → NH3 first stage. See systems/nitrogen-cycle.ts for MW math.
  wasteToAmmoniaRatio: 60,
  // mg NH₃ one bacteria unit (10⁶ cells) oxidises per tick, and a tick is an
  // hour: 2×10⁻¹³ g/cell/h in air-saturated water, inside the 10⁻¹⁴–10⁻¹³
  // g/cell/h measured for Nitrosomonas. That is the independent check on the
  // gauge pinned at `bacteriaPerCm2` — the pair lands on real biology, not only
  // on the anchors.
  //
  // NOB take the same per-cell throughput scaled by the N mass ratio, re-quoted
  // through their own oxygen term instead of inheriting AOB's — so the two
  // guilds balance per N atom in the water both figures were measured in, and
  // part company in every thinner one. That parting is what makes nitrite the
  // species that stands: the gap between the two half-saturation constants runs
  // from 1.000 at saturation to 0.364 at 0.10 mg/L.
  bacteriaProcessingRate: 0.0002 / AOB_AT_AIR_SATURATION,
  // Spawn thresholds set to "detectable by hobbyist" ranges — 0.5 ppm
  // NH3 and 0.5 ppm NO2 are the levels where a nitrifier lag-phase
  // typically ends. Previous 0.02 / 0.125 led to bacteria colonising
  // within the first day, which contradicted the scenario 1 timeline
  // (cycle visible only after 10+ days in a fresh tank).
  aobSpawnThreshold: 0.5,
  nobSpawnThreshold: 0.5,
  // Nitrifiers the tank is born with, per litre of fill water — 6.4×10⁵ cells,
  // ~640 per mL. See `calculateInoculum` for why the seed is counted in litres.
  //
  // Everything after the seed is doublings, so the inoculum sets the clock —
  // this is the one constant of the three read off the cycling timeline rather
  // than pinned to a measurement. Peak height and cycled day are not separate
  // knobs: the bed's nitrogen budget is fixed, so every day the peak is delayed
  // is another day of it standing as nitrite.
  //
  // Swept at 10 L through 1000 L, every value that passes lies in 0.597 – 0.680
  // units/L: below it the nitrite peak clears the 5 ppm ceiling, above it a
  // tank cycles before day 21. Room at one edge is bought with room at the
  // other, one for one, so the value below is the middle of that window — the
  // furthest either edge can be held off. It leaves 0.047 ppm under the peak
  // ceiling and 0.208 d over the cycled-day floor.
  // `tests/inoculum-window.test.ts` re-runs the sweep.
  inoculumPerLiter: 0.6385,
  // Growth is per-capita at *full* utilization, so each rate is read straight
  // off a saturated doubling time: rate = ln2 / hours. AOB double in 15–24 h
  // under non-limiting ammonia, NOB in 24–48 h; the midpoints below keep the
  // AOB-before-NOB succession (Hovanec & DeLong, 1996) that makes nitrite
  // peak after ammonia rather than alongside it.
  //
  // Those hours are what a culture in air-saturated water does, so each is the
  // doubling time the tank reproduces rather than the one the constant states:
  // dividing by the oxygen term there puts 20 h and 36 h back in the water and
  // stretches them as the water thins.
  aobGrowthRate: Math.LN2 / 20 / AOB_AT_AIR_SATURATION,
  nobGrowthRate: Math.LN2 / 36 / NOB_AT_AIR_SATURATION,
  // Carrying capacity in 10⁶ cells per cm² of biofilm — 10⁷ cells/cm², mid-range
  // for mature nitrifying media.
  //
  // This constant is the units convention rather than a fitted value. The three
  // constants above and here — throughput R, ceiling density K, inoculum s —
  // carry an exact gauge symmetry: (R → αR, K → K/α, s → s/α)
  // produces bit-identical trajectories, because a population only ever enters
  // the model multiplied by R or divided by K. Three numbers, two physical
  // degrees of freedom. Pinning K to a real biofilm density spends the spare
  // one on meaning, and gives the literature cross-check on R something to
  // check against.
  bacteriaPerCm2: 10,
  // Maintenance loss, not starvation: a colony cut off from ammonia fades over
  // weeks, which is why a tank survives a holiday. ln2 / (3 weeks) — a 21-day
  // half-life. A colony settles where g·a·u·(1 − p/K) = d, so utilization rests
  // at deathRate / (growthRate × the oxygen factor) divided by the headroom
  // 1 − p/K — 4 % AOB and 7 % NOB in air-saturated water, further up as the
  // water thins. With the ceiling above, an ordinary load leaves that headroom
  // near 1 and maintenance decay is what the colony balances against.
  bacteriaDeathRate: Math.LN2 / (21 * 24),
  // Nitrification runs on enzymes, so every rate above is quoted at a
  // temperature. 2.5 is the middle of the Q10 2–3 measured for Nitrosomonas
  // and Nitrospira — the same slope wastewater models carry as θ ≈ 1.1 per °C
  // — and it puts an 18 °C cycle at close to twice the days a 25 °C one takes,
  // which is the cold-start figure a keeper plans around.
  //
  // Oxidation, growth and maintenance all scale by the one factor: they are
  // one metabolism, and a cell that works half as fast also divides and starves
  // half as fast. The colony a load needs therefore grows as the water cools,
  // while the utilization it rests at — deathRate/growthRate — does not move.
  q10: 2.5,
  // Every anchor is measured at 25 °C, so the term is inert there by
  // construction and only bites away from it.
  referenceTemp: 25,
  // Wiesmann's measured pair for the two guilds, and the gap between them is
  // the point: NOB are the fussier about oxygen by a factor of nearly four, so
  // a tank short of air oxidises its ammonia long after it has stopped clearing
  // the nitrite that ammonia becomes. Standing nitrite in a poorly aerated tank
  // is a thing keepers see, and this is where it comes from.
  aobOxygenHalfSaturation: AOB_OXYGEN_HALF_SATURATION,
  nobOxygenHalfSaturation: NOB_OXYGEN_HALF_SATURATION,
};

export interface NitrogenCycleConfigMeta {
  key: keyof NitrogenCycleConfig;
  label: string;
  unit: string;
  step: number;
  /** Absent on the rates below, which are derived rather than bounded. */
  min?: number;
  max?: number;
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
  { key: 'inoculumPerLiter', label: 'Inoculum', unit: 'units/L', step: 0.005 },
  { key: 'aobGrowthRate', label: 'AOB Growth Rate', unit: '/tick', step: 0.0001 },
  { key: 'nobGrowthRate', label: 'NOB Growth Rate', unit: '/tick', step: 0.0001 },
  { key: 'bacteriaPerCm2', label: 'Max Bacteria per cm²', unit: 'units/cm²', step: 0.5 },
  { key: 'bacteriaDeathRate', label: 'Bacteria Death Rate', unit: '/tick', step: 0.00001 },
  { key: 'q10', label: 'Nitrification Q10', unit: '', step: 0.1 },
  { key: 'referenceTemp', label: 'Nitrification Reference Temp', unit: '°C', step: 1 },
  { key: 'aobOxygenHalfSaturation', label: 'AOB O2 Half-Saturation', unit: 'mg/L', min: 0.05, max: 3, step: 0.05 },
  { key: 'nobOxygenHalfSaturation', label: 'NOB O2 Half-Saturation', unit: 'mg/L', min: 0.05, max: 3, step: 0.05 },
];
