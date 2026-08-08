/**
 * The bank a plant runs on.
 *
 * Three readings. What a thriving planting holds in `Plant.surplus` over a run,
 * what one already at `maxSize` does with income it cannot spend on height, and
 * then sixty days under four fixtures — where the draw shape shows, because a
 * plant below the peg spends what it earns and more light is more income.
 *
 * The tank total in that sweep is not monotone in the fixture and is not meant
 * to be: this mix carries species a brighter light hurts. Monte carlo spends
 * 43 / 77 / 87 % of its lit hours under condition 100 at the three brightest
 * fixtures, and nothing accrues below 100, so it stalls near the size it was
 * planted at; past 90 PAR at the substrate java fern and anubias are over their
 * bands as well. Amazon sword is the one species in band and at full condition
 * across the whole sweep, which is why its column is the one that climbs at
 * every step. `banked-photosynthate.test.ts` asserts the claim on a planting
 * that stays in band. Run it:
 *
 *     npm run probe:surplus-bank
 */

import type { PresetSeed } from '../seed.js';
import type { SimulationState } from '../state.js';
import { runTank } from './metrics.js';
import { ATTACHED_PLANTING, DAY, plantedTank, planting, substrateFor } from './tanks.js';
import { formatTable } from './sweep.js';

const RNG_SEED = 4242;
const DAYS = 60;
const CAPACITY = 150;

/** The grown-in 150 L the carbon yield was pinned against. */
const TANK = plantedTank(CAPACITY, { carbonInjection: true });

/** The planting `light-response` grew from: 350 total size across four species. */
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

/** The same tank, handed plants that have nowhere left to grow. */
const MAXED: PresetSeed = { ...FRESH, plants: planting(ATTACHED_PLANTING, 'maxSize') };

const ROUTINE = { feed: 0.6, waterChange: 0.3 };

/** A sample a day, taken at midnight so `samples[day]` is that day. */
const DAILY = { rngSeed: RNG_SEED, routine: ROUTINE, sampleEvery: DAY, sampleHour: 0 };

const REPORTED_DAYS = [1, 2, 3, 5, 10, 20, 30, 45, 60];

/** Mean size per species — the column the fixture sweep is read down. */
function bySpecies(state: SimulationState): Record<string, string> {
  const sizes = new Map<string, number[]>();
  for (const plant of state.plants) {
    sizes.set(plant.species, [...(sizes.get(plant.species) ?? []), plant.size]);
  }
  return Object.fromEntries(
    [...sizes].map(([species, all]) => [
      species,
      (all.reduce((sum, size) => sum + size, 0) / all.length).toFixed(1),
    ])
  );
}

function trace(label: string, seed: PresetSeed): void {
  const { final, samples } = runTank({ setup: TANK, seed, days: DAYS, ...DAILY });

  const rows = REPORTED_DAYS.map((day) => ({
    day,
    bank: samples[day]!.avgSurplus.toFixed(2),
    size: samples[day]!.totalSize.toFixed(1),
    condition: samples[day]!.avgCondition.toFixed(1),
  }));

  const plants = final.plants
    .map(
      (plant) =>
        `  ${plant.species.padEnd(14)} size ${plant.size.toFixed(1).padStart(7)}` +
        `  bank ${plant.surplus.toFixed(2).padStart(6)}  condition ${plant.condition.toFixed(1)}`
    )
    .join('\n');

  process.stdout.write(`\n— ${label} —\n${formatTable(rows)}\n\n${plants}\n`);
}

function fixtureSweep(): void {
  const rows = [25, 50, 90, 150].map((par) => {
    const { final, samples } = runTank({
      setup: plantedTank(CAPACITY, { par, carbonInjection: true }),
      seed: FRESH,
      days: DAYS,
      ...DAILY,
    });
    return {
      fixture: par,
      substrate: substrateFor(par, CAPACITY).toFixed(1),
      total: samples[DAYS]!.totalSize.toFixed(1),
      bank: samples[DAYS]!.avgSurplus.toFixed(2),
      plants: final.plants.length,
      ...bySpecies(final),
    };
  });

  process.stdout.write(`\n— Sixty days under four fixtures, mean size by species —\n${formatTable(rows)}\n`);
}

trace('A planting grown in from 35', FRESH);
trace('A planting handed over at maxSize', MAXED);
fixtureSweep();
