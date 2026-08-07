/**
 * What a planting costs the water over a whole day, and what it is worth.
 *
 * Photosynthesis reads carbon, light and Liebig sufficiency; respiration reads
 * none of them. So the only place the two rates can be compared is the tank —
 * measured over 24 h, in rate units, against the rate the plants actually run
 * rather than the one `basePhotosynthesisRate` names. Four questions, in the
 * order they have to be answered. What is the ratio, and is the planting in
 * credit or in debt? What reference is the constant a fraction of? Does a
 * planting help the fish or gas them? And where does that leave the carbon
 * yield the day side is pinned on? Run it:
 *
 *     npm run probe:plant-respiration
 */

import type { SimulationConfig } from '../state.js';
import type { PresetSeed } from '../seed.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { plantsDefaults } from '../config/plants.js';
import { gasExchangeDefaults } from '../config/gas-exchange.js';
import { processPlants } from '../plants/index.js';
import { calculateCo2Factor } from '../systems/photosynthesis.js';
import { settleEnvironment } from '../tick.js';
import { gasCurve, runTank, totalSize } from './metrics.js';
import { DAY, fixtureFor } from './tanks.js';
import { formatTable, tuned } from './sweep.js';

const RNG_SEED = 4242;

/** The rate the branch shipped with, and the one it ships. */
const WAS = 0.15;
const IS = plantsDefaults.baseRespirationRate;

// ── the tanks ────────────────────────────────────────────────────────────────

/**
 * The gate's own tank: a sealed, unfiltered 40 L (10.6 gal). No filter and a
 * full lid is the least gas exchange the engine offers, so what a planting does
 * to the oxygen has nowhere to hide — this is the tank the roster died in.
 */
const sealed = (par: number): SimulationConfig => ({
  tankCapacity: 40,
  heater: { enabled: true, targetTemperature: 25, wattage: 100 },
  filter: { enabled: false },
  substrate: { type: 'aqua_soil' },
  lid: { type: 'full' },
  ato: { enabled: true },
  light: { enabled: par > 0, par: fixtureFor(par, 40), schedule: { startHour: 8, duration: 12 } },
});

/** A tank on ambient carbon: canister, aqua soil, no injector and no doser. */
const lowTech = (capacity: number, par: number): SimulationConfig => ({
  tankCapacity: capacity,
  heater: { enabled: true, targetTemperature: 25, wattage: Math.max(100, capacity) },
  filter: { enabled: true, type: 'canister' },
  substrate: { type: 'aqua_soil' },
  ato: { enabled: true },
  light: {
    enabled: true,
    par: fixtureFor(par, capacity),
    schedule: { startHour: 8, duration: 12 },
  },
});

/**
 * The tank the carbon yield is pinned on, from
 * `docs/calibration/runs/2026-08-06-gas-volume-stoichiometry.md`: 150 L, 90 PAR
 * on a 12 h photoperiod, carbon 10 h a day, dosed, topped up.
 */
const INJECTED: SimulationConfig = {
  ...lowTech(150, 90),
  light: { enabled: true, par: 90, schedule: { startHour: 8, duration: 12 } },
  co2Generator: { enabled: true, bubbleRate: 2, schedule: { startHour: 8, duration: 10 } },
  autoDoser: { enabled: true, doseAmountMl: 3, schedule: { startHour: 8, duration: 1 } },
};

/** The gate's planting: five plants at size 60, 300 total, java fern and anubias. */
const GATE_PLANTING: PresetSeed['plants'] = [
  { species: 'java_fern', count: 3, size: 60 },
  { species: 'anubias', count: 2, size: 60 },
];

/** The gate's roster. */
const GATE_FISH: NonNullable<PresetSeed['fish']> = [
  { species: 'neon_tetra', count: 8, sex: 'female' },
];

/** 982 total plant size handed over at tick 0 — the anchor's own planting. */
const SETTLED: PresetSeed = {
  bacteria: 'cycled',
  fish: [{ species: 'neon_tetra', count: 12, sex: 'female' }],
  plants: [
    { species: 'amazon_sword', count: 3, size: 164 },
    { species: 'java_fern', count: 3, size: 163 },
  ],
};

