/**
 * A tank read as a trajectory rather than an end state: one sample a day at a
 * named hour, and the day each plant left.
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

/** The planting read off a tank at one hour of one day. */
export interface Sample {
  day: number;
  algae: number;
  plants: number;
  totalSize: number;
  avgCondition: number;
}

export interface PlantDeath {
  species: PlantSpecies;
  day: number;
}

export interface RunResult {
  /** Day 0 plus one per day of the run. */
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
  /** Hour of day each sample is taken; 12 sits inside every standard photoperiod. */
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
  };
}

/** Build a tank, run it on a keeper's routine, and report what it did. */
export function runTank({
  setup,
  seed,
  days,
  routine = {},
  rngSeed = 1234,
  sampleHour = 12,
}: RunOptions): RunResult {
  const start = createSimulation(setup, seed, rngSeed);

  const samples: Sample[] = [sampleOf(start)];
  const plantDeaths: PlantDeath[] = [];

  const final = keep(start, days, routine, (hour, before, after) => {
    const alive = new Set(after.plants.map((plant) => plant.id));
    for (const plant of before.plants) {
      if (!alive.has(plant.id)) plantDeaths.push({ species: plant.species, day: hour / DAY });
    }

    if (hour % DAY === sampleHour % DAY) samples.push(sampleOf(after));
  });

  return { samples, final, plantDeaths };
}
