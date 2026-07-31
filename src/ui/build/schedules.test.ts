import { describe, it, expect } from 'vitest';
import { createSimulation, tick, type SimulationState } from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { hourLabel, scheduleBand, scheduleRange, scheduleSpans } from './schedules';

const base: SimulationState = createSimulation({ tankCapacity: 40 });

/** Advance the tank to a given hour of day 1. */
function atHour(hour: number, state: SimulationState = base): SimulationState {
  let next = state;
  for (let i = 0; i < hour; i++) next = tick(next, DEFAULT_CONFIG);
  return next;
}

describe('scheduleSpans', () => {
  it('lights one stretch for a daytime schedule', () => {
    expect(scheduleSpans({ startHour: 6, duration: 12 })).toEqual([{ from: 0.25, to: 0.75 }]);
  });

  it('lights both ends of the track when the schedule crosses midnight', () => {
    expect(scheduleSpans({ startHour: 22, duration: 4 })).toEqual([
      { from: 22 / 24, to: 1 },
      { from: 0, to: 2 / 24 },
    ]);
  });

  it('fills the day for a 24 h schedule and stays inside the track past it', () => {
    expect(scheduleSpans({ startHour: 0, duration: 24 })).toEqual([{ from: 0, to: 1 }]);
    expect(scheduleSpans({ startHour: 8, duration: 48 })).toEqual([
      { from: 8 / 24, to: 1 },
      { from: 0, to: 8 / 24 },
    ]);
  });
});

describe('scheduleRange', () => {
  it('pads both ends and wraps past midnight', () => {
    expect(scheduleRange({ startHour: 8, duration: 10 })).toBe('08:00–18:00');
    expect(scheduleRange({ startHour: 22, duration: 5 })).toBe('22:00–03:00');
    expect(hourLabel(0)).toBe('00:00');
  });
});

describe('scheduleBand', () => {
  it('puts the cursor on the tank’s hour of day', () => {
    expect(scheduleBand(base).hour).toBe(0);
    expect(scheduleBand(atHour(14)).hour).toBe(14);
  });

  it('carries the three scheduled devices, in band order', () => {
    expect(scheduleBand(base).rows.map((r) => r.id)).toEqual([
      'light',
      'co2Generator',
      'autoDoser',
    ]);
  });

  it('marks the light active only while its photoperiod covers the hour', () => {
    const light = (state: SimulationState): boolean =>
      scheduleBand(state).rows[0].active;
    // Default photoperiod is 08:00–18:00.
    expect(light(atHour(7))).toBe(false);
    expect(light(atHour(9))).toBe(true);
    expect(light(atHour(19))).toBe(false);
  });

  it('gives the doser the single hour it fires in', () => {
    const dosing: SimulationState = {
      ...base,
      equipment: {
        ...base.equipment,
        autoDoser: { ...base.equipment.autoDoser, enabled: true },
      },
    };
    const row = scheduleBand(dosing).rows[2];
    expect(row.spans).toEqual([{ from: 8 / 24, to: 9 / 24 }]);
    expect(row.detail).toBe('08:00 · 2.0 ml');
    expect(scheduleBand(atHour(8, dosing)).rows[2].active).toBe(true);
    expect(scheduleBand(atHour(9, dosing)).rows[2].active).toBe(false);
  });

  it('states what an off device would do instead of plotting it', () => {
    const row = scheduleBand(base).rows[1];
    expect(row.enabled).toBe(false);
    expect(row.spans).toEqual([]);
    expect(row.detail).toBe('off · would run 07:00–17:00');
    expect(scheduleBand(base).rows[2].detail).toBe('off · would dose at 08:00');
  });
});
