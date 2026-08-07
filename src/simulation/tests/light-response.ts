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
import { getSaturationIrradiance, PLANT_SPECIES_DATA } from '../plants/species.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { nutrientsDefaults } from '../config/nutrients.js';
import { plantsDefaults } from '../config/plants.js';
import { lightSaturationFactor } from '../core/kinetics.js';
import { calculateNutrientSufficiency } from '../systems/nutrients.js';
import { buildPlantStressors } from '../systems/plant-vitality.js';
import { settleEnvironment } from '../tick.js';
import { getPpm } from '../resources/index.js';
import { gasCurve, runTank, totalSize, type GasCurve } from './metrics.js';
import { fixtureFor, substrateFor } from './tanks.js';
import { formatTable, tuned } from './sweep.js';

const RNG_SEED = 4242;
const CAPACITY = 150;
const SHADE_CAPACITY = 40;

/**
 * The rating on the anchor's fixture. Every other light in this probe is solved
 * for a substrate reading through `fixtureFor`; this one is quoted the way
 * `tests/planted-gas-budget.test.ts` quotes it, at the surface.
 */
const GROWN_IN_FIXTURE = 90;

/**
 * The tank `co2PerRateUnit` was pinned on in
 * `docs/calibration/runs/2026-08-06-gas-volume-stoichiometry.md`: 150 L,
 * canister, aqua soil, a 90 PAR fixture on a 12 h photoperiod, carbon 10 h a
 * day, dosed, topped up. What the planting stands in is what the water above
 * the bed leaves of that — see {@link termOut}, which reads it off the optics.
 */
