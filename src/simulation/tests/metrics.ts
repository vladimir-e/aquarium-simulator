/**
 * A tank read as a trajectory rather than an end state: one sample a day at a
 * named hour, the extremes every tick passed through, and the day each
 * organism left.
 *
 * An anchor asserts a number; a run report has to show the shape that number
 * sits on, and the shape is what this returns. It drives {@link keep}, the
 * same loop the anchors run, so a figure in a report and a figure in an
 * assertion come off one schedule.
 */

import { createSimulation, type SimulationConfig, type SimulationState } from '../state.js';
import type { PresetSeed } from '../seed.js';
import type { PlantSpecies } from '../plants/species.js';
import { getPpm } from '../resources/helpers.js';
import { DAY, keep, type KeeperRoutine } from './tanks.js';

/** One species' standing in the planting, averaged over its individuals. */
export interface SpeciesRoll {
  n: number;
  size: number;
  condition: number;
  surplus: number;
}

/** Everything worth reading off a tank at one hour of one day. */
export interface Sample {
  day: number;
  light: number;
  algae: number;
  algaeSurplus: number;
  plants: number;
  totalSize: number;
  avgCondition: number;
  bySpecies: Partial<Record<PlantSpecies, SpeciesRoll>>;
  fish: number;
  minHealth: number;
  avgHealth: number;
  o2: number;
  co2: number;
  ph: number;
  temp: number;
  nh3: number;
  no2: number;
  no3: number;
  po4: number;
  k: number;
  fe: number;
  water: number;
  waste: number;
  food: number;
  aob: number;
  nob: number;
}

/**
 * The worst the tank got at any tick. A daily sample can walk straight past a
 * spike that killed something, so the extremes are taken every hour.
 */
export interface Extremes {
  minO2: number;
  maxCo2: number;
  maxNh3Ppm: number;
  maxNo2Ppm: number;
  maxNo3Ppm: number;
  maxAlgae: number;
  minPh: number;
  maxPh: number;
  minTemp: number;
  maxTemp: number;
  maxWaste: number;
  maxFood: number;
  minWater: number;
  maxTotalPlantSize: number;
}

export interface PlantDeath {
  species: PlantSpecies;
  day: number;
}

