/**
 * What the light-deficiency model costs an *ordinary* tank.
 *
 * `dark-tank.ts` measures the scenarios the mechanic was built for. This one
 * measures the ones it reaches on the way there: a planted tank on a normal
 * photoperiod, at every volume, every species against a fixture that suits it
 * and one that doesn't, the shipped presets a player actually presses — and the
 * two extremes that have to stay safe.
 *
 * Every section but `preset-why` compiles and runs unchanged on `main`, so
 * each figure has a baseline; that one reads the plant's upkeep ledger, which
 * only exists here. Nothing reads a config key the branch introduced.
 *
 *     npx tsx src/simulation/tests/ordinary-tanks.ts [section ...]
 *
 * Measurements: `docs/calibration/runs/2026-08-08-ordinary-tanks.md` against
 * `main`, then `2026-08-08-tissue-not-condition.md` for what the ledger split
 * moved and `2026-08-08-reserve-by-priority.md` for what the reserve line and
 * the re-derived nutrient severity moved back.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import type { PresetSeed } from '../seed.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { calculateNutrientSufficiency } from '../systems/nutrients.js';
import {
  buildPlantStressors,
  buildPlantUpkeep,
  buildPlantBenefits,
} from '../systems/plant-vitality.js';
import { getPpm } from '../resources/helpers.js';
import { PLANT_SPECIES_DATA, type PlantSpecies } from '../plants/species.js';
import { PRESETS, type PresetId } from '../presets.js';
import { formatTable, round } from './sweep.js';
import { runTank, totalSize, type RunResult } from './metrics.js';
import {
  atOptimum,
  DAY,
  deprived,
  litTank,
  SCENARIO_02_ROUTINE,
  SCENARIO_02_SEED,
  scenario02Tank,
  SPECIES_BY_LIGHT,
  substrateFor,
} from './tanks.js';

const RNG_SEEDS = [5, 1234, 4242];

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const conditionOf = (state: SimulationState, species: PlantSpecies): number | null => {
  const mine = state.plants.filter((plant) => plant.species === species);
  return mine.length === 0 ? null : mean(mine.map((plant) => plant.condition));
};

interface Outcome {
  size: number;
  cond: number;
  bank: number;
  alive: number;
  died: string;
  fish: number;
  no3: number;
  algae: number;
}

/** The figures every whole-tank scenario here is read on, off one run. */
function outcome(run: RunResult): Outcome {
  const { final } = run;
  return {
    size: round(totalSize(final)),
    cond: round(mean(final.plants.map((plant) => plant.condition))),
    bank: round(mean(final.plants.map((plant) => plant.surplus))),
    alive: final.plants.length,
    died:
      run.plantDeaths.length === 0
        ? '—'
        : run.plantDeaths
            .map((death) => `${death.species.slice(0, 4)}@d${Math.round(death.day)}`)
            .join(' '),
    fish: final.fish.length,
    no3: round(getPpm(final.resources.nitrate, final.resources.water)),
    algae: round(final.algae.mass),
  };
}

// ---------------------------------------------------------------------------
// § scenario 02 — the heavily planted 38 L the plants subsystem is pinned on
// ---------------------------------------------------------------------------

function scenario02(): string {
  return formatTable(
    (['A', 'B'] as const).flatMap((variant) =>
      RNG_SEEDS.map((rngSeed) => ({
        variant,
        rngSeed,
        ...outcome(
          runTank({
            setup: scenario02Tank(variant === 'A'),
            seed: SCENARIO_02_SEED,
            days: 90,
            routine: SCENARIO_02_ROUTINE,
            rngSeed,
          })
        ),
      }))
    )
  );
}

/** Per-species condition through scenario 02, so a decline can be attributed. */
function scenario02Trace(variant: 'A' | 'B'): string {
  const marks = [7, 14, 28, 42, 56, 70, 80, 90];
  const rows: Record<string, unknown>[] = [];
  runTank({
    setup: scenario02Tank(variant === 'A'),
    seed: SCENARIO_02_SEED,
    days: 90,
    routine: SCENARIO_02_ROUTINE,
    rngSeed: 5,
    watch: (hour, _before, after) => {
      const day = hour / DAY;
      if (!marks.includes(day)) return;
      rows.push({
        day,
        size: round(totalSize(after)),
        sword: round(conditionOf(after, 'amazon_sword') ?? 0),
        mc: round(conditionOf(after, 'monte_carlo') ?? 0),
        fern: round(conditionOf(after, 'java_fern') ?? 0),
        bank: round(mean(after.plants.map((p) => p.surplus))),
        no3: round(getPpm(after.resources.nitrate, after.resources.water)),
        fe: round(getPpm(after.resources.iron, after.resources.water), 3),
        algae: round(after.algae.mass),
        fish: after.fish.length,
        health: round(mean(after.fish.map((f) => f.health))),
        o2: round(after.resources.oxygen, 2),
      });
    },
  });
  return formatTable(rows);
}

