/**
 * Which half of the light-deficiency model is doing the killing.
 *
 * The branch changed two things at once: income became light-gated (the four
 * benefits multiply by `tanh(PAR / Ik)` instead of paying a flat 0.4 %/h in the
 * dark), and a maintenance cost went in that runs around the clock. A scenario
 * that dies on the shipped config says nothing about which one to reach for, so
 * each is switched off in turn:
 *
 * - `shipped` — both, with the reserve line where it ships.
 * - `no reserve` — `upkeepReserveHours` 0, so damage may spend the bank to the
 *   floor and the next dark hour finds it empty. This is the ordering without
 *   the reservation, and it is the run that says whether the line earns its
 *   keep.
 * - `no upkeep` — `upkeepCost` 0, leaving only the income change.
 *
 * The income change cannot be switched off from config — it is the benefit
 * array's shape — so `no upkeep` is the floor this probe can reach, and the gap
 * between it and `main` is what only a code change would recover.
 *
 *     npx tsx src/simulation/tests/starvation-share.ts
 *
 * Branch-only: reads config keys `main` does not have.
 */

import { produce } from 'immer';
import type { SimulationConfig, SimulationState } from '../state.js';
import type { PresetSeed } from '../seed.js';
import type { TunableConfig } from '../config/index.js';
import { getMassFromPpm, getPpm } from '../resources/helpers.js';
import { PLANT_SPECIES_DATA, type PlantSpecies } from '../plants/species.js';
import { PRESETS } from '../presets.js';
import { formatTable, tuned } from './sweep.js';
import { runTank, totalSize } from './metrics.js';
import { atOptimum, DAY, fixtureFor } from './tanks.js';

const round = (value: number, places = 1): number =>
  Math.round(value * 10 ** places) / 10 ** places;

const VARIANTS: Array<[string, TunableConfig]> = [
  ['shipped', tuned(() => {})],
  [
    'no reserve',
    tuned((draft) => {
      draft.plants.upkeepReserveHours = 0;
    }),
  ],
  [
    'no upkeep',
    tuned((draft) => {
      draft.plants.upkeepCost = 0;
    }),
  ],
];

const SPECIES: PlantSpecies[] = [
  'anubias',
  'java_fern',
  'amazon_sword',
  'dwarf_hairgrass',
  'monte_carlo',
];

const starved = (state: SimulationState): SimulationState =>
  produce(atOptimum(state), (draft) => {
    const { water } = draft.resources;
    draft.resources.nitrate = getMassFromPpm(0.5, water);
    draft.resources.phosphate = 0;
    draft.resources.potassium = 0;
    draft.resources.iron = 0;
  });

const litTank = (substratePar: number, capacity = 40): SimulationConfig => ({
  tankCapacity: capacity,
  heater: { enabled: true, targetTemperature: 25, wattage: Math.max(100, capacity) },
  filter: { enabled: true, type: 'canister' },
  light: {
    enabled: true,
    par: fixtureFor(substratePar, capacity),
    schedule: { startHour: 8, duration: 12 },
  },
  substrate: { type: 'aqua_soil' },
  lid: { type: 'full' },
  ato: { enabled: true },
  co2Generator: { enabled: false },
  powerhead: { enabled: false },
});

/** The fourteen-day fertiliser outage, the case `main` recovers from entirely. */
function outage(): string {
  return formatTable(
    SPECIES.flatMap((species) => {
      const [low] = PLANT_SPECIES_DATA[species].tolerableLight;
      return VARIANTS.map(([label, config]) => {
        const run = runTank({
          setup: litTank(low * 2),
          seed: { bacteria: 'cycled', plants: [{ species, count: 1, size: 35 }] },
          days: 90,
          routine: {
            config,
            hold: (state) =>
              state.tick >= 14 * DAY && state.tick < 28 * DAY ? starved(state) : atOptimum(state),
          },
          rngSeed: 5,
        });
        const plant = run.final.plants[0];
        return {
          species,
          variant: label,
          'cond d90': round(plant?.condition ?? 0),
          'size d90': round(plant?.size ?? 0),
          bank: round(plant?.surplus ?? 0),
          died: run.plantDeaths.map((d) => `d${Math.round(d.day)}`).join(' ') || '—',
        };
      });
    })
  );
}

/** Scenario 02 variant A — the run whose neons all die on the shipped config. */
const S02: SimulationConfig = {
  tankCapacity: 38,
  heater: { enabled: true, targetTemperature: 25, wattage: 50 },
  filter: { enabled: true, type: 'canister' },
  light: { enabled: true, par: 90, schedule: { startHour: 8, duration: 8 } },
  substrate: { type: 'aqua_soil' },
  lid: { type: 'full' },
  ato: { enabled: true },
  co2Generator: { enabled: true, bubbleRate: 1.5, schedule: { startHour: 7, duration: 10 } },
  powerhead: { enabled: false },
  autoDoser: { enabled: true, doseAmountMl: 1, schedule: { startHour: 8, duration: 1 } },
};

const S02_SEED: PresetSeed = {
  bacteria: 'cycled',
  fish: [{ species: 'neon_tetra', count: 10, sex: 'female' }],
  plants: [
    { species: 'amazon_sword', count: 2, size: 35 },
    { species: 'monte_carlo', count: 2, size: 35 },
    { species: 'java_fern', count: 1, size: 35 },
  ],
};

function scenario02(): string {
  return formatTable(
    VARIANTS.map(([label, config]) => {
      const run = runTank({
        setup: S02,
        seed: S02_SEED,
        days: 90,
        routine: { feed: 0.05, topOff: true, config },
        rngSeed: 5,
      });
      const { final } = run;
      return {
        variant: label,
        size: round(totalSize(final)),
        plants: final.plants.length,
        fish: final.fish.length,
        no3: round(getPpm(final.resources.nitrate, final.resources.water)),
        algae: round(final.algae.mass),
        died: run.plantDeaths.map((d) => `${d.species.slice(0, 4)}@d${Math.round(d.day)}`).join(' ') || '—',
      };
    })
  );
}

/** The shipped `planted` preset with the two plants every beginner guide starts with. */
function plantedPreset(): string {
  const preset = PRESETS.find((p) => p.id === 'planted');
  if (preset === undefined) throw new Error('no planted preset');
  return formatTable(
    VARIANTS.map(([label, config]) => {
      const run = runTank({
        setup: preset.config,
        seed: {
          ...preset.seed,
          plants: [
            { species: 'java_fern', count: 3, size: 35 },
            { species: 'anubias', count: 2, size: 35 },
          ],
          fish: [{ species: 'neon_tetra', count: 6, sex: 'female' }],
        },
        days: 90,
        routine: { feed: 0.03, topOff: true, config },
        rngSeed: 5,
      });
      const { final } = run;
      return {
        variant: label,
        size: round(totalSize(final)),
        plants: final.plants.length,
        cond: round(
          final.plants.length === 0
            ? 0
            : final.plants.reduce((sum, p) => sum + p.condition, 0) / final.plants.length
        ),
        died: run.plantDeaths.map((d) => `${d.species.slice(0, 4)}@d${Math.round(d.day)}`).join(' ') || '—',
      };
    })
  );
}

const SECTIONS: Array<[string, () => string]> = [
  ['a 14 d fertiliser outage at day 14, bright tank', outage],
  ['scenario 02 variant A, 38 L, 90 d', scenario02],
  ['the planted preset with java fern + anubias, 90 d', plantedPreset],
];

for (const [label, body] of SECTIONS) {
  process.stdout.write(`\n— ${label} —\n${body()}\n`);
}