/** The planting the 150 L grew from: 350 total across four species. */
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

const at = (baseRespirationRate: number): TunableConfig =>
  tuned((draft) => {
    draft.plants.baseRespirationRate = baseRespirationRate;
  });

// ── § 1 — the budget, in rate units ──────────────────────────────────────────

interface Case {
  setup: SimulationConfig;
  seed: PresetSeed;
  days: number;
  feed: number;
  waterChange: number;
}

/**
 * A day of a tank reduced to the two rates that decide its oxygen, both in rate
 * units per 100 % plant size — the currency `co2PerRateUnit` is quoted in, so
 * the two are comparable whatever the yield.
 *
 * Read off the effects the tick applies rather than off the water afterwards:
 * the surface is moving the same stock in the same hour, and it moves most of it.
 */
interface Budget {
  /** Mean realised `co2Factor` across the lit hours — the carbon term. */
  carbon: number;
  /** Rate-unit-hours a day of photosynthesis, per 100 % size. */
  produced: number;
  /** Rate-unit-hours a day of respiration, per 100 % size — all 24 of them. */
  burnt: number;
  /** Their ratio. Above 1 the planting is in credit over the day. */
  ratio: number;
  /** Lowest oxygen any hour of the window closed on, mg/L. */
  o2Low: number;
  size: number;
  fish: number;
}

function budget({ setup, seed, days, feed, waterChange }: Case, config: TunableConfig): Budget {
  const plants = config.plants ?? plantsDefaults;
  let hours = 0;
  let lit = 0;
  let produced = 0;
  let burnt = 0;
  let carbon = 0;
  let o2Low = Infinity;

  const run = runTank({
    setup,
    seed,
    days,
    rngSeed: RNG_SEED,
    routine: { feed, waterChange, config },
    // The first days are the tank finding its footing; a budget read across
    // them is a budget of the transient.
    watch: (hour, before, after) => {
      if (hour <= 5 * DAY) return;
      const settled = settleEnvironment(before, config);
      const size = totalSize(settled);
      if (size <= 0) return;

      const { effects } = processPlants(settled, config);
      const co2Off = (source: string): number =>
        effects.find((e) => e.resource === 'co2' && e.source === source)?.delta ?? 0;
      const units = (ppm: number): number =>
        (ppm * settled.resources.water) / plants.co2PerRateUnit / (size / 100);

      hours += 1;
      o2Low = Math.min(o2Low, after.resources.oxygen);
      burnt += units(co2Off('respiration'));
      if (settled.resources.light > 0) {
        lit += 1;
        produced += units(-co2Off('photosynthesis'));
        carbon += calculateCo2Factor(settled.resources.co2, plants);
      }
    },
  });

  const perDay = (total: number): number => (hours === 0 ? 0 : (total / hours) * 24);
  return {
    carbon: lit === 0 ? 0 : carbon / lit,
    produced: perDay(produced),
    burnt: perDay(burnt),
    ratio: burnt === 0 ? Infinity : produced / burnt,
    o2Low,
    size: totalSize(run.final),
    fish: run.final.fish.length,
  };
}

const planted = (plants: PresetSeed['plants'], fish?: PresetSeed['fish']): PresetSeed => ({
  bacteria: 'cycled',
  fish,
  plants,
});

