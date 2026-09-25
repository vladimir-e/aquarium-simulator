import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  calculateCo2Injection,
  formatCo2Rate,
  co2GeneratorUpdate,
  applyCo2GeneratorStateChange,
  CO2_MASS_RATE,
  BUBBLE_RATE_OPTIONS,
} from './co2-generator.js';
import { createSimulation, type Co2Generator, type SimulationState } from '../state.js';

function tank(
  generator: Partial<Co2Generator> = {},
  { capacity = 100, tick = 0 } = {}
): SimulationState {
  return {
    ...createSimulation({
      tankCapacity: capacity,
      co2Generator: {
        enabled: true,
        bubbleRate: 1,
        schedule: { startHour: 0, duration: 24 },
        ...generator,
      },
    }),
    tick,
  };
}

describe('BUBBLE_RATE_OPTIONS', () => {
  it('ascends', () => {
    expect([...BUBBLE_RATE_OPTIONS].sort((a, b) => a - b)).toEqual([...BUBBLE_RATE_OPTIONS]);
  });
});

describe('calculateCo2Injection', () => {
  it('is bubble rate × mass rate over the water', () => {
    expect(calculateCo2Injection(2, 100)).toBe((2 * CO2_MASS_RATE) / 100);
  });

  it('doubles with the bubble rate and halves with twice the water', () => {
    expect(calculateCo2Injection(2, 100)).toBe(2 * calculateCo2Injection(1, 100));
    expect(calculateCo2Injection(1, 50)).toBe(2 * calculateCo2Injection(1, 100));
  });

  it('is zero with no bubbles or no water', () => {
    expect(calculateCo2Injection(0, 100)).toBe(0);
    expect(calculateCo2Injection(1, 0)).toBe(0);
    expect(calculateCo2Injection(1, -100)).toBe(0);
  });
});

describe('formatCo2Rate', () => {
  it('prints the injection as a signed rate to one decimal', () => {
    expect(formatCo2Rate(1, 100)).toBe(`+${calculateCo2Injection(1, 100).toFixed(1)} mg/L/hr`);
  });
});

describe('co2GeneratorUpdate', () => {
  it('injects its rate into the water as one active effect while scheduled', () => {
    const { effects, isOn } = co2GeneratorUpdate(tank({ bubbleRate: 2 }));

    expect(isOn).toBe(true);
    expect(effects).toEqual([
      expect.objectContaining({
        tier: 'active',
        resource: 'co2',
        source: 'co2-generator',
        delta: calculateCo2Injection(2, 100),
      }),
    ]);
  });

  it('doses the water in the tank, not the glass around it', () => {
    const state = tank();
    const evaporated = produce(state, (draft) => {
      draft.resources.water = 50;
    });

    expect(co2GeneratorUpdate(evaporated).effects[0].delta).toBe(
      co2GeneratorUpdate(state).effects[0].delta * 2
    );
  });

  it('runs from the start hour up to, not including, the end hour', () => {
    const at = (tick: number): boolean =>
      co2GeneratorUpdate(tank({ schedule: { startHour: 7, duration: 12 } }, { tick })).isOn;

    expect(at(6)).toBe(false);
    expect(at(7)).toBe(true);
    expect(at(18)).toBe(true);
    expect(at(19)).toBe(false);
    expect(at(24 + 10)).toBe(true);
  });

  it('wraps a schedule across midnight', () => {
    const at = (tick: number): boolean =>
      co2GeneratorUpdate(tank({ schedule: { startHour: 22, duration: 6 } }, { tick })).isOn;

    expect(at(23)).toBe(true);
    expect(at(2)).toBe(true);
    expect(at(5)).toBe(false);
  });

  it('does nothing when disabled', () => {
    const { effects, isOn } = co2GeneratorUpdate(tank({ enabled: false }));

    expect(isOn).toBe(false);
    expect(effects).toHaveLength(0);
  });
});

describe('applyCo2GeneratorStateChange', () => {
  it('flips isOn without touching the rest or the original', () => {
    const state = tank({ isOn: false, bubbleRate: 2.5 });
    const next = applyCo2GeneratorStateChange(state, true);

    expect(next.equipment.co2Generator).toEqual({ ...state.equipment.co2Generator, isOn: true });
    expect(state.equipment.co2Generator.isOn).toBe(false);
  });

  it('returns the same state when nothing changes', () => {
    const state = tank({ isOn: true });
    expect(applyCo2GeneratorStateChange(state, true)).toBe(state);
  });
});