/** The hour each neon leaves scenario 02 variant A, and the water it left in. */
function scenario02Fish(): string {
  const rows: Record<string, unknown>[] = [];
  let standing = 10;
  runTank({
    setup: scenario02Tank(true),
    seed: SCENARIO_02_SEED,
    days: 120,
    routine: SCENARIO_02_ROUTINE,
    rngSeed: 5,
    watch: (hour, _before, after) => {
      if (after.fish.length >= standing) return;
      rows.push({
        day: round(hour / DAY, 2),
        lost: standing - after.fish.length,
        left: after.fish.length,
        no3: round(getPpm(after.resources.nitrate, after.resources.water)),
        nh3: round(getPpm(after.resources.ammonia, after.resources.water), 3),
        o2: round(after.resources.oxygen, 2),
        ph: round(after.resources.ph, 2),
        algae: round(after.algae.mass),
        plantSize: round(totalSize(after)),
      });
      standing = after.fish.length;
    },
  });
  return rows.length === 0 ? 'no fish lost in 120 d' : formatTable(rows);
}

// ---------------------------------------------------------------------------
// § the tank a player actually presses — a shipped preset, planted
// ---------------------------------------------------------------------------

interface Keeping {
  /** Fraction of the water swapped weekly. */
  waterChange?: number;
  /** Whether the keeper switches the preset's auto-doser on. */
  dose?: boolean;
  /** How long the keeper is away for. */
  days?: number;
}

function presetRun(
  id: PresetId,
  plants: PresetSeed['plants'],
  fish: number,
  { waterChange, dose = false, days = 90 }: Keeping = {}
): Outcome {
  const preset = PRESETS.find((p) => p.id === id);
  if (preset === undefined) throw new Error(`no preset ${id}`);
  return outcome(
    runTank({
      setup: {
        ...preset.config,
        ...(dose
          ? {
              autoDoser: {
                enabled: true,
                doseAmountMl: preset.config.tankCapacity / 38,
                schedule: { startHour: 8, duration: 1 },
              },
            }
          : {}),
      },
      seed: {
        ...preset.seed,
        plants,
        ...(fish > 0
          ? { fish: [{ species: 'neon_tetra' as const, count: fish, sex: 'female' as const }] }
          : {}),
      },
      days,
      routine: { feed: fish > 0 ? 0.005 * fish : undefined, topOff: true, waterChange },
      rngSeed: 5,
    })
  );
}

const MIXED: PresetSeed['plants'] = [
  { species: 'amazon_sword', count: 2, size: 35 },
  { species: 'monte_carlo', count: 2, size: 35 },
  { species: 'java_fern', count: 1, size: 35 },
];

/** The two plants every beginner guide starts with, and neither needs CO2. */
const EASY: PresetSeed['plants'] = [
  { species: 'java_fern', count: 3, size: 35 },
  { species: 'anubias', count: 2, size: 35 },
];

function presets(): string {
  return formatTable([
    { preset: 'planted 40L', planting: 'mixed hi-tech', ...presetRun('planted', MIXED, 6) },
    { preset: 'planted 40L', planting: 'fern+anubias', ...presetRun('planted', EASY, 6) },
    {
      preset: 'planted 40L +wc',
      planting: 'fern+anubias',
      ...presetRun('planted', EASY, 6, { waterChange: 0.25 }),
    },
    {
      preset: 'planted 40L +dose',
      planting: 'fern+anubias',
      ...presetRun('planted', EASY, 6, { dose: true }),
    },
    { preset: 'community 150L', planting: 'mixed hi-tech', ...presetRun('community', MIXED, 12) },
    { preset: 'community 150L', planting: 'fern+anubias', ...presetRun('community', EASY, 12) },
    { preset: 'betta 20L', planting: 'fern+anubias', ...presetRun('betta', EASY, 1) },
    { preset: 'angelfish 300L', planting: 'fern+anubias', ...presetRun('angelfish', EASY, 8) },
  ]);
}

