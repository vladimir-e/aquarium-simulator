import { describe, it, expect } from 'vitest';
import { runSummary, summaryLines } from './summary';
import type { RunAggregates } from '../run/index.js';
import { createLog, type LogEntry } from '../../simulation/index.js';

const RUN: RunAggregates = {
  ticks: 1622,
  deaths: 2,
  births: 18,
  frySold: 6,
  alerts: 6,
  waterChangedL: 340,
};

const death = (tick: number): LogEntry =>
  createLog(tick, 'livestock', 'warning', 'Neon Tetra died', 'fish-died');
const nitriteAlert = (tick: number): LogEntry =>
  createLog(tick, 'nitrogen-cycle', 'warning', 'Nitrite crossed 0.25 ppm');

describe('runSummary', () => {
  it('states the run length in ticks and as elapsed time', () => {
    const { run } = runSummary(RUN, [], 'metric');
    expect(run.value).toBe('1622');
    expect(run.unit).toBe('ticks');
    expect(run.meta).toBe('67d 14h');
  });

  it('names the tick of the last death and of the latest alert', () => {
    const logs = [death(400), nitriteAlert(1584), death(1204), nitriteAlert(1600)];
    const tiles = runSummary(RUN, logs, 'metric');
    expect(tiles.deaths.meta).toBe('last T1204');
    expect(tiles.deaths.metaTick).toBe(1204);
    expect(tiles.alerts.meta).toBe('latest T1600');
    expect(tiles.alerts.metaTick).toBe(1600);
    expect(tiles.alerts.alert).toBe('nitrite');
  });

  it('leaves the tick unnamed when the run has not had one', () => {
    // loadPreset zeroes the counts and keeps the logs — a previous run's death
    // must not be quoted under "deaths 0".
    const tiles = runSummary({ ...RUN, deaths: 0, alerts: 0 }, [death(1204), nitriteAlert(1584)], 'metric');
    expect(tiles.deaths.meta).toBeUndefined();
    expect(tiles.deaths.metaTick).toBeUndefined();
    expect(tiles.alerts.meta).toBeUndefined();
    expect(tiles.alerts.alert).toBeUndefined();
  });

  it('reports fry sold under the births count, and only once any were', () => {
    expect(runSummary(RUN, [], 'metric').births.meta).toBe('6 sold');
    expect(runSummary({ ...RUN, frySold: 0 }, [], 'metric').births.meta).toBeUndefined();
  });

  it('states the water changed in the reader’s own units', () => {
    expect(runSummary(RUN, [], 'metric').water.value).toBe('340 L');
    expect(runSummary(RUN, [], 'imperial').water.value).toBe('90 gal');
  });

  it('agrees with itself about singulars', () => {
    const one = runSummary({ ticks: 1, deaths: 1, births: 1, frySold: 0, alerts: 1, waterChangedL: 0 }, [], 'metric');
    expect(one.run.descriptor).toBe('tick');
    expect(one.deaths.descriptor).toBe('death');
    expect(one.alerts.descriptor).toBe('alert');
    expect(runSummary(RUN, [], 'metric').deaths.descriptor).toBe('deaths');
  });
});

describe('summaryLines', () => {
  it('reads the run back in two lines', () => {
    expect(summaryLines(runSummary(RUN, [], 'metric'))).toEqual([
      '1622 ticks · 67d 14h',
      '6 alerts · 2 deaths · 18 fry',
    ]);
  });

  it('tracks the summary rather than restating it', () => {
    const quiet = summaryLines(runSummary({ ...RUN, ticks: 25, alerts: 0, deaths: 1 }, [], 'metric'));
    expect(quiet).toEqual(['25 ticks · 1d 1h', '0 alerts · 1 death · 18 fry']);
  });
});
