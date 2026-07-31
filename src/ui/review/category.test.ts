import { describe, it, expect } from 'vitest';
import {
  categorizeLog,
  filterLogs,
  isAlertLog,
  classifyAlert,
  latestAlert,
  LOG_FILTERS,
} from './category';
import { createLog, type LogEntry } from '../../simulation/index.js';

describe('categorizeLog', () => {
  it('tags any lifecycle event as life, regardless of source', () => {
    expect(categorizeLog(createLog(1, 'simulation', 'info', 'hatched', 'eggs-hatched', 4))).toBe('life');
    expect(categorizeLog(createLog(1, 'simulation', 'warning', 'died', 'fish-died'))).toBe('life');
    expect(categorizeLog(createLog(1, 'simulation', 'warning', 'Java Fern died', 'plant-died'))).toBe('life');
    expect(categorizeLog(createLog(1, 'user', 'info', 'sold', 'fry-sold', 100))).toBe('life');
  });

  it('tags chemistry sources as cycle', () => {
    for (const source of ['nitrogen-cycle', 'gas-exchange', 'algae', 'evaporation']) {
      expect(categorizeLog(createLog(1, source, 'warning', 'x'))).toBe('cycle');
    }
  });

  it('tags player-driven sources as user', () => {
    for (const source of ['user', 'equipment', 'scrub']) {
      expect(categorizeLog(createLog(1, source, 'info', 'x'))).toBe('user');
    }
  });

  it('falls back to sim for engine chatter without an event', () => {
    expect(categorizeLog(createLog(0, 'simulation', 'info', 'Simulation reset'))).toBe('sim');
    expect(categorizeLog(createLog(0, 'simulation', 'warning', 'unclassified anomaly'))).toBe('sim');
  });
});

describe('filterLogs', () => {
  const logs: LogEntry[] = [
    createLog(0, 'simulation', 'info', 'created'),
    createLog(1, 'user', 'info', 'added fish'),
    createLog(2, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.109 ppm'),
    createLog(3, 'simulation', 'info', 'hatched', 'eggs-hatched', 4),
  ];

  it('passes everything through the all filter', () => {
    expect(filterLogs(logs, 'all')).toHaveLength(4);
  });

  it('narrows to a single category', () => {
    expect(filterLogs(logs, 'cycle').map((l) => l.tick)).toEqual([2]);
    expect(filterLogs(logs, 'user').map((l) => l.tick)).toEqual([1]);
    expect(filterLogs(logs, 'life').map((l) => l.tick)).toEqual([3]);
  });

  it('leaves sim-only lines reachable only through all', () => {
    for (const filter of LOG_FILTERS) {
      const shown = filterLogs(logs, filter);
      const hasCreated = shown.some((l) => l.message === 'created');
      expect(hasCreated).toBe(filter === 'all');
    }
  });
});

describe('isAlertLog', () => {
  it('counts chemistry and plant-death warnings', () => {
    expect(isAlertLog(createLog(1, 'nitrogen-cycle', 'warning', 'high ammonia'))).toBe(true);
    expect(isAlertLog(createLog(1, 'simulation', 'warning', 'plant died', 'plant-died'))).toBe(true);
  });

  it('excludes a fish death (a death, not an alert) and info lines', () => {
    expect(isAlertLog(createLog(1, 'simulation', 'warning', 'died', 'fish-died'))).toBe(false);
    expect(isAlertLog(createLog(1, 'user', 'info', 'fed fish'))).toBe(false);
  });
});

describe('classifyAlert', () => {
  it('maps nitrogen-cycle warnings by their vital', () => {
    expect(classifyAlert(createLog(1, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.1 ppm'))).toBe('ammonia');
    expect(classifyAlert(createLog(1, 'nitrogen-cycle', 'warning', 'High nitrite level: 1.2 ppm'))).toBe('nitrite');
    expect(classifyAlert(createLog(1, 'nitrogen-cycle', 'warning', 'High nitrate level: 90 ppm'))).toBe('nitrate');
  });

  it('splits gas-exchange into oxygen and co2', () => {
    expect(classifyAlert(createLog(1, 'gas-exchange', 'warning', 'Low oxygen level: 3.5 mg/L'))).toBe('oxygen');
    expect(classifyAlert(createLog(1, 'gas-exchange', 'warning', 'High CO2 level: 35 mg/L'))).toBe('co2');
  });

  it('maps algae, water, and plant-death alerts', () => {
    expect(classifyAlert(createLog(1, 'algae', 'warning', 'High algae level: 85'))).toBe('algae');
    expect(classifyAlert(createLog(1, 'evaporation', 'warning', 'Water level critical: 30L'))).toBe('water');
    expect(classifyAlert(createLog(1, 'simulation', 'warning', 'Anubias died from poor conditions', 'plant-died'))).toBe('plant');
  });

  it('returns null for non-alert lines and unclassified engine warnings', () => {
    expect(classifyAlert(createLog(1, 'user', 'info', 'fed fish'))).toBeNull();
    expect(classifyAlert(createLog(1, 'simulation', 'warning', 'died', 'fish-died'))).toBeNull();
    expect(classifyAlert(createLog(1, 'simulation', 'warning', 'unclassified anomaly'))).toBeNull();
  });
});

describe('latestAlert', () => {
  it('returns the most recent classifiable alert', () => {
    const logs: LogEntry[] = [
      createLog(2, 'nitrogen-cycle', 'warning', 'High nitrite level: 1.2 ppm'),
      createLog(5, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.2 ppm'),
      createLog(6, 'user', 'info', 'fed fish'),
    ];
    expect(latestAlert(logs)).toEqual({ tick: 5, kind: 'ammonia' });
  });

  it('returns null when nothing qualifies', () => {
    expect(latestAlert([createLog(1, 'user', 'info', 'fed fish')])).toBeNull();
    expect(latestAlert([])).toBeNull();
  });
});
