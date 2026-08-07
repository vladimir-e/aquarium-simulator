/**
 * The light response, and what it does to the carbon yield.
 *
 * Three questions, in the order they have to be answered. Where does
 * `co2PerRateUnit` sit now that a rate unit is no longer quoted against light
 * nobody was reading? Does a brighter fixture buy more, and does it stop buying?
 * And what becomes of the daily-light-integral trade the photoperiod used to win
 * on its own. Run it:
 *
 *     npm run probe:light-response
 */

import { produce } from 'immer';
import { calculateTankHeight, type SimulationConfig, type SimulationState } from '../state.js';
import { calculateParAtDepth } from '../equipment/light.js';
import { opticsDefaults } from '../config/optics.js';
import type { PresetSeed } from '../seed.js';
import type { PlantSpecies } from '../plants/species.js';
import { getSaturationIrradiance } from '../plants/species.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { nutrientsDefaults } from '../config/nutrients.js';
import { plantsDefaults } from '../config/plants.js';
import { processPlants } from '../plants/index.js';
import { getPpm } from '../resources/index.js';
import { runTank } from './metrics.js';
import { DAY } from './tanks.js';
import { formatTable, tuned } from './sweep.js';

const RNG_SEED = 4242;
const CAPACITY = 150;

/**
 * The tank `co2PerRateUnit` was pinned on in
 * `docs/calibration/runs/2026-08-06-gas-volume-stoichiometry.md`: 150 L,
 * canister, aqua soil, 90 PAR on a 12 h photoperiod, carbon 10 h a day, dosed,
 * topped up.
 */
const GROWN_IN: SimulationConfig = {
  tankCapacity: CAPACITY,
  heater: { enabled: true, targetTemperature: 25, wattage: 150 },
  filter: { enabled: true, type: 'canister' },
  substrate: { type: 'aqua_soil' },
  light: { enabled: true, par: 90, schedule: { startHour: 8, duration: 12 } },
  co2Generator: { enabled: true, bubbleRate: 2, schedule: { startHour: 8, duration: 10 } },
  autoDoser: { enabled: true, doseAmountMl: 3, schedule: { startHour: 8, duration: 1 } },
  ato: { enabled: true },
};

/** The planting that run grew from: 350 total size across four species. */
const FRESH: PresetSeed = {
  bacteria: 'cycled',
  fish: [{ species: 'neon_tetra', count: 12, sex: 'female' }],
  plants: [
    { species: 'amazon_sword', count: 3, size: 35 },
    { species: 'monte_carlo', count: 4, size: 35 },
    { species: 'java_fern', count: 2, size: 35 },
    { species: 'anubias', count: 1, size: 35 },
  ],
};

/**
 * What `tests/planted-gas-budget.test.ts` reads the same claim off: 982 total
 * size handed over at tick 0 as two species rather than grown from a planting.
 */
const SETTLED: PresetSeed = {
  bacteria: 'cycled',
  fish: [{ species: 'neon_tetra', count: 12, sex: 'female' }],
  plants: [
    { species: 'amazon_sword', count: 3, size: 164 },
    { species: 'java_fern', count: 3, size: 163 },
  ],
};

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const totalSize = (state: SimulationState): number =>
  state.plants.reduce((sum, plant) => sum + plant.size, 0);

const depth = calculateTankHeight(CAPACITY);

/**
 * The fixture that lands `target` PAR on this substrate. Attenuation is linear
 * in the fixture, so the reading a 1 PAR fixture lands is the whole ratio.
 */
const fixtureFor = (target: number): number =>
  target / calculateParAtDepth(1, depth, opticsDefaults);

const withLight = (setup: SimulationConfig, par: number, duration: number): SimulationConfig => ({
  ...setup,
  light: { enabled: par > 0, par, schedule: { startHour: 8, duration } },
});

/**
 * How far off the grown-in planting an hour may be read and still count, as a
 * share of it.
 */
const SETTLED_TOLERANCE = 0.1;

interface GasReading {
  /** Mean gross oxygen photosynthesis releases in a lit hour of the window, mg/L. */
  gross: number;
  /** Mean nitrate the same hours draw, mg. */
  uptake: number;
  o2High: number;
  o2Low: number;
  /** Mean fall across a night, dusk to first light, mg/L. */
  giveBack: number;
  /** Mean total plant size across the hours the window kept. */
  size: number;
  /** Lit hours read, of the lit hours the run offered. */
  hours: number;
  fish: number;
  final: SimulationState;
  condition: number;
}

/** An hourly reading, tagged with the planting that produced it. */
interface Reading {
  value: number;
  size: number;
}