/**
 * The marginal end `nutrientDeficiencySeverity` is pinned on — the two shipped
 * presets a beginner presses, planted with the two plants every guide names, no
 * doser, no water changes, half a year. `2026-08-08-reserve-by-priority.md` § 2
 * binds the severity at 0.30 on this run keeping all five plants alive and the
 * nano's fish with them; nothing committed measured it until now.
 */
function marginal(): string {
  return formatTable([
    { preset: 'planted 40L', ...presetRun('planted', EASY, 6, { days: 180 }) },
    { preset: 'betta 20L', ...presetRun('betta', EASY, 1, { days: 180 }) },
  ]);
}

/**
 * Why the `planted` preset's java ferns go: every channel charging one of them
 * on the day before it dies, next to what it is earning.
 */
function presetDiagnosis(): string {
  const preset = PRESETS.find((p) => p.id === 'planted');
  if (preset === undefined) throw new Error('no planted preset');
  const marks = [1, 7, 14, 21, 28, 35, 42, 49, 56];
  const rows: Record<string, unknown>[] = [];

  runTank({
    setup: preset.config,
    seed: { ...preset.seed, plants: EASY, fish: [{ species: 'neon_tetra', count: 6, sex: 'female' }] },
    days: 60,
    routine: { feed: 0.03, topOff: true },
    rngSeed: 5,
    // Midday and midnight of each mark: the always-on channels read the same in
    // both, and what the plant *earns* only exists in one of them.
    watch: (hour, _before, after) => {
      if (hour % DAY !== 12 && hour % DAY !== 0) return;
      const day = Math.floor(hour / DAY);
      if (!marks.includes(day)) return;
      const plant = after.plants.find((p) => p.species === 'java_fern');
      if (plant === undefined) return;
      const ctx = {
        plant,
        resources: after.resources,
        waterVolume: after.resources.water,
        plantsConfig: DEFAULT_CONFIG.plants,
        nutrientSufficiency: calculateNutrientSufficiency(
          after.resources,
          after.resources.water,
          plant.species,
          DEFAULT_CONFIG.nutrients
        ),
        algaeMass: after.algae.mass,
      };
      // The whole bill, both ledgers: what the plant owes for being alive
      // next to what is being done to it.
      const charged = [...buildPlantUpkeep(ctx), ...buildPlantStressors(ctx)].filter(
        (factor) => factor.amount > 0
      );
      const earned = buildPlantBenefits(ctx);
      rows.push({
        day,
        hour: hour % DAY,
        light: round(after.resources.light),
        cond: round(plant.condition),
        bank: round(plant.surplus, 2),
        suff: round(ctx.nutrientSufficiency, 3),
        earns: round(
          earned.reduce((sum, f) => sum + f.amount, 0),
          3
        ),
        charged: charged.map((f) => `${f.label}=${round(f.amount, 3)}`).join(' ') || '—',
      });
    },
  });
  return formatTable(rows);
}

// ---------------------------------------------------------------------------
// § the same planting at every volume, with the water held right
// ---------------------------------------------------------------------------

const VOLUMES = [20, 38, 75, 150, 300];

/**
 * One planting at five volumes on one fixture rating. Nutrients, carbon, pH and
 * temperature are pinned, so what varies down the table is the water above the
 * bed and nothing else — a runaway nitrate would otherwise be the thing being
 * measured.
 */
function volumes(): string {
  return formatTable(
    VOLUMES.map((capacity) => {
      const run = runTank({
        setup: litTank(substrateFor(90, capacity), capacity),
        seed: { bacteria: 'cycled', plants: MIXED },
        days: 90,
        routine: { hold: atOptimum },
        rngSeed: 5,
      });
      return { capacity, par: round(substrateFor(90, capacity)), ...outcome(run) };
    })
  );
}

// ---------------------------------------------------------------------------
// § every species against a fixture that suits it and one that doesn't
// ---------------------------------------------------------------------------

/**
 * Where each run's fixture sits, quoted against the species' own band: under
 * it, at it, through it, and past the top — a fixture that suits a plant and
 * one that does not are both a multiple of a number the species carries.
 */
const BAND_POINTS: Array<[string, (low: number, high: number) => number]> = [
  ['0.75 × low', (low): number => low * 0.75],
  ['low', (low): number => low],
  ['1.5 × low', (low): number => low * 1.5],
  ['2.5 × low', (low): number => low * 2.5],
  ['mid', (low, high): number => (low + high) / 2],
  ['high', (_low, high): number => high],
  ['1.3 × high', (_low, high): number => high * 1.3],
];

