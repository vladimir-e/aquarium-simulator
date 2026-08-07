/**
 * A tank read as a trajectory rather than an end state. {@link runTank} samples
 * on a fixed cadence — one a day by default, hourly when the question is a
 * day/night curve — and records the day each plant left. {@link gasCurve} runs
 * one and reduces it to what the planting does to the dissolved gases, over the
 * hours it is grown-in for.
 *
 * An anchor asserts a number; a run report has to show the shape that number
 * sits on, and the shape is what these return. Both drive {@link keep}, the
 * same loop the anchors run, so a figure in a report and a figure in an
 * assertion come off one schedule.
 */

import { createSimulation, type SimulationConfig, type SimulationState } from '../state.js';
import type { PresetSeed } from '../seed.js';
import type { PlantSpecies } from '../plants/species.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { processPlants } from '../plants/index.js';
import { settleEnvironment } from '../tick.js';
import { DAY, DEFAULT_RNG_SEED, keep, type KeeperRoutine } from './tanks.js';

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
  /**
   * Each hour, with the state that went into the tick and the state it left
   * behind — for readings a sample can't carry, like the difference a tick made.
   */
  watch?: (hour: number, before: SimulationState, after: SimulationState) => void;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** The whole planting of a tank, summed — the size a run is quoted at. */
export const totalSize = (state: SimulationState): number =>
  state.plants.reduce((sum, plant) => sum + plant.size, 0);

function sampleOf(state: SimulationState): Sample {
  return {
    day: state.tick / DAY,
    algae: state.algae.mass,
    plants: state.plants.length,
    totalSize: totalSize(state),
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
  rngSeed = DEFAULT_RNG_SEED,
  sampleEvery = DAY,
  sampleHour = 12,
  watch,
}: RunOptions): RunResult {
  // A fractional cadence is not the cadence it names — 1.5 lands on every third
  // hour, wherever 1.5 divides — and a zero one lands nowhere at all.
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

    watch?.(hour, before, after);
  });

  return { samples, final, plantDeaths };
}

/** Days a tank is given to settle before any hour of it is read for gas. */
const SETTLING_DAYS = 2;

/**
 * How far off the planting a run finishes at an hour may sit and still count
 * as grown-in, as a share of it.
 */
const SETTLED_TOLERANCE = 0.1;

/** An hourly reading, tagged with the planting that produced it. */
interface Reading {
  value: number;
  size: number;
}

/**
 * An empty window is not a measurement — a mean over nothing reads zero, and a
 * zero that was never measured is indistinguishable from one that was.
 */
function meanOf(values: readonly number[], what: string): number {
  if (values.length === 0) throw new Error(`no ${what} in the grown-in window to read`);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** What a planting does to the dissolved gases, over the window it is grown-in for. */
export interface GasCurve extends RunResult {
  /** Mean gross oxygen photosynthesis releases in a lit hour of the window, mg/L. */
  gross: number;
  /** Mean nitrate those same hours draw, mg. */
  uptake: number;
  /**
   * Mean oxygen a night of the window sheds, dusk to first light, mg/L — null
   * when the window spans no whole night, as a run of a few days can. Half of
   * it is the day's supersaturation relaxing across the surface, so this is the
   * whole tank's fall and not the planting's own draw.
   */
  sag: number | null;
  /** Highest oxygen an hour of the window closed on, mg/L. */
  o2High: number;
  /** Lowest, over those same hours — the dark ones counted, so this is the floor. */
  o2Low: number;
  /** Mean total plant size across the lit hours the window kept. */
  size: number;
  /** Lit hours the window kept. */
  hours: number;
}

/** The reader installs its own {@link RunOptions.watch}; everything else is a run's. */
export type GasCurveOptions = Omit<RunOptions, 'watch'>;

/**
 * Run a tank and read its gas curve off the hours its planting is grown-in —
 * gross rather than net, since what a carbon yield is quoted on is what
 * photosynthesis makes before the tank spends any of it.
 *
 * The window is taken on plant size rather than on a day, because a planting
 * that climbs the whole run has no plateau to take it on, and the size such a
 * run is quoted at is where it *ends* rather than somewhere it settles. Gross
 * oxygen is very nearly linear in plant size, so a mean over the whole run is a
 * mean over the ramp and reads a tank half the size of the one the observable
 * names. A run that ends within {@link SETTLED_TOLERANCE} of the planting it
 * started with — one handed a grown-in tank at tick 0 — keeps every lit hour it
 * has, so the window is inert where there is no ramp worth leaving out.
 *
 * Every hour is read off {@link settleEnvironment}, which is the hour the tick
 * ran: `before` is the state the tick was *handed*, and it carries the previous
 * hour's light, so classifying on it counts dusk as lit and skips dawn. What
 * `before` is authoritative for is the water the hour opened on, which is what
 * bounds a night.
 */
export function gasCurve({ routine = {}, ...options }: GasCurveOptions): GasCurve {
  const config = routine.config ?? DEFAULT_CONFIG;
  const made: Reading[] = [];
  const drawn: Reading[] = [];
  const falls: Reading[] = [];
  const held: Reading[] = [];
  let dusk: number | null = null;

  const run = runTank({
    ...options,
    routine,
    watch: (hour, before, after) => {
      if (hour <= SETTLING_DAYS * DAY) return;
      const settled = settleEnvironment(before, config);
      const size = totalSize(settled);
      held.push({ value: after.resources.oxygen, size });

      if (settled.resources.light <= 0) {
        // A night opens at the hour the lights go out and not at any dark hour
        // after it, so a window opening mid-night has no dusk to measure from.
        if (before.resources.light > 0) dusk = before.resources.oxygen;
        return;
      }

      const { effects } = processPlants(settled, config);
      const off = (resource: string): number =>
        effects.find((e) => e.resource === resource && e.source === 'photosynthesis')?.delta ?? 0;
      made.push({ value: off('oxygen'), size });
      drawn.push({ value: -off('nitrate'), size });
      if (dusk !== null) {
        falls.push({ value: dusk - before.resources.oxygen, size });
        dusk = null;
      }
    },
  });

  const grownIn = totalSize(run.final);
  if (grownIn <= 0) throw new Error('the run ends with no planting to take a window on');

  const inWindow = (readings: readonly Reading[]): Reading[] =>
    readings.filter((reading) => Math.abs(reading.size - grownIn) <= SETTLED_TOLERANCE * grownIn);
  const values = (readings: readonly Reading[]): number[] =>
    readings.map((reading) => reading.value);

  const lit = inWindow(made);
  const water = values(inWindow(held));
  const nights = values(inWindow(falls));
  if (water.length === 0) throw new Error('no hour in the grown-in window to read');

  return {
    ...run,
    gross: meanOf(values(lit), 'lit hour'),
    uptake: meanOf(values(inWindow(drawn)), 'lit hour'),
    sag: nights.length === 0 ? null : mean(nights),
    o2High: Math.max(...water),
    o2Low: Math.min(...water),
    size: meanOf(
      lit.map((reading) => reading.size),
      'lit hour'
    ),
    hours: lit.length,
  };
}