/**
 * Run a tank and read its gas curve off the lit hours where the planting is
 * grown-in — gross rather than net, since what the yield is quoted on is what
 * photosynthesis makes before the tank spends any of it.
 *
 * The window is taken on plant size rather than on a day, because this tank has
 * no plateau to take it on: it climbs from 350 the whole 90 days, and the ≈987
 * it is quoted at is where the run *ends* — after the monte carlos starve out
 * and hand their biomass back — not somewhere it settles. Gross oxygen is very
 * nearly linear in plant size, so a mean over the whole run is a mean over the
 * ramp and reads a tank half this one's size. What the observable names is a
 * grown-in tank, and the hours that answer it are the ones the planting is
 * grown-in for.
 */
function gasCurve(
  setup: SimulationConfig,
  seed: PresetSeed,
  days: number,
  config: TunableConfig = DEFAULT_CONFIG,
  hold?: (state: SimulationState) => SimulationState
): GasReading {
  const made: Reading[] = [];
  const drawn: Reading[] = [];
  const falls: Reading[] = [];
  let o2High = -Infinity;
  let o2Low = Infinity;
  let dusk: number | null = null;

  const { final, samples } = runTank({
    setup,
    seed,
    days,
    rngSeed: RNG_SEED,
    routine: { feed: 0.6, waterChange: 0.3, config, hold },
    watch: (hour, before, after) => {
      if (hour <= 2 * DAY) return;
      o2High = Math.max(o2High, after.resources.oxygen);
      o2Low = Math.min(o2Low, after.resources.oxygen);
      if (before.resources.light <= 0) {
        dusk ??= before.resources.oxygen;
        return;
      }
      const { effects } = processPlants(before, config);
      const off = (resource: string): number =>
        effects.find((e) => e.resource === resource && e.source === 'photosynthesis')?.delta ?? 0;
      const size = totalSize(before);
      made.push({ value: off('oxygen'), size });
      drawn.push({ value: -off('nitrate'), size });
      if (dusk !== null) {
        falls.push({ value: dusk - before.resources.oxygen, size });
        dusk = null;
      }
    },
  });

  const grownIn = totalSize(final);
  const isSettled = (r: Reading): boolean =>
    Math.abs(r.size - grownIn) <= SETTLED_TOLERANCE * grownIn;
  const settled = (readings: readonly Reading[]): number[] =>
    readings.filter(isSettled).map((r) => r.value);
  const lit = made.filter(isSettled);

  return {
    gross: mean(lit.map((r) => r.value)),
    uptake: mean(settled(drawn)),
    o2High,
    o2Low,
    giveBack: mean(settled(falls)),
    size: mean(lit.map((r) => r.size)),
    hours: lit.length,
    fish: final.fish.length,
    final,
    condition: samples[samples.length - 1]?.avgCondition ?? 0,
  };
}

const YIELDS = [10, 20, 30, 32, 35, 40, 45, 50, 57, 60, 80];

/** § 1 — the yield sweep, against the observable 2b pinned the constant on. */
function yieldSweep(seed: PresetSeed, days: number): string {
  return formatTable(
    YIELDS.map((co2PerRateUnit) => {
      const curve = gasCurve(
        GROWN_IN,
        seed,
        days,
        tuned((draft) => {
          draft.plants.co2PerRateUnit = co2PerRateUnit;
        })
      );
      return {
        yield: co2PerRateUnit,
        gross: curve.gross,
        o2High: curve.o2High,
        o2Low: curve.o2Low,
        giveBack: curve.giveBack,
        size: curve.size,
        hours: curve.hours,
        fish: curve.fish,
      };
    })
  );
}

/**
 * § 1b — what the term costs the water column, at the shipped yield.
 *
 * `saturationIrradianceFactor` at 0 is the curve taken out — every species
 * saturates at no light at all, so the response reads 1 everywhere and the tank
 * is the one 2b measured. Beside it, the same tank with the curve in.
 */
function termOut(): string {
  return formatTable(
    [0, plantsDefaults.saturationIrradianceFactor].map((factor) => {
      const curve = gasCurve(
        GROWN_IN,
        FRESH,
        90,
        tuned((draft) => {
          draft.plants.saturationIrradianceFactor = factor;
        })
      );
      const { final } = curve;
      const { water } = final.resources;

      return {
        Ik: factor === 0 ? 'out' : `×${factor}`,
        gross: curve.gross,
        uptake: curve.uptake,
        no3: getPpm(final.resources.nitrate, water),
        po4: getPpm(final.resources.phosphate, water),
        size90: totalSize(final),
        plants: final.plants.length,
        cond: curve.condition,
      };
    })
  );
}

/**
 * Carbon and nutrients pinned well past where either limits the rate, so what a
 * run varies is the light and nothing else.
 */
