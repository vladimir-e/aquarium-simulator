/**
 * What a planting costs the water over a whole day, and what it is worth.
 *
 * Photosynthesis reads carbon, light and Liebig sufficiency; respiration reads
 * none of them. So the only place the two rates can be compared is the tank —
 * measured over 24 h, in rate units, against the rate the plants actually run
 * rather than the one `basePhotosynthesisRate` names. Five questions, in the
 * order they have to be answered. What is the ratio, and is the planting in
 * credit or in debt? What reference is the constant a fraction of? Does a
 * planting help the fish or gas them? Where does that leave the carbon yield
 * the day side is pinned on — and what, exactly, is the tank's overnight sag a
 * measurement of? Run it:
 *
 *     npm run probe:plant-respiration
 */

import { produce } from 'immer';
import { createSimulation, type SimulationConfig, type SimulationState } from '../state.js';
import type { PresetSeed } from '../seed.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { plantsDefaults } from '../config/plants.js';
import { gasExchangeDefaults } from '../config/gas-exchange.js';
import { applyEffects, type Effect, type EffectTier } from '../core/effects.js';
import { coreSystems } from '../systems/index.js';
import { calculatePassiveResources, processEquipment } from '../equipment/index.js';
import { processPlants } from '../plants/index.js';
import { processAlgae } from '../algae/index.js';
import { processLivestock } from '../livestock/index.js';
import { processBreeding } from '../livestock/breeding.js';
import { calculateCo2Factor } from '../systems/photosynthesis.js';
import { calculateO2Saturation } from '../systems/gas-exchange.js';
import { settleEnvironment } from '../tick.js';
import { gasCurve, runTank, totalSize, type GasCurve } from './metrics.js';
import { DAY, fixtureFor, keep, substrateFor } from './tanks.js';
import { formatTable, tuned } from './sweep.js';

const RNG_SEED = 4242;

/** The rate the branch shipped with, and the one it ships. */
const WAS = 0.15;
const IS = plantsDefaults.baseRespirationRate;

/** What the water holds at the temperature every tank here is held to, mg/L. */
const SATURATION = calculateO2Saturation(25, gasExchangeDefaults);

// ── the tanks ────────────────────────────────────────────────────────────────

/**
 * The gate's own tank: a sealed, unfiltered 40 L (10.6 gal). No filter and a
 * full lid is the least gas exchange the engine offers, so what a planting does
 * to the oxygen has nowhere to hide — this is the tank the roster died in.
 *
 * `par` is the reading at the substrate, and `fixtureFor` solves the fixture
 * that lands it.
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

/**
 * A tank on ambient carbon: canister, aqua soil, no injector and no doser.
 * `par` is the reading at the substrate, as it is for {@link sealed}.
 */
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

/** The anchor's fixture is a *rating*, and this is the tank it is rated on. */
const INJECTED_FIXTURE = 90;

/** What the water above the bed leaves of it — where the plants actually stand. */
const INJECTED_SUBSTRATE = substrateFor(INJECTED_FIXTURE, 150);

/**
 * The tank the carbon yield is pinned on, from
 * `docs/calibration/runs/2026-08-06-gas-volume-stoichiometry.md`: 150 L, carbon
 * 10 h a day, dosed, topped up, on a 12 h photoperiod.
 *
 * The `light` below overrides the one `lowTech` builds, and the two quote
 * different quantities: `lowTech`'s argument is a substrate reading, while this
 * `par` is a fixture rating — the convention
 * `tests/planted-gas-budget.test.ts` sets its own light by, and the reason this
 * tank is here at all. So this tank's plants stand in
 * {@link INJECTED_SUBSTRATE}, not in 90, and every label that prints it says so.
 */
const INJECTED: SimulationConfig = {
  ...lowTech(150, 90),
  light: { enabled: true, par: INJECTED_FIXTURE, schedule: { startHour: 8, duration: 12 } },
  co2Generator: { enabled: true, bubbleRate: 2, schedule: { startHour: 8, duration: 10 } },
  autoDoser: { enabled: true, doseAmountMl: 3, schedule: { startHour: 8, duration: 1 } },
};