const GROWN_IN: SimulationConfig = {
  tankCapacity: CAPACITY,
  heater: { enabled: true, targetTemperature: 25, wattage: 150 },
  filter: { enabled: true, type: 'canister' },
  substrate: { type: 'aqua_soil' },
  light: { enabled: true, par: GROWN_IN_FIXTURE, schedule: { startHour: 8, duration: 12 } },
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

/** Mean condition of the planting a run is left with; 0 when nothing survived. */
const conditionOf = (state: SimulationState): number =>
  state.plants.length === 0
    ? 0
    : state.plants.reduce((sum, plant) => sum + plant.condition, 0) / state.plants.length;

/**
 * Every stressor charging a plant this hour, by label.
 *
 * Built from the inputs `processPlants` hands the vitality engine, off
 * `settleEnvironment` — the hour the tick ran — and off the algae mass the
 * plants meet, which is the previous hour's, because algae runs after plants.
 * A claim about which channel took a planting down is worth more measured than
 * reasoned about, and this is what measures it.
 */
function charged(state: SimulationState, config: TunableConfig): string[] {
  return state.plants.flatMap((plant) =>
    buildPlantStressors({
      plant,
      resources: state.resources,
      waterVolume: state.resources.water,
      plantsConfig: config.plants,
      nutrientSufficiency: calculateNutrientSufficiency(
        state.resources,
        state.resources.water,
        plant.species,
        config.nutrients
      ),
      algaeMass: state.algae.mass,
    })
      .filter((stressor) => stressor.amount > 0)
      .map((stressor) => stressor.label)
  );
}

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
 *
 * The roster above the table is why the difference is as small as it is: the
 * fixture's rating is not what the plants stand in, and where each species sits
 * on its own curve at the reading they do stand in decides how much taking the
 * term out can give back.
 */
function termOut(): string {
  const substrate = substrateFor(GROWN_IN_FIXTURE, CAPACITY);
  const roster = formatTable(
    (FRESH.plants ?? []).map(({ species, count }) => {
      const ik = getSaturationIrradiance(species, DEFAULT_CONFIG.plants);
      return {
        species: PLANT_SPECIES_DATA[species].name,
        count,
        Ik: ik,
        response: lightSaturationFactor(substrate, ik),
      };
    })
  );

  const table = formatTable(
    [0, plantsDefaults.saturationIrradianceFactor].map((factor) => {
      const curve = curveOf({
        setup: GROWN_IN,
        seed: FRESH,
        days: 90,
        config: tuned((draft) => {
          draft.plants.saturationIrradianceFactor = factor;
        }),
      });
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
        cond: conditionOf(final),
      };
    })
  );

  return (
    `a fixture rated ${GROWN_IN_FIXTURE} PAR lands ${substrate.toFixed(2)} at this tank's` +
    ` substrate, where the planting sits like this:\n\n${roster}\n\n${table}`
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
  /** Given, collects the label of every stressor that ever charges a plant. */
  stressors?: Set<string>;
}

interface Grown {
  size: number;
  /** Mean condition of whatever planting is left, off the same state as `size`. */
  condition: number;
  /** The heaviest bloom the tank carried getting there. */
  algae: number;
  /** Day the first plant died, or null if the planting held. */
  died: number | null;
}

/** What 60 days under one fixture leaves of a planting. */
function grow({ setup, seed, config, hold, stressors }: GrowOptions): Grown {
  const { final, samples, plantDeaths } = runTank({
    setup,
    seed,
    days: 60,
    rngSeed: RNG_SEED,
    routine: { feed: 0.6, waterChange: 0.3, hold, config },
    watch:
      stressors === undefined
        ? undefined
        : (_hour, before): void => {
            for (const label of charged(settleEnvironment(before, config), config)) {
              stressors.add(label);
            }
          },
  });
  return {
    size: totalSize(final),
    condition: conditionOf(final),
    algae: Math.max(...samples.map((s) => s.algae)),
    died: plantDeaths[0]?.day ?? null,
  };
}

/** A death day as a table cell, or a dash for a planting that held. */
const dayLabel = (day: number | null): string => (day === null ? '—' : `d${day.toFixed(1)}`);

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
 *
 * The pair of them is also the counterfactual for the deaths at the bright end,
 * which is why the condition and the death day sit beside each size. And
 * `stressors` is what makes the reading of those deaths a measurement rather
 * than an argument: every stressor that charged any plant at any hour of the
 * shipped run on that row, named.
 */
function doseTable(species: PlantSpecies, bandHigh: number): string {
  const ik = getSaturationIrradiance(species, DEFAULT_CONFIG.plants);
  return formatTable(
    TARGETS.filter((target) => target <= bandHigh).map((subPar) => {
      const setup = withLight(GROWN_IN, fixtureFor(subPar, CAPACITY), 12);
      const seed = monoculture(species);
      const stressors = new Set<string>();
      const production = curveOf({ setup, seed, days: 3, hold: fed });
      const keeper = grow({ setup, seed, config: DEFAULT_CONFIG, hold: fed, stressors });
      const unshaded = grow({ setup, seed, config: NO_SHADING, hold: fed });

      return {
        subPAR: subPar,
        'PAR/Ik': subPar / ik,
        gross: production.gross,
        nitrateDraw: production.uptake,
        size60: keeper.size,
        cond60: keeper.condition,
        died: dayLabel(keeper.died),
        algae: keeper.algae,
        stressors: [...stressors].join(' + ') || 'none',
        noAlgae: unshaded.size,
        noAlgaeCond: unshaded.condition,
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

const ALGAE_TARGETS = [1, 5, 10, 20, 30, 50, 69, 70, 90, 120, 200];

/**
 * § 2c — the same ladder with no planting in the tank at all.
 *
 * Algae reads intensity through one channel — `excess_light`, zero at or below
 * `lightExcessThreshold` — and gates growth on `light > 0` and nothing else. So
 * below that threshold a fixture is a switch rather than a dial, and this is
 * the measurement that says so: the dim end of the tables above is the plant
 * side of the comparison moving while the algae side stands still.
 */
function algaeAlone(): string {
  const shading = DEFAULT_CONFIG.plants.algaeShadingThreshold;
  return formatTable(
    ALGAE_TARGETS.map((subPar) => {
      const { samples } = runTank({
        setup: withLight(GROWN_IN, fixtureFor(subPar, CAPACITY), 12),
        seed: { bacteria: 'cycled' },
        days: 60,
        rngSeed: RNG_SEED,
        routine: { feed: 0.6, waterChange: 0.3, hold: fed, config: DEFAULT_CONFIG },
      });
      const crossed = samples.find((sample) => sample.algae > shading);
      return {
        subPAR: subPar,
        peakAlgae: Math.max(...samples.map((sample) => sample.algae)),
        'crosses shading': crossed === undefined ? '—' : `d${crossed.day.toFixed(1)}`,
      };
    })
  );
}

/** `main` reproduced for these rows: the light award paid inside the band only. */
const NO_BENEFIT = tuned((draft) => {
  draft.plants.algaeShadingThreshold = Number.MAX_SAFE_INTEGER;
  draft.plants.lightBenefitPeak = 0;
});

/** Species and substrate PAR, each well past where the species' band closes. */
const ABOVE_BAND: Array<[PlantSpecies, number]> = [
  ['java_fern', 300],
  ['amazon_sword', 250],
  ['anubias', 300],
  ['monte_carlo', 300],
  ['anubias', 100],
];

/**
 * § 2d — what the light benefit is worth above the band it used to stop at.
 *
 * `main` awarded `lightBenefitPeak` only inside `tolerableLight`; this branch
 * awards `peak × tanh(PAR / Ik)`, and by the top of any species' band that term
 * is within half a percent of 1 — so a plant `lightExcessiveSeverity` is burning
 * now draws its full income while it burns. The `peak 0` row of each pair is
 * `main` for these rows exactly, and the distance between the two is the
 * change. Algae shading is out of reach on both, so what moves is the light.
 */
function benefitAboveBand(): string {
  return formatTable(
    ABOVE_BAND.flatMap(([species, subPar]) => {
      const setup = withLight(LOW_TECH, fixtureFor(subPar, SHADE_CAPACITY), 12);
      const seed = monoculture(species);
      return [DEFAULT_CONFIG.plants.lightBenefitPeak, 0].map((peak) => {
        const run = grow({
          setup,
          seed,
          config: peak === 0 ? NO_BENEFIT : NO_SHADING,
          hold: fed,
        });
        return {
          species: PLANT_SPECIES_DATA[species].name,
          bandHigh: PLANT_SPECIES_DATA[species].tolerableLight[1],
          subPAR: subPar,
          lightBenefitPeak: peak,
          size60: run.size,
          cond60: run.condition,
          died: dayLabel(run.died),
        };
      });
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
  ['the same ladder with no planting in the tank, water held', algaeAlone],
  ['the light benefit above the band, against a benefit of 0', benefitAboveBand],
  ['matched daily light integral, java fern, water held', (): string => dliTrade('java_fern')],
];

for (const [label, section] of SECTIONS) {
  process.stdout.write(`\n— ${label} —\n${section()}\n`);
}