const BUDGET_CASES: Array<[string, Case]> = [
  [
    'sealed 40 L, 50 PAR, 8 neon',
    { setup: sealed(50), seed: planted(GATE_PLANTING, GATE_FISH), days: 20, feed: 0.2, waterChange: 0.25 },
  ],
  [
    'sealed 40 L, 10 PAR, 8 neon',
    { setup: sealed(10), seed: planted(GATE_PLANTING, GATE_FISH), days: 20, feed: 0.2, waterChange: 0.25 },
  ],
  [
    'low-tech 20 L, 50 PAR',
    { setup: lowTech(20, 50), seed: planted(GATE_PLANTING), days: 20, feed: 0.2, waterChange: 0.25 },
  ],
  [
    'low-tech 40 L, 50 PAR',
    { setup: lowTech(40, 50), seed: planted(GATE_PLANTING), days: 20, feed: 0.2, waterChange: 0.25 },
  ],
  [
    'low-tech 150 L, 90 PAR, 982 size',
    { setup: lowTech(150, 90), seed: SETTLED, days: 10, feed: 0.6, waterChange: 0.3 },
  ],
  [
    'low-tech 300 L, 90 PAR, 982 size',
    { setup: lowTech(300, 90), seed: SETTLED, days: 10, feed: 0.6, waterChange: 0.3 },
  ],
  ['injected 150 L, 90 PAR, 982 size', { setup: INJECTED, seed: SETTLED, days: 10, feed: 0.6, waterChange: 0.3 }],
];

/** § 1 — the same tanks on both rates, so the defect and the fix read side by side. */
function budgets(rate: number): string {
  return formatTable(
    BUDGET_CASES.map(([tank, options]) => {
      const b = budget(options, at(rate));
      return {
        tank,
        co2Factor: b.carbon,
        'produced/d': b.produced,
        'burnt/d': b.burnt,
        'P:R': b.ratio,
        o2Low: b.o2Low,
        size: b.size,
        fish: b.fish,
      };
    })
  );
}

// ── § 2 — the reference the constant is a fraction of ────────────────────────

/**
 * § 2 — what a rate unit is worth in the water a plant actually stands in.
 *
 * `basePhotosynthesisRate` is the rate at `optimalCo2`, which is an injected
 * tank's carbon; `atmosphericCo2` is where an aquarium without an injector
 * equilibrates. Their ratio is the ceiling the literature's dark-respiration
 * fraction is quoted against, and it is the reference the constant belongs to.
 *
 * Measured beside it, the carbon each tank realises — on both rates, because
 * respiration is itself one of the tank's carbon sources and so the reference
 * moves a little with the constant. The config-derived ceiling does not, which
 * is why it is the one the derivation rests on.
 */
function reference(): string {
  const ceiling =
    calculateCo2Factor(gasExchangeDefaults.atmosphericCo2, plantsDefaults) *
    plantsDefaults.basePhotosynthesisRate;

  const rows = BUDGET_CASES.map(([tank, options]) => ({
    tank,
    'co2Factor was': budget(options, at(WAS)).carbon,
    'co2Factor is': budget(options, at(IS)).carbon,
  }));

  return (
    `atmospheric CO2 ${gasExchangeDefaults.atmosphericCo2} mg/L against an optimum of` +
    ` ${plantsDefaults.optimalCo2} → a ceiling of ${ceiling.toFixed(3)} rate units/h.\n` +
    `${WAS} is ${((WAS / ceiling) * 100).toFixed(0)} % of it; ${IS} is` +
    ` ${((IS / ceiling) * 100).toFixed(0)} %, and ${(
      (IS / plantsDefaults.basePhotosynthesisRate) *
      100
    ).toFixed(0)} % of the injected-carbon rate the old fraction was quoted against.\n\n` +
    formatTable(rows)
  );
}

// ── § 3 — the acid test ──────────────────────────────────────────────────────

const LADDER = [10, 20, 30, 50, 70, 90, 120];

interface Survival {
  fish: number;
  firstDeath: string | null;
  o2Low: number;
  size: number;
}

/**
 * The gate's scenario, run to the day it was run to: a sealed unfiltered 40 L,
 * eight female neon tetras, 0.2 g/day, a 25 % change a week, 60 days.
 */