/**
 * One plant, one fixture, every other channel pinned at optimum — the same
 * isolation `dark-tank.ts` uses, run across each species' own band instead of
 * only at the shipped fixture. The bank is left alone, so this reads income.
 */
function speciesFixtures(): string {
  return formatTable(
    SPECIES_BY_LIGHT.flatMap((species) => {
      const [low, high] = PLANT_SPECIES_DATA[species].tolerableLight;
      return BAND_POINTS.map(([label, at]) => {
        const par = at(low, high);
        const run = runTank({
          setup: litTank(par),
          seed: { bacteria: 'cycled', plants: [{ species, count: 1, size: 35 }] },
          days: 90,
          routine: { hold: atOptimum },
          rngSeed: 5,
        });
        const plant = run.final.plants[0];
        return {
          species,
          band: `${low}-${high}`,
          fixture: label,
          par: round(par),
          size: round(plant?.size ?? 0),
          cond: round(plant?.condition ?? 0),
          bank: round(plant?.surplus ?? 0),
          // Nutrients are pinned at optimum every tick, so a bright tank feeds
          // algae without limit — which is its own way to take a plant down.
          algae: round(run.final.algae.mass),
          died: run.plantDeaths.map((d) => `d${Math.round(d.day)}`).join(' ') || '—',
        };
      });
    })
  );
}

// ---------------------------------------------------------------------------
// § the second damage channel — a starved bank in a brightly lit tank
// ---------------------------------------------------------------------------

/**
 * A plant standing in plenty of light with one other channel taken away.
 *
 * The reserve bank is shared: whatever empties it, starvation ramps on what is
 * left. So a nutrient- or carbon-starved plant under a good fixture now pays a
 * channel it did not pay before, on top of the deficiency that emptied the bank.
 * Light is held at twice the species' band low — bright enough that the light
 * channel itself has no complaint — so anything this kills, the interaction did.
 */
function compounding(): string {
  return formatTable(
    SPECIES_BY_LIGHT.flatMap((species) => {
      const [low] = PLANT_SPECIES_DATA[species].tolerableLight;
      return (['none', 'nutrients', 'co2'] as const).map((channel) => {
        const run = runTank({
          setup: litTank(low * 2),
          seed: { bacteria: 'cycled', plants: [{ species, count: 1, size: 35 }] },
          days: 90,
          routine: { hold: deprived(channel) },
          rngSeed: 5,
        });
        const plant = run.final.plants[0];
        return {
          species,
          par: round(low * 2),
          deprived: channel,
          size: round(plant?.size ?? 0),
          cond: round(plant?.condition ?? 0),
          bank: round(plant?.surplus ?? 0),
          died: run.plantDeaths.map((d) => `d${Math.round(d.day)}`).join(' ') || '—',
        };
      });
    })
  );
}

/**
 * The same interaction as a *transient*: a good tank, one bad week, then fixed.
 *
 * This is the keeper's own mistake — a doser that ran dry, a CO2 bottle that
 * emptied — and the question is whether the plant comes back once it is put
 * right, or whether the empty bank has already started a spiral it cannot heal
 * out of.
 */
const OUTAGES = [3, 7, 14, 21];

function transient(): string {
  return formatTable(
    SPECIES_BY_LIGHT.flatMap((species) => {
      const [low] = PLANT_SPECIES_DATA[species].tolerableLight;
      return OUTAGES.flatMap((days) =>
        (['nutrients', 'co2'] as const).map((channel) => {
          const outage = deprived(channel);
          const run = runTank({
            setup: litTank(low * 2),
            seed: { bacteria: 'cycled', plants: [{ species, count: 1, size: 35 }] },
            days: 90,
            routine: {
              hold: (state) =>
                state.tick >= 14 * DAY && state.tick < (14 + days) * DAY
                  ? outage(state)
                  : atOptimum(state),
            },
            rngSeed: 5,
          });
          const plant = run.final.plants[0];
          return {
            species,
            outage: channel,
            'days out': days,
            'cond d90': round(plant?.condition ?? 0),
            'size d90': round(plant?.size ?? 0),
            bank: round(plant?.surplus ?? 0),
            died: run.plantDeaths.map((d) => `d${Math.round(d.day)}`).join(' ') || '—',
          };
        })
      );
    })
  );
}

// ---------------------------------------------------------------------------
// § what a seeded plant is handed, and how long it lasts on it
// ---------------------------------------------------------------------------