/** What "PAR" means in a table that carries both conventions at once. */
const PAR_NOTE =
  `PAR is at the substrate, except the injected tank: its ${INJECTED_FIXTURE} is a fixture` +
  ` rating, and the water above the bed leaves ${INJECTED_SUBSTRATE.toFixed(1)} of it.`;

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
  const plants = config.plants;
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
  [
    `injected 150 L, ${INJECTED_FIXTURE} PAR fixture, 982 size`,
    { setup: INJECTED, seed: SETTLED, days: 10, feed: 0.6, waterChange: 0.3 },
  ],
];

/** § 1 — the same tanks on both rates, so the defect and the fix read side by side. */
function budgets(rate: number): string {
  return `${PAR_NOTE}\n\n${formatTable(
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
  )}`;
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

const YIELDS = [10, 15, 20, 22, 25, 27, 30, 35, 40, 45, 48, 50, 55, 60];

/**
 * § 4 — the band `co2PerRateUnit` has to sit in, read on the corrected engine.
 * Gross has to clear 0.5–1 mg/L/h and the tank has to sag 1–3 mg/L overnight.
 * `sag/gross` is beside them because it is what decides whether the second
 * band brackets the yield independently of the first.
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
        sag: curve.sag,
        'sag/gross': (curve.sag ?? NaN) / curve.gross,
        o2High: curve.o2High,
        'dusk % sat': (curve.o2High / SATURATION) * 100,
        o2Low: curve.o2Low,
        'dawn % sat': (curve.o2Low / SATURATION) * 100,
        size: curve.size,
        hours: curve.hours,
        fish: curve.final.fish.length,
      };
    })
  );
}

/** Oxygen a night moved, mg/L, by the source that moved it. */
type Ledger = Record<string, number>;

interface Night {
  /** Dusk oxygen minus first light's, mg/L — the quantity the anchor asserts. */
  fall: number;
  ledger: Ledger;
  dusk: number;
  dawn: number;
}

function collectSystemEffects(
  state: SimulationState,
  tier: EffectTier,
  config: TunableConfig
): Effect[] {
  return coreSystems
    .filter((system) => system.tier === tier)
    .flatMap((system) => system.update(state, config));
}

/**
 * One tick, mirrored from `tick.ts` stage for stage, with every oxygen delta
 * booked against the source that raised it — the engine applies effects but
 * keeps no ledger of them, and a decomposition is the only way to say what a
 * night is made of rather than what removing one sink does to it.
 *
 * Its first four stages are `settleEnvironment`'s body verbatim — clock,
 * passive resources, immediate tier, equipment — and that seam is the one to
 * keep it in step with; the rest follows `tick`'s own tier order.
 *
 * A mirror rots when the original moves, so `nights` below reads the engine's
 * own tick for the same hour and throws unless the two agree to 1e-9. That
 * check is what makes this safe to keep: it cannot drift quietly, only loudly.
 */
function tracedTick(
  state: SimulationState,
  config: TunableConfig
): { next: SimulationState; ledger: Ledger } {
  const ledger: Ledger = {};
  const book = (effects: Effect[]): Effect[] => {
    for (const effect of effects) {
      if (effect.resource === 'oxygen') {
        ledger[effect.source] = (ledger[effect.source] ?? 0) + effect.delta;
      }
    }
    return effects;
  };

  let settled = produce(state, (draft) => {
    draft.tick += 1;
    const passive = calculatePassiveResources(draft, config.optics);
    draft.resources.surface = passive.surface;
    draft.resources.flow = passive.flow;
    draft.resources.light = passive.light;
    draft.resources.aeration = passive.aeration;
  });
  settled = applyEffects(settled, book(collectSystemEffects(settled, 'immediate', config)), config);
  const equipment = processEquipment(settled, config);
  settled = applyEffects(equipment.state, book(equipment.effects), config);

  const plants = processPlants(settled, config);
  settled = applyEffects(plants.state, book(plants.effects), config);
  settled = processAlgae(settled, config).state;
  const livestock = processLivestock(settled, config);
  settled = applyEffects(livestock.state, book(livestock.effects), config);
  settled = processBreeding(settled, config, livestock.netByFishId).state;
  settled = applyEffects(settled, book(collectSystemEffects(settled, 'active', config)), config);
  settled = applyEffects(settled, book(collectSystemEffects(settled, 'passive', config)), config);

  return { next: settled, ledger };
}

/**
 * Every whole night a run contains, each booked by source.
 *
 * The night runs from the hour the lights went out to the water first light
 * opened on — the same bounds `gasCurve` measures the sag between, on the same
 * `keep` schedule, so the `fall` here and the assertion's figure are one
 * number. Unlike `gasCurve` this takes no window on plant size, which is what
 * lets it read a tank that has no planting to take one on: the controls the sag
 * floor is drawn against.
 */
function nights(
  setup: SimulationConfig,
  seed: PresetSeed,
  days: number,
  config: TunableConfig = DEFAULT_CONFIG
): Night[] {
  const measured: Night[] = [];
  let open: { dusk: number; ledger: Ledger } | null = null;

  keep(
    createSimulation(setup, seed, RNG_SEED),
    days,
    { feed: 0.6, waterChange: 0.3, config },
    (hour, before, after) => {
      const { next, ledger } = tracedTick(before, config);
      if (Math.abs(after.resources.oxygen - next.resources.oxygen) > 1e-9) {
        throw new Error(
          `the traced tick no longer mirrors the engine's at hour ${hour}:` +
            ` ${next.resources.oxygen} against ${after.resources.oxygen}`
        );
      }

      if (hour <= 2 * DAY) return;
      const lit = after.resources.light > 0;

      if (!lit && before.resources.light > 0) open = { dusk: before.resources.oxygen, ledger: {} };
      if (open === null) return;
      if (lit) {
        measured.push({
          fall: open.dusk - before.resources.oxygen,
          ledger: open.ledger,
          dusk: open.dusk,
          dawn: before.resources.oxygen,
        });
        open = null;
        return;
      }
      for (const [source, delta] of Object.entries(ledger)) {
        open.ledger[source] = (open.ledger[source] ?? 0) + delta;
      }
    }
  );

  return measured;
}

/**
 * § 4b — the anchor's night booked by source: every oxygen effect of every dark
 * hour, summed over the night the assertion measures.
 *
 * This is the direct answer to what the sag is made of, where § 4c is only the
 * counterfactual — and the two disagree, which is the finding. Removing a sink
 * does not remove its share of the fall, because the surface term is a
 * first-order relaxation toward saturation: oxygen respiration leaves standing
 * is oxygen the surface sheds instead.
 */
function nightBudget(): string {
  const measured = nights(INJECTED, SETTLED, 10);
  const sources = [...new Set(measured.flatMap((night) => Object.keys(night.ledger)))];
  const mean = (of: (night: Night) => number): number =>
    measured.reduce((sum, night) => sum + of(night), 0) / measured.length;
  const fall = mean((night) => night.fall);

  return (
    formatTable(
      measured.map((night, index) => ({
        night: index + 1,
        dusk: night.dusk,
        dawn: night.dawn,
        fall: night.fall,
        ...Object.fromEntries(sources.map((source) => [source, night.ledger[source] ?? 0])),
      }))
    ) +
    `\n\nmean fall ${fall.toFixed(3)} mg/L over ${measured.length} nights, of which\n` +
    sources
      .map((source) => {
        const booked = mean((night) => night.ledger[source] ?? 0);
        return `  ${source.padEnd(20)} ${booked.toFixed(4)}  ${((booked / -fall) * 100).toFixed(1)} %`;
      })
      .join('\n')
  );
}

/**
 * § 4c — how much of the anchor's dark-hours fall the planting can *move*.
 * Respiration taken from the shipped rate down to nothing: what moves is the
 * level the whole curve sits at, not the distance it falls overnight, and that
 * is the answer to whether the sag is a respiration measurement.
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
        sag: curve.sag,
        o2High: curve.o2High,
        o2Low: curve.o2Low,
      };
    })
  );
}

/**
 * § 4d — the controls the sag floor is drawn against: the anchor's own 150 L
 * with the planting thinned out from under it, down to none at all.
 *
 * A floor saying "a planted tank sags" is only worth the assertion if an
 * unplanted one does not, and that is a measurement rather than a premise.
 */
function sagControls(): string {
  const NO_INJECTOR: SimulationConfig = { ...INJECTED, co2Generator: { enabled: false } };
  const stocked = (plants?: PresetSeed['plants']): PresetSeed => ({
    bacteria: 'cycled',
    fish: SETTLED.fish,
    plants,
  });

  const CONTROLS: Array<[string, SimulationConfig, PresetSeed]> = [
    ['no planting, no injector', NO_INJECTOR, stocked()],
    ['no planting, injected', INJECTED, stocked()],
    ['one java fern at 60', NO_INJECTOR, stocked([{ species: 'java_fern', count: 1, size: 60 }])],
    ["the gate's 300, no injector", NO_INJECTOR, stocked(GATE_PLANTING)],
    ['982, no injector', NO_INJECTOR, SETTLED],
    ["982, injected — the anchor's tank", INJECTED, SETTLED],
  ];

  return formatTable(
    CONTROLS.map(([tank, setup, seed]) => {
      const measured = nights(setup, seed, 10);
      const mean = (of: (night: Night) => number): number =>
        measured.reduce((sum, night) => sum + of(night), 0) / measured.length;
      const dusk = mean((night) => night.dusk);
      const dawn = mean((night) => night.dawn);
      return {
        tank,
        sag: mean((night) => night.fall),
        dusk,
        'dusk % sat': (dusk / SATURATION) * 100,
        dawn,
        'dawn % sat': (dawn / SATURATION) * 100,
      };
    })
  );
}

const yieldAt = (co2PerRateUnit: number): TunableConfig =>
  tuned((draft) => {
    draft.plants.co2PerRateUnit = co2PerRateUnit;
  });

// ── § 4e — where each band edge actually falls ───────────────────────────────

/** What a band reads a run against, and the value it has to reach. */
const BAND_EDGES: Array<[string, (curve: GasCurve) => number, number]> = [
  ['gross ≥ 0.5', (curve): number => curve.gross, 0.5],
  ['sag ≥ 1', (curve): number => curve.sag ?? NaN, 1],
  ['sag ≤ 3', (curve): number => curve.sag ?? NaN, 3],
  ['gross ≤ 1', (curve): number => curve.gross, 1],
];

/**
 * § 4e — the yield at which each edge is met, bisected rather than read off the
 * grid above. Every reading here rises monotonically in the yield, which is
 * what makes a bisection the right instrument and the grid only an illustration.
 */
function bandEdges(): string {
  const yieldWhere = (
    seed: PresetSeed,
    days: number,
    read: (curve: GasCurve) => number,
    target: number
  ): number => {
    let low = 5;
    let high = 90;
    while (high - low > 0.05) {
      const mid = (low + high) / 2;
      const curve = gasCurve({
        setup: INJECTED,
        seed,
        days,
        rngSeed: RNG_SEED,
        routine: { feed: 0.6, waterChange: 0.3, config: yieldAt(mid) },
      });
      if (read(curve) < target) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  };

  return formatTable(
    BAND_EDGES.map(([edge, read, target]) => ({
      edge,
      "anchor's planting, 10 d": yieldWhere(SETTLED, 10, read, target),
      'grown in from 350, 90 d': yieldWhere(FRESH, 90, read, target),
    }))
  );
}

/**
 * § 4f — what the sag catches that `gross` does not.
 *
 * The two move together along the carbon yield, which is why the sag is no
 * second bracket on it. They part along the surface: move `baseExchangeRate`
 * either way and gross stays inside 0.5–1 while the sag leaves 1–3. That is the
 * anchor's own bite, and the reason it is worth asserting at all.
 */
function surfaceSensitivity(): string {
  const shipped = gasExchangeDefaults.baseExchangeRate;

  return formatTable(
    [shipped / 2, shipped, shipped * 2].map((baseExchangeRate) => {
      const curve = gasCurve({
        setup: INJECTED,
        seed: SETTLED,
        days: 10,
        rngSeed: RNG_SEED,
        routine: {
          feed: 0.6,
          waterChange: 0.3,
          config: tuned((draft) => {
            draft.gasExchange.baseExchangeRate = baseExchangeRate;
          }),
        },
      });
      const sag = curve.sag ?? NaN;
      return {
        baseExchangeRate,
        gross: curve.gross,
        'gross in 0.5–1': curve.gross >= 0.5 && curve.gross <= 1,
        sag,
        'sag in 1–3': sag >= 1 && sag <= 3,
        o2High: curve.o2High,
        o2Low: curve.o2Low,
      };
    })
  );
}

// ── § 5 — does the admitted band hold a tank a keeper would refuse ───────────

/** The band's floor, its middle, and its ceiling. */
const SAMPLED_YIELDS = [22.5, 30, 44.5];

/**
 * § 5 — the band's edges against its middle, on the tanks that break first. A
 * window is only as good as the worst tank it admits, and an argument about
 * that is worth less than a sweep of it.
 */
function acrossTheBand(): string {
  const heavy = { seed: SETTLED, days: 30, feed: 0.6, waterChange: 0.3 };
  const cases: Array<[string, Case]> = [
    [`injected 150 L, ${INJECTED_FIXTURE} PAR fixture, 982, 12 neon`, { setup: INJECTED, ...heavy }],
    ['low-tech 150 L, 90 PAR, 982, 12 neon', { setup: lowTech(150, 90), ...heavy }],
    ...[10, 50, 120].map((par): [string, Case] => [
      `sealed 40 L, 300, 8 neon, ${par} PAR`,
      {
        setup: sealed(par),
        seed: planted(GATE_PLANTING, GATE_FISH),
        days: 60,
        feed: 0.2,
        waterChange: 0.25,
      },
    ]),
  ];

  const bare = survival(50, DEFAULT_CONFIG);
  return (
    `${PAR_NOTE}\nthe gate's bare control: ${bare.fish}/${GATE_FISH[0]!.count} fish, O₂ floor` +
    ` ${bare.o2Low.toFixed(3)}\n\n` +
    formatTable(
      cases.flatMap(([tank, options]) =>
        SAMPLED_YIELDS.map((co2PerRateUnit) => {
          let o2Low = Infinity;
          let o2High = 0;
          let minHealth = 100;
          const run = runTank({
            setup: options.setup,
            seed: options.seed,
            days: options.days,
            rngSeed: RNG_SEED,
            routine: {
              feed: options.feed,
              waterChange: options.waterChange,
              config: yieldAt(co2PerRateUnit),
            },
            watch: (_hour, _before, after) => {
              o2Low = Math.min(o2Low, after.resources.oxygen);
              o2High = Math.max(o2High, after.resources.oxygen);
              for (const fish of after.fish) minHealth = Math.min(minHealth, fish.health);
            },
          });
          return {
            tank,
            yield: co2PerRateUnit,
            fish: run.final.fish.length,
            minHealth,
            o2Low,
            o2High,
            'peak % sat': (o2High / SATURATION) * 100,
            algae: run.final.algae.mass,
            size: totalSize(run.final),
          };
        })
      )
    )
  );
}

const SECTIONS: Array<[string, () => string]> = [
  [`the 24 h budget at the rate that shipped, ${WAS}`, (): string => budgets(WAS)],
  [`the same tanks at ${IS}`, (): string => budgets(IS)],
  ['what the fraction is a fraction of', reference],
  ["the gate's sealed 40 L across the PAR ladder, 60 d", acidTest],
  ["the carbon yield on the anchor's planting, 10 d", (): string => yieldSweep(SETTLED, 10)],
  ['the same, grown in from 350 over 90 d', (): string => yieldSweep(FRESH, 90)],
  ["the anchor's night, booked by source", nightBudget],
  ['how much of that night the planting can move', nightShare],
  ['the same 150 L with the planting thinned out', sagControls],
  ['where each band edge falls, bisected', bandEdges],
  ['what the sag catches that gross does not', surfaceSensitivity],
  ["the band's edges against its middle", acrossTheBand],
];

for (const [label, section] of SECTIONS) {
  process.stdout.write(`\n— ${label} —\n${section()}\n`);
}