function survival(par: number, config: TunableConfig, plants?: PresetSeed['plants']): Survival {
  let o2Low = Infinity;
  let firstDeath: number | null = null;

  const run = runTank({
    setup: sealed(par),
    seed: planted(plants, GATE_FISH),
    days: 60,
    rngSeed: RNG_SEED,
    routine: { feed: 0.2, waterChange: 0.25, config },
    watch: (hour, _before, after) => {
      o2Low = Math.min(o2Low, after.resources.oxygen);
      if (firstDeath === null && after.fish.length < GATE_FISH.length) firstDeath = hour;
    },
  });

  return {
    fish: run.final.fish.length,
    firstDeath: firstDeath === null ? null : `d${(firstDeath / DAY).toFixed(1)}`,
    o2Low,
    size: totalSize(run.final),
  };
}

/**
 * § 3 — planting a tank has to help the fish in it. The bare tank is the
 * control the planted rows have to beat, not merely survive: an oxygen floor
 * below the empty box's is a planting the keeper would be better off without.
 */
function acidTest(): string {
  const bare = survival(50, DEFAULT_CONFIG);
  return formatTable([
    { par: '— no plants —', fish: bare.fish, firstDeath: bare.firstDeath, o2Low: bare.o2Low, size: bare.size },
    ...LADDER.flatMap((par) =>
      [WAS, IS].map((rate) => {
        const s = survival(par, at(rate), GATE_PLANTING);
        return { par: `${par} PAR, resp ${rate}`, fish: s.fish, firstDeath: s.firstDeath, o2Low: s.o2Low, size: s.size };
      })
    ),
  ]);
}

// ── § 4 — the carbon yield, re-derived ───────────────────────────────────────

const YIELDS = [10, 15, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 35, 40];

/**
 * § 4 — the band `co2PerRateUnit` has to sit in, read on the corrected engine.
 * Gross has to clear 0.5 mg/L/h and the dark hours have to give back under 2.
 */
function yieldSweep(seed: PresetSeed, days: number): string {
  return formatTable(
    YIELDS.map((co2PerRateUnit) => {
      const curve = gasCurve({
        setup: INJECTED,
        seed,
        days,
        rngSeed: RNG_SEED,
        routine: {
          feed: 0.6,
          waterChange: 0.3,
          config: tuned((draft) => {
            draft.plants.co2PerRateUnit = co2PerRateUnit;
          }),
        },
      });
      return {
        yield: co2PerRateUnit,
        gross: curve.gross,
        giveBack: curve.giveBack,
        o2High: curve.o2High,
        o2Low: curve.o2Low,
        size: curve.size,
        hours: curve.hours,
        fish: curve.final.fish.length,
      };
    })
  );
}

/**
 * § 4b — how much of the anchor's dark-hours fall belongs to the planting at
 * all. Respiration taken from the shipped rate down to nothing: what moves is
 * the level the whole curve sits at, not the distance it falls overnight, and
 * that is the answer to whether the give-back is a respiration measurement.
 */
function nightShare(): string {
  return formatTable(
    [WAS, 0.1, 0.05, IS, 0.01, 0].map((rate) => {
      const curve = gasCurve({
        setup: INJECTED,
        seed: SETTLED,
        days: 10,
        rngSeed: RNG_SEED,
        routine: { feed: 0.6, waterChange: 0.3, config: at(rate) },
      });
      return {
        resp: rate,
        gross: curve.gross,
        giveBack: curve.giveBack,
        o2High: curve.o2High,
        o2Low: curve.o2Low,
      };
    })
  );
}

const SECTIONS: Array<[string, () => string]> = [
  [`the 24 h budget at the rate that shipped, ${WAS}`, (): string => budgets(WAS)],
  [`the same tanks at ${IS}`, (): string => budgets(IS)],
  ['what the fraction is a fraction of', reference],
  ["the gate's sealed 40 L across the PAR ladder, 60 d", acidTest],
  ["the carbon yield on the anchor's planting, 10 d", (): string => yieldSweep(SETTLED, 10)],
  ['the same, grown in from 350 over 90 d', (): string => yieldSweep(FRESH, 90)],
  ["how much of the anchor's night is the planting", nightShare],
];

for (const [label, section] of SECTIONS) {
  process.stdout.write(`\n— ${label} —\n${section()}\n`);
}