const fed = (state: SimulationState): SimulationState =>
  produce(state, (draft) => {
    const { water } = draft.resources;
    draft.resources.co2 = plantsDefaults.optimalCo2;
    draft.resources.nitrate = nutrientsDefaults.optimalNitratePpm * water * 3;
    draft.resources.phosphate = nutrientsDefaults.optimalPhosphatePpm * water * 3;
    draft.resources.potassium = nutrientsDefaults.optimalPotassiumPpm * water * 3;
    draft.resources.iron = nutrientsDefaults.optimalIronPpm * water * 3;
  });

/** One species, four plants, in the same box under a solved-for fixture. */
const monoculture = (species: PlantSpecies): PresetSeed => ({
  bacteria: 'cycled',
  plants: [{ species, count: 4, size: 35 }],
});

const TARGETS = [5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 120, 160, 200];

/**
 * Algae shading put out of reach, so a run reads the light response on the
 * plant alone. The stressor is the only channel by which one plant's light
 * reaches another organism's condition, and at these fixtures it is loud enough
 * to bury what the rate is doing.
 */
const NO_SHADING = tuned((draft) => {
  draft.plants.algaeShadingThreshold = Number.MAX_SAFE_INTEGER;
});

/** Growth over 60 days, and the heaviest bloom the tank carried getting there. */
function grow(
  setup: SimulationConfig,
  species: PlantSpecies,
  config: TunableConfig
): { size: number; algae: number } {
  const { final, samples } = runTank({
    setup,
    seed: monoculture(species),
    days: 60,
    rngSeed: RNG_SEED,
    routine: { feed: 0.6, waterChange: 0.3, hold: fed, config },
  });
  return { size: totalSize(final), algae: Math.max(...samples.map((s) => s.algae)) };
}

/**
 * § 2 — the reachability check. Hold the schedule and the water, raise the
 * fixture, and read both what the planting makes and what it grows into.
 *
 * Swept within each species' tolerable band: past its upper bound the excess-PAR
 * stressor is the channel doing the work, and the question here is the rate.
 *
 * Growth is read twice because the light lands on two organisms. `size60` is
 * what a keeper gets — and it peaks and then falls, because the nutrients this
 * probe holds at three times optimal to isolate the light also feed an algae
 * bloom, and a bloom past `algaeShadingThreshold` shades the planting. `noAlgae`
 * is the same run with that one stressor out of reach, which is the light
 * response on its own: it rises and then flattens, and never falls.
 */
function doseTable(species: PlantSpecies, bandHigh: number): string {
  const ik = getSaturationIrradiance(species);
  return formatTable(
    TARGETS.filter((target) => target <= bandHigh).map((subPar) => {
      const setup = withLight(GROWN_IN, fixtureFor(subPar), 12);
      const production = gasCurve(setup, monoculture(species), 3, DEFAULT_CONFIG, fed);
      const keeper = grow(setup, species, DEFAULT_CONFIG);

      return {
        subPAR: subPar,
        'PAR/Ik': subPar / ik,
        gross: production.gross,
        nitrateDraw: production.uptake,
        size60: keeper.size,
        algae: keeper.algae,
        noAlgae: grow(setup, species, NO_SHADING).size,
      };
    })
  );
}

/**
 * § 3 — the daily-light-integral trade, re-measured. The same photons a day
 * spread differently: a long dim day against a short bright one, on one species,
 * with the water held so the reading is light and not the injector's schedule.
 */
function dliTrade(species: PlantSpecies): string {
  return formatTable(
    [
      { subPar: 25, hours: 24 },
      { subPar: 50, hours: 12 },
      { subPar: 100, hours: 6 },
      { subPar: 150, hours: 4 },
    ].map(({ subPar, hours }) => {
      const setup = withLight(GROWN_IN, fixtureFor(subPar), hours);
      const keeper = grow(setup, species, DEFAULT_CONFIG);

      return {
        subPAR: subPar,
        hours,
        dli: subPar * hours,
        size60: keeper.size,
        algae: keeper.algae,
        noAlgae: grow(setup, species, NO_SHADING).size,
      };
    })
  );
}

const SECTIONS: Array<[string, () => string]> = [
  ['the yield sweep — grown-in planted 150 L, 90 d', (): string => yieldSweep(FRESH, 90)],
  ["the anchor's own planting — 982 size at tick 0, 10 d", (): string => yieldSweep(SETTLED, 10)],
  ['the same tank with the curve taken out, 90 d', termOut],
  ['fixed photoperiod, java fern (Ik 20), water held', (): string => doseTable('java_fern', 90)],
  ['fixed photoperiod, monte carlo (Ik 60), water held', (): string => doseTable('monte_carlo', 200)],
  ['matched daily light integral, java fern, water held', (): string => dliTrade('java_fern')],
];

for (const [label, section] of SECTIONS) {
  process.stdout.write(`\n— ${label} —\n${section()}\n`);
}