export interface RunResult {
  /** Day 0 plus one per day of the run. */
  samples: Sample[];
  extremes: Extremes;
  final: SimulationState;
  /** Fish stocked at the start, and how many of those are still alive. */
  stocked: number;
  survivors: number;
  /** Day the first of them died, or null if the roster held. */
  firstDeathDay: number | null;
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

function speciesRoll(state: SimulationState): Sample['bySpecies'] {
  const rolls: Sample['bySpecies'] = {};
  for (const plant of state.plants) {
    const roll = (rolls[plant.species] ??= { n: 0, size: 0, condition: 0, surplus: 0 });
    roll.n += 1;
    roll.size += plant.size;
    roll.condition += plant.condition;
    roll.surplus += plant.surplus;
  }
  for (const roll of Object.values(rolls)) {
    roll.size /= roll.n;
    roll.condition /= roll.n;
    roll.surplus /= roll.n;
  }
  return rolls;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleOf(state: SimulationState): Sample {
  const r = state.resources;
  const health = state.fish.map((fish) => fish.health);

  return {
    day: state.tick / DAY,
    light: r.light,
    algae: state.algae.mass,
    algaeSurplus: state.algae.surplus,
    plants: state.plants.length,
    totalSize: state.plants.reduce((sum, plant) => sum + plant.size, 0),
    avgCondition: mean(state.plants.map((plant) => plant.condition)),
    bySpecies: speciesRoll(state),
    fish: state.fish.length,
    minHealth: health.length === 0 ? 0 : Math.min(...health),
    avgHealth: mean(health),
    o2: r.oxygen,
    co2: r.co2,
    ph: r.ph,
    temp: r.temperature,
    nh3: getPpm(r.ammonia, r.water),
    no2: getPpm(r.nitrite, r.water),
    no3: getPpm(r.nitrate, r.water),
    po4: getPpm(r.phosphate, r.water),
    k: getPpm(r.potassium, r.water),
    fe: getPpm(r.iron, r.water),
    water: r.water,
    waste: r.waste,
    food: r.food,
    aob: r.aob,
    nob: r.nob,
  };
}

function openExtremes(state: SimulationState): Extremes {
  const r = state.resources;
  return {
    minO2: r.oxygen,
    maxCo2: r.co2,
    maxNh3Ppm: getPpm(r.ammonia, r.water),
    maxNo2Ppm: getPpm(r.nitrite, r.water),
    maxNo3Ppm: getPpm(r.nitrate, r.water),
    maxAlgae: state.algae.mass,
    minPh: r.ph,
    maxPh: r.ph,
    minTemp: r.temperature,
    maxTemp: r.temperature,
    maxWaste: r.waste,
    maxFood: r.food,
    minWater: r.water,
    maxTotalPlantSize: state.plants.reduce((sum, plant) => sum + plant.size, 0),
  };
}

function widen(extremes: Extremes, state: SimulationState): void {
  const r = state.resources;
  extremes.minO2 = Math.min(extremes.minO2, r.oxygen);
  extremes.maxCo2 = Math.max(extremes.maxCo2, r.co2);
  extremes.maxNh3Ppm = Math.max(extremes.maxNh3Ppm, getPpm(r.ammonia, r.water));
  extremes.maxNo2Ppm = Math.max(extremes.maxNo2Ppm, getPpm(r.nitrite, r.water));
  extremes.maxNo3Ppm = Math.max(extremes.maxNo3Ppm, getPpm(r.nitrate, r.water));
  extremes.maxAlgae = Math.max(extremes.maxAlgae, state.algae.mass);
  extremes.minPh = Math.min(extremes.minPh, r.ph);
  extremes.maxPh = Math.max(extremes.maxPh, r.ph);
  extremes.minTemp = Math.min(extremes.minTemp, r.temperature);
  extremes.maxTemp = Math.max(extremes.maxTemp, r.temperature);
  extremes.maxWaste = Math.max(extremes.maxWaste, r.waste);
  extremes.maxFood = Math.max(extremes.maxFood, r.food);
  extremes.minWater = Math.min(extremes.minWater, r.water);
  extremes.maxTotalPlantSize = Math.max(
    extremes.maxTotalPlantSize,
    state.plants.reduce((sum, plant) => sum + plant.size, 0)
  );
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
  const roster = new Set(start.fish.map((fish) => fish.id));
  const stocked = roster.size;

  const samples: Sample[] = [sampleOf(start)];
  const extremes = openExtremes(start);
  const plantDeaths: PlantDeath[] = [];
  let firstDeathHour: number | null = null;

  const final = keep(start, days, routine, (hour, before, after) => {
    widen(extremes, after);

    const alive = new Set(after.plants.map((plant) => plant.id));
    for (const plant of before.plants) {
      if (!alive.has(plant.id)) plantDeaths.push({ species: plant.species, day: hour / DAY });
    }

    if (firstDeathHour === null && after.fish.filter((f) => roster.has(f.id)).length < stocked) {
      firstDeathHour = hour;
    }

    if (hour % DAY === sampleHour % DAY) samples.push(sampleOf(after));
  });

  return {
    samples,
    extremes,
    final,
    stocked,
    survivors: final.fish.filter((fish) => roster.has(fish.id)).length,
    firstDeathDay: firstDeathHour === null ? null : firstDeathHour / DAY,
    plantDeaths,
  };
}

/** The same tank under a different fixture, and optionally a different box. */
export function withLight(
  setup: SimulationConfig,
  par: number,
  capacity?: number
): SimulationConfig {
  return {
    ...setup,
    tankCapacity: capacity ?? setup.tankCapacity,
    light: { ...setup.light, enabled: par > 0, par },
  };
}