/**
 * A plant now arrives holding half the cap, so a tank that cannot support it
 * still reads healthy while the reserve lasts. This is the lag between planting
 * and the first sign of trouble, measured on a fixture below what the species
 * needs: the day condition first leaves 100, and the day the plant goes.
 */
function establishment(): string {
  return formatTable(
    SPECIES_BY_LIGHT.flatMap((species) => {
      const [low] = PLANT_SPECIES_DATA[species].tolerableLight;
      return [0.5, 0.75, 1.0].map((multiple) => {
        let bankGone: number | null = null;
        let firstSlip: number | null = null;
        const run = runTank({
          setup: litTank(low * multiple),
          seed: { bacteria: 'cycled', plants: [{ species, count: 1, size: 35 }] },
          days: 120,
          routine: { hold: atOptimum },
          rngSeed: 5,
          watch: (hour, _before, after) => {
            const plant = after.plants[0];
            if (plant === undefined) return;
            if (bankGone === null && plant.surplus <= 0) bankGone = hour / DAY;
            if (firstSlip === null && plant.condition < 100) firstSlip = hour / DAY;
          },
        });
        const plant = run.final.plants[0];
        return {
          species,
          par: round(low * multiple),
          'start bank': round(run.samples[0]?.avgSurplus ?? 0),
          'bank empty d': bankGone === null ? '—' : round(bankGone, 1),
          'cond slips d': firstSlip === null ? '—' : round(firstSlip, 1),
          'cond d120': round(plant?.condition ?? 0),
          died: run.plantDeaths.map((d) => `d${Math.round(d.day)}`).join(' ') || '—',
        };
      });
    })
  );
}

// ---------------------------------------------------------------------------
// § the extremes that have to stay safe
// ---------------------------------------------------------------------------

/**
 * A year in a tank with nothing wrong with it, every species, the bank held
 * full. Anything that dies here is the model killing a plant it has no
 * complaint about.
 */
function safeExtremes(): string {
  return formatTable(
    SPECIES_BY_LIGHT.map((species) => {
      const [low, high] = PLANT_SPECIES_DATA[species].tolerableLight;
      const par = (low + high) / 2;
      const run = runTank({
        setup: litTank(par),
        seed: { bacteria: 'cycled', plants: [{ species, count: 1, size: 35 }] },
        days: 365,
        routine: {
          hold: (state) =>
            produce(atOptimum(state), (draft) => {
              for (const plant of draft.plants) plant.surplus = DEFAULT_CONFIG.plants.surplusCap;
            }),
        },
        rngSeed: 5,
      });
      const plant = run.final.plants[0];
      return {
        species,
        'mid-band par': round(par),
        size: round(plant?.size ?? 0),
        cond: round(plant?.condition ?? 0),
        bank: round(plant?.surplus ?? 0),
        died: run.plantDeaths.map((d) => `d${Math.round(d.day)}`).join(' ') || '—',
      };
    })
  );
}

const SECTIONS: Record<string, [string, () => string]> = {
  s02: ['scenario 02, 38 L, 90 d, three streams', scenario02],
  's02-a': ['scenario 02 variant A, by day, seed 5', (): string => scenario02Trace('A')],
  's02-b': ['scenario 02 variant B, by day, seed 5', (): string => scenario02Trace('B')],
  's02-fish': ['scenario 02 variant A, the hour each neon goes', scenario02Fish],
  presets: ['shipped presets, planted by a player, 90 d', presets],
  marginal: ['the two presets a beginner presses, undosed, 180 d', marginal],
  'preset-why': ['the planted preset, what charges a java fern', presetDiagnosis],
  volumes: ['one planting, every volume, water pinned, 90 d', volumes],
  species: ['every species across its own band, water pinned, 90 d', speciesFixtures],
  compound: ['bright light, one channel taken away, 90 d', compounding],
  transient: ['a good tank, one bad week at day 14, then fixed', transient],
  establish: ['the reserve a new plant arrives on, under a fixture too dim for it', establishment],
  safe: ['a year in a perfect tank with a full bank', safeExtremes],
};

const wanted = process.argv.slice(2);
const chosen = wanted.length > 0 ? wanted : Object.keys(SECTIONS);

for (const key of chosen) {
  const section = SECTIONS[key];
  if (section === undefined) {
    throw new Error(`no section ${key} — have ${Object.keys(SECTIONS).join(', ')}`);
  }
  const [label, body] = section;
  process.stdout.write(`\n— ${key}: ${label} —\n${body()}\n`);
}
