/**
 * The light response, and what it does to the carbon yield.
 *
 * Three questions, in the order they have to be answered. Where does
 * `co2PerRateUnit` sit when a rate unit is an hour at saturating light? Does a
 * brighter fixture buy more, and does it stop buying? And which way does the
 * daily-light-integral trade fall — a long dim day against a short bright one?
 * Run it:
 *
 *     npm run probe:light-response
 */

import { produce } from 'immer';
import type { SimulationConfig, SimulationState } from '../state.js';
import type { PresetSeed } from '../seed.js';
import type { PlantSpecies } from '../plants/species.js';
import { getSaturationIrradiance } from '../plants/species.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { nutrientsDefaults } from '../config/nutrients.js';
import { plantsDefaults } from '../config/plants.js';
import { getPpm } from '../resources/index.js';
import { gasCurve, runTank, totalSize, type GasCurve } from './metrics.js';
import { fixtureFor } from './tanks.js';
import { formatTable, tuned } from './sweep.js';

const RNG_SEED = 4242;
const CAPACITY = 150;
const SHADE_CAPACITY = 40;

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

const withLight = (setup: SimulationConfig, par: number, duration: number): SimulationConfig => ({
  ...setup,
  light: { enabled: par > 0, par, schedule: { startHour: 8, duration } },
});

interface CurveOptions {
  setup: SimulationConfig;
  seed: PresetSeed;
  days: number;
  config?: TunableConfig;
  hold?: (state: SimulationState) => SimulationState;
}

/** The keeper's routine every gas reading in this probe is taken under. */
const curveOf = ({ setup, seed, days, config = DEFAULT_CONFIG, hold }: CurveOptions): GasCurve =>
  gasCurve({
    setup,
    seed,
    days,
    rngSeed: RNG_SEED,
    routine: { feed: 0.6, waterChange: 0.3, config, hold },
  });

const YIELDS = [10, 20, 30, 32, 35, 40, 45, 50, 57, 60, 80];

/** § 1 — the yield sweep, against the observable 2b pinned the constant on. */
function yieldSweep(seed: PresetSeed, days: number): string {
  return formatTable(
    YIELDS.map((co2PerRateUnit) => {
      const curve = curveOf({
        setup: GROWN_IN,
        seed,
        days,
        config: tuned((draft) => {
          draft.plants.co2PerRateUnit = co2PerRateUnit;
        }),
      });
      return {
        yield: co2PerRateUnit,
        gross: curve.gross,
        o2High: curve.o2High,
        o2Low: curve.o2Low,
        sag: curve.sag,
        size: curve.size,
        hours: curve.hours,
        fish: curve.final.fish.length,
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
      const curve = curveOf({
        setup: GROWN_IN,
        seed: FRESH,
        days: 90,
        config: tuned((draft) => {
          draft.plants.saturationIrradianceFactor = factor;
        }),
      });
      const { final, samples } = curve;
      const { water } = final.resources;

      return {
        Ik: factor === 0 ? 'out' : `×${factor}`,
        gross: curve.gross,
        uptake: curve.uptake,
        no3: getPpm(final.resources.nitrate, water),
        po4: getPpm(final.resources.phosphate, water),
        size90: totalSize(final),
        plants: final.plants.length,
        cond: samples[samples.length - 1]!.avgCondition,
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

interface GrowOptions {
  setup: SimulationConfig;
  seed: PresetSeed;
  config: TunableConfig;
  hold?: (state: SimulationState) => SimulationState;
}

/** Growth over 60 days, and the heaviest bloom the tank carried getting there. */
function grow({ setup, seed, config, hold }: GrowOptions): { size: number; algae: number } {
  const { final, samples } = runTank({
    setup,
    seed,
    days: 60,
    rngSeed: RNG_SEED,
    routine: { feed: 0.6, waterChange: 0.3, hold, config },
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
  const ik = getSaturationIrradiance(species, DEFAULT_CONFIG.plants);
  return formatTable(
    TARGETS.filter((target) => target <= bandHigh).map((subPar) => {
      const setup = withLight(GROWN_IN, fixtureFor(subPar, CAPACITY), 12);
      const seed = monoculture(species);
      const production = curveOf({ setup, seed, days: 3, hold: fed });
      const keeper = grow({ setup, seed, config: DEFAULT_CONFIG, hold: fed });

      return {
        subPAR: subPar,
        'PAR/Ik': subPar / ik,
        gross: production.gross,
        nitrateDraw: production.uptake,
        size60: keeper.size,
        algae: keeper.algae,
        noAlgae: grow({ setup, seed, config: NO_SHADING, hold: fed }).size,
      };
    })
  );
}

/** A 40 L a keeper would actually build for shade plants: no injector, no doser. */
const LOW_TECH: SimulationConfig = {
  tankCapacity: SHADE_CAPACITY,
  heater: { enabled: true, targetTemperature: 25, wattage: 50 },
  filter: { enabled: true, type: 'canister' },
  substrate: { type: 'aqua_soil' },
  ato: { enabled: true },
};

/** Two java fern and two anubias — Ik 20 and 16 — and the fish that feed them. */
const SHADE: PresetSeed = {
  bacteria: 'cycled',
  fish: [{ species: 'neon_tetra', count: 6, sex: 'female' }],
  plants: [
    { species: 'java_fern', count: 2, size: 35 },
    { species: 'anubias', count: 2, size: 35 },
  ],
};

const SHADE_TARGETS = [2, 5, 10, 20, 30, 50, 70, 90, 120];

/**
 * § 2b — the dim end, on a planting that matches the light. The tables above
 * put a sun species under a fixture too dim for it and hold the water replete
 * while they do; the bloom that follows is the size of that mismatch, so a
 * planting without one has to read flat over the same stretch. The last two
 * rows are past 70 PAR, where the anubias band closes and algae's own light
 * channel opens — the arm that is a light response in either tank.
 */
function shadePairing(): string {
  return formatTable(
    SHADE_TARGETS.map((subPar) => {
      const setup = withLight(LOW_TECH, fixtureFor(subPar, SHADE_CAPACITY), 12);
      const keeper = grow({ setup, seed: SHADE, config: DEFAULT_CONFIG });

      return {
        subPAR: subPar,
        size60: keeper.size,
        algae: keeper.algae,
        noAlgae: grow({ setup, seed: SHADE, config: NO_SHADING }).size,
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
      const setup = withLight(GROWN_IN, fixtureFor(subPar, CAPACITY), hours);
      const seed = monoculture(species);
      const keeper = grow({ setup, seed, config: DEFAULT_CONFIG, hold: fed });

      return {
        subPAR: subPar,
        hours,
        dli: subPar * hours,
        size60: keeper.size,
        algae: keeper.algae,
        noAlgae: grow({ setup, seed, config: NO_SHADING, hold: fed }).size,
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
  ['fixed photoperiod, shade pairing in a low-tech 40 L', shadePairing],
  ['matched daily light integral, java fern, water held', (): string => dliTrade('java_fern')],
];

for (const [label, section] of SECTIONS) {
  process.stdout.write(`\n— ${label} —\n${section()}\n`);
}
