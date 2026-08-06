/**
 * A tank read as a trajectory rather than an end state: samples on a fixed
 * cadence — one a day by default, hourly when the question is a day/night
 * curve — and the day each plant left.
 *
 * An anchor asserts a number; a run report has to show the shape that number
 * sits on, and the shape is what this returns. It drives {@link keep}, the
 * same loop the anchors run, so a figure in a report and a figure in an
 * assertion come off one schedule.
 */

import { createSimulation, type SimulationConfig, type SimulationState } from '../state.js';
import type { PresetSeed } from '../seed.js';
import type { PlantSpecies } from '../plants/species.js';
import { DAY, keep, type KeeperRoutine } from './tanks.js';

/** The planting and the dissolved gases read off a tank at one hour of one day. */
export interface Sample {
  day: number;
  algae: number;
  plants: number;
  totalSize: number;
  avgCondition: number;
  /** mg/L. */
  oxygen: number;
  /** mg/L. */
  co2: number;
}

export interface PlantDeath {
  species: PlantSpecies;
  day: number;
}

export interface RunResult {
  /** Tick 0, then one every {@link RunOptions.sampleEvery} hours. */
  samples: Sample[];
  final: SimulationState;
  plantDeaths: PlantDeath[];
}

export interface RunOptions {
  setup: SimulationConfig;
  seed?: PresetSeed;
  days: number;
  routine?: KeeperRoutine;
  rngSeed?: number;
  /**
   * Hours between samples. 1 is the whole day/night curve — what a gas reading
   * needs; the 24 h default is one figure a day, which is what a run measured
   * in weeks wants.
   */
  sampleEvery?: number;
  /**
   * Where in that cadence a sample lands: at the default it is the hour of day,
   * and 12 sits inside every standard photoperiod.
   */
  sampleHour?: number;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleOf(state: SimulationState): Sample {
  return {
    day: state.tick / DAY,
    algae: state.algae.mass,
    plants: state.plants.length,
    totalSize: state.plants.reduce((sum, plant) => sum + plant.size, 0),
    avgCondition: mean(state.plants.map((plant) => plant.condition)),
    oxygen: state.resources.oxygen,
    co2: state.resources.co2,
  };
}

/** Build a tank, run it on a keeper's routine, and report what it did. */
export function runTank({
  setup,
  seed,
  days,
  routine = {},
  rngSeed = 1234,
  sampleEvery = DAY,
  sampleHour = 12,
}: RunOptions): RunResult {
  // A zero or fractional cadence takes no sample at any hour, and a run that
  // measured nothing reads the same as a tank that did nothing.
  if (!Number.isInteger(sampleEvery) || sampleEvery < 1) {
    throw new Error(`sampleEvery must be a whole number of hours, got ${sampleEvery}`);
  }

  const start = createSimulation(setup, seed, rngSeed);

  const samples: Sample[] = [sampleOf(start)];
  const plantDeaths: PlantDeath[] = [];

  const final = keep(start, days, routine, (hour, before, after) => {
    const alive = new Set(after.plants.map((plant) => plant.id));
    for (const plant of before.plants) {
      if (!alive.has(plant.id)) plantDeaths.push({ species: plant.species, day: hour / DAY });
    }

    if (hour % sampleEvery === sampleHour % sampleEvery) samples.push(sampleOf(after));
  });

  return { samples, final, plantDeaths };
}
