/**
 * The bank a plant runs on.
 *
 * Three readings. What a thriving planting holds in `Plant.surplus` over a run,
 * and what one already at `maxSize` does with income it cannot spend on height.
 * And then the check the draw shape exists for: growth has to stay monotone in
 * the fixture. A flat per-tick ceiling below the accrual rate fills the bank
 * too, but growth then saturates at the ceiling and a brighter light buys
 * nothing — 2c's result, undone. Run it:
 *
 *     npm run probe:surplus-bank
 */

import type { SimulationConfig, SimulationState } from '../state.js';
import type { PresetSeed } from '../seed.js';
import { getSpeciesMaxSize } from '../systems/plant-growth.js';
import { runTank, totalSize } from './metrics.js';
import { DAY } from './tanks.js';
import { formatTable } from './sweep.js';

const RNG_SEED = 4242;
const DAYS = 60;

/** The grown-in 150 L the carbon yield was pinned against. */
const TANK: SimulationConfig = {
  tankCapacity: 150,
  heater: { enabled: true, targetTemperature: 25, wattage: 150 },
  filter: { enabled: true, type: 'canister' },
  substrate: { type: 'aqua_soil' },
  light: { enabled: true, par: 90, schedule: { startHour: 8, duration: 12 } },
  co2Generator: { enabled: true, bubbleRate: 2, schedule: { startHour: 8, duration: 10 } },
  autoDoser: { enabled: true, doseAmountMl: 3, schedule: { startHour: 8, duration: 1 } },
  ato: { enabled: true },
};

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
const MAXED: PresetSeed = {
  ...FRESH,
  plants: [
    { species: 'java_fern', count: 2, size: getSpeciesMaxSize('java_fern') },
    { species: 'anubias', count: 1, size: getSpeciesMaxSize('anubias') },
  ],
};

const ROUTINE = { feed: 0.6, waterChange: 0.3 };

const meanOf = (state: SimulationState, read: (plant: SimulationState['plants'][0]) => number): number =>
  state.plants.length === 0
    ? 0
    : state.plants.reduce((sum, plant) => sum + read(plant), 0) / state.plants.length;

const bankOf = (state: SimulationState): number => meanOf(state, (plant) => plant.surplus);

const REPORTED_DAYS = [1, 2, 3, 5, 10, 20, 30, 45, 60];

function trace(label: string, seed: PresetSeed): void {
  const rows: Record<string, unknown>[] = [];
  const { final } = runTank({
    setup: TANK,
    seed,
    days: DAYS,
    rngSeed: RNG_SEED,
    routine: ROUTINE,
    watch: (hour, _before, after) => {
      const day = hour / DAY;
      if (Number.isInteger(day) && REPORTED_DAYS.includes(day)) {
        rows.push({
          day,
          bank: bankOf(after).toFixed(2),
          size: totalSize(after).toFixed(1),
          condition: meanOf(after, (plant) => plant.condition).toFixed(1),
        });
      }
    },
  });

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
    const { final } = runTank({
      setup: { ...TANK, light: { enabled: true, par, schedule: { startHour: 8, duration: 12 } } },
      seed: FRESH,
      days: DAYS,
      rngSeed: RNG_SEED,
      routine: ROUTINE,
    });
    return {
      fixture: par,
      size: totalSize(final).toFixed(1),
      bank: bankOf(final).toFixed(2),
      plants: final.plants.length,
    };
  });

  process.stdout.write(`\n— Sixty days under four fixtures —\n${formatTable(rows)}\n`);
}

trace('A planting grown in from 35', FRESH);
trace('A planting handed over at maxSize', MAXED);
fixtureSweep();
