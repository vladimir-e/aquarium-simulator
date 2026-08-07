import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import type { SimulationConfig, SimulationState } from '../state.js';
import type { PresetSeed } from '../seed.js';
import { DAY } from './tanks.js';
import { gasCurve, runTank, totalSize } from './metrics.js';

const TANK: SimulationConfig = {
  tankCapacity: 40,
  substrate: { type: 'aqua_soil' },
  filter: { enabled: true, type: 'canister' },
  ato: { enabled: true },
};

/** The same tank on a CO₂ injector, so the gases have a day/night swing to be read. */
const INJECTED: SimulationConfig = {
  ...TANK,
  co2Generator: { enabled: true, bubbleRate: 1.0, schedule: { startHour: 7, duration: 10 } },
};

const PLANTED: PresetSeed = {
  bacteria: 'cycled',
  plants: [{ species: 'java_fern', count: 1, size: 40 }],
};

/** Condemn the planting at a named hour, so a death has a day to be checked against. */
const condemnAt =
  (hour: number) =>
  (state: SimulationState): SimulationState =>
    state.tick !== hour - 1
      ? state
      : produce(state, (draft) => {
          for (const plant of draft.plants) plant.condition = 0;
        });

describe('runTank', () => {
  it('runs the days it was asked for', () => {
    expect(runTank({ setup: TANK, days: 3 }).final.tick).toBe(3 * DAY);
  });

  it('takes day 0 plus one sample a day, at the named hour', () => {
    const run = runTank({ setup: TANK, days: 5, sampleHour: 7 });

    expect(run.samples.map((sample) => sample.day * DAY)).toEqual([0, 7, 31, 55, 79, 103]);
  });

  it('moves every sample with sampleHour', () => {
    const noon = runTank({ setup: TANK, days: 3 });
    const dawn = runTank({ setup: TANK, days: 3, sampleHour: 5 });

    expect(noon.samples).toHaveLength(dawn.samples.length);
    for (let i = 1; i < noon.samples.length; i++) {
      expect(noon.samples[i]!.day - dawn.samples[i]!.day).toBeCloseTo(7 / DAY, 10);
    }
  });

  it('reads the planting off each sample', () => {
    const run = runTank({ setup: TANK, seed: PLANTED, days: 2 });
    const opening = run.samples[0]!;

    expect(opening.plants).toBe(1);
    expect(opening.totalSize).toBe(40);
    expect(opening.avgCondition).toBe(100);
  });

  it('reads the dissolved gases off each sample', () => {
    const run = runTank({ setup: TANK, days: 2, sampleEvery: 1 });
    const last = run.samples[run.samples.length - 1]!;

    expect(last.day).toBe(2);
    expect(last.oxygen).toBe(run.final.resources.oxygen);
    expect(last.co2).toBe(run.final.resources.co2);
  });

  it('resolves a swing inside a single day', () => {
    const co2 = runTank({ setup: INJECTED, days: 2, sampleEvery: 1 })
      .samples.filter((sample) => sample.day > 1)
      .map((sample) => sample.co2);

    expect(Math.max(...co2) - Math.min(...co2)).toBeGreaterThan(1);
  });

  it('takes the whole day at an hourly cadence', () => {
    const run = runTank({ setup: TANK, days: 1, sampleEvery: 1 });

    expect(run.samples.map((sample) => sample.day * DAY)).toEqual(
      Array.from({ length: DAY + 1 }, (_, hour) => hour)
    );
  });

  it('keeps sampleHour as the phase of any cadence', () => {
    const run = runTank({ setup: TANK, days: 2, sampleEvery: 6, sampleHour: 7 });
    const hours = run.samples.map((sample) => sample.day * DAY);

    expect(hours).toEqual([0, 1, 7, 13, 19, 25, 31, 37, 43]);
  });

  it('reads the same tank whatever the cadence', () => {
    const options = { setup: INJECTED, seed: PLANTED, days: 2 };
    const daily = runTank(options);
    const hourly = runTank({ ...options, sampleEvery: 1 });

    expect(daily.samples).toEqual([0, 12, 36].map((hour) => hourly.samples[hour]!));
  });

  it('hands every hour to a watcher, either side of the tick', () => {
    const hours: number[] = [];
    let advanced = 0;
    runTank({
      setup: TANK,
      days: 1,
      watch: (hour, before, after) => {
        hours.push(hour);
        if (after.tick - before.tick === 1) advanced += 1;
      },
    });

    expect(hours).toEqual(Array.from({ length: DAY }, (_, index) => index + 1));
    expect(advanced).toBe(DAY);
  });

  it('refuses a cadence it cannot honour', () => {
    expect(() => runTank({ setup: TANK, days: 1, sampleEvery: 0 })).toThrow(/sampleEvery/);
    expect(() => runTank({ setup: TANK, days: 1, sampleEvery: 1.5 })).toThrow(/sampleEvery/);
  });

  it('records the day a plant left, whatever the sampling misses', () => {
    const run = runTank({
      setup: TANK,
      seed: PLANTED,
      days: 5,
      routine: { hold: condemnAt(2.5 * DAY) },
    });

    expect(run.plantDeaths).toEqual([{ species: 'java_fern', day: 2.5 }]);
    expect(run.final.plants).toEqual([]);
  });

  it('runs the same tank twice on one seed', () => {
    const options = { setup: TANK, seed: PLANTED, days: 4, rngSeed: 77 };

    expect(runTank(options).samples).toEqual(runTank(options).samples);
  });
});

describe('gasCurve', () => {
  /** The injected tank with a fixture on it, so there are lit hours to read. */
  const LIT: SimulationConfig = {
    ...INJECTED,
    light: { enabled: true, par: 90, schedule: { startHour: 8, duration: 12 } },
  };

  it('reads what the planting made off the lit hours of the window', () => {
    const curve = gasCurve({ setup: LIT, seed: PLANTED, days: 5 });

    expect(curve.hours).toBeGreaterThan(0);
    expect(curve.gross).toBeGreaterThan(0);
    expect(curve.uptake).toBeGreaterThan(0);
  });

  it('leaves out the hours a still-growing planting was smaller in', () => {
    const days = 30;
    const curve = gasCurve({ setup: LIT, seed: PLANTED, days });
    const grownIn = totalSize(curve.final);

    // Every lit hour past the two settling days, had the window kept them all.
    const wholeRun = (days - 2) * 12;

    // The planting this run opens on is outside the window it closes on, so
    // there are hours the window has to drop.
    expect(curve.samples[0]!.totalSize).toBeLessThan(0.9 * grownIn);
    expect(curve.hours).toBeGreaterThan(0);
    expect(curve.hours).toBeLessThan(wholeRun);
    expect(curve.size).toBeGreaterThan(0.9 * grownIn);
  });

  it('refuses a run whose planting did not survive to define a window', () => {
    // A dead planting finishes at size 0, and a window taken as a share of
    // that keeps only the tank's plantless hours — whose mean is a zero
    // indistinguishable from a measured one.
    expect(() =>
      gasCurve({ setup: LIT, seed: PLANTED, days: 5, routine: { hold: condemnAt(2.5 * DAY) } })
    ).toThrow(/no planting/);
  });
});
