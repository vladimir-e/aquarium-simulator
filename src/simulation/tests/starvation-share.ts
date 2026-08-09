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

import type { TunableConfig } from '../config/index.js';
import { getPpm } from '../resources/helpers.js';
import { PLANT_SPECIES_DATA } from '../plants/species.js';
import { PRESETS } from '../presets.js';
import { formatTable, round, tuned } from './sweep.js';
import { runTank, totalSize } from './metrics.js';
import {
  atOptimum,
  DAY,
  deprived,
  litTank,
  SCENARIO_02_ROUTINE,
  SCENARIO_02_SEED,
  scenario02Tank,
  SPECIES_BY_LIGHT,
} from './tanks.js';

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

const starved = deprived('nutrients');

/** The fourteen-day fertiliser outage, the case `main` recovers from entirely. */
function outage(): string {
  return formatTable(
    SPECIES_BY_LIGHT.flatMap((species) => {
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
function scenario02(): string {
  return formatTable(
    VARIANTS.map(([label, config]) => {
      const run = runTank({
        setup: scenario02Tank(true),
        seed: SCENARIO_02_SEED,
        days: 90,
        routine: { ...SCENARIO_02_ROUTINE, config },
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
