import { describe, it, expect } from 'vitest';
import {
  calculateCo2Injection,
  formatCo2Rate,
  co2GeneratorUpdate,
  applyCo2GeneratorStateChange,
  CO2_MASS_RATE,
  BUBBLE_RATE_OPTIONS,
} from './co2-generator.js';
import { createSimulation } from '../state.js';

// Reference tank sizes for tests
const TANK_10GAL = 37.85; // 10 gallon in liters
const TANK_100L = 100;

describe('CO2 Generator constants', () => {
  it('has correct mass rate constant', () => {
    expect(CO2_MASS_RATE).toBe(57);
  });

  it('mass rate tuned for ~1.5 mg/L/hr in 10gal tank', () => {
    // At 1 bps in a 10gal (37.85L) tank, we want approximately 1.5 mg/L/hr
    const rate = CO2_MASS_RATE / TANK_10GAL;
    expect(rate).toBeCloseTo(1.5, 1); // Within 0.1 of 1.5
  });

  it('has correct bubble rate options', () => {
    expect(BUBBLE_RATE_OPTIONS).toEqual([0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]);
  });

  it('bubble rate options are in ascending order', () => {
    for (let i = 1; i < BUBBLE_RATE_OPTIONS.length; i++) {
      expect(BUBBLE_RATE_OPTIONS[i]).toBeGreaterThan(BUBBLE_RATE_OPTIONS[i - 1]);
    }
  });

  it('bubble rate options have 0.5 step increments', () => {
    for (let i = 1; i < BUBBLE_RATE_OPTIONS.length; i++) {
      expect(BUBBLE_RATE_OPTIONS[i] - BUBBLE_RATE_OPTIONS[i - 1]).toBeCloseTo(0.5, 5);
    }
  });
});

describe('calculateCo2Injection', () => {
  it('calculates CO2 injection based on bubble rate and tank capacity', () => {
    // 1 bps in 100L tank = 57 / 100 = 0.57 mg/L/hr
    const injection = calculateCo2Injection(1.0, TANK_100L);
    expect(injection).toBe(0.57);
  });

  it('scales linearly with bubble rate', () => {
    const low = calculateCo2Injection(1.0, TANK_100L);
    const high = calculateCo2Injection(2.0, TANK_100L);
    expect(high).toBe(low * 2);
  });

  it('scales inversely with tank capacity', () => {
    const smallTank = calculateCo2Injection(1.0, 50);
    const largeTank = calculateCo2Injection(1.0, 100);
    expect(smallTank).toBe(largeTank * 2);
  });

  it('produces higher concentration in smaller tanks', () => {
    const tank10gal = calculateCo2Injection(1.0, TANK_10GAL);
    const tank100L = calculateCo2Injection(1.0, TANK_100L);
    expect(tank10gal).toBeGreaterThan(tank100L);
    // 10gal is about 2.6x smaller, so rate should be ~2.6x higher
    expect(tank10gal / tank100L).toBeCloseTo(TANK_100L / TANK_10GAL, 1);
  });

  it('calculates correctly for minimum bubble rate', () => {
    // 0.5 bps in 100L = 28.5 / 100 = 0.285 mg/L/hr
    const injection = calculateCo2Injection(0.5, TANK_100L);
    expect(injection).toBe(0.285);
  });

  it('calculates correctly for maximum bubble rate', () => {
    // 5.0 bps in 100L = 285 / 100 = 2.85 mg/L/hr
    const injection = calculateCo2Injection(5.0, TANK_100L);
    expect(injection).toBe(2.85);
  });

  it('returns 0 for zero bubble rate', () => {
    const injection = calculateCo2Injection(0, TANK_100L);
    expect(injection).toBe(0);
  });

  it('returns 0 for zero tank capacity', () => {
    const injection = calculateCo2Injection(1.0, 0);
    expect(injection).toBe(0);
  });

  it('returns 0 for negative tank capacity', () => {
    const injection = calculateCo2Injection(1.0, -100);
    expect(injection).toBe(0);
  });

  it('handles fractional bubble rates', () => {
    // 1.5 bps in 100L = 85.5 / 100 = 0.855 mg/L/hr
    const injection = calculateCo2Injection(1.5, TANK_100L);
    expect(injection).toBe(0.855);
  });

  it('uses correct mass rate constant', () => {
    const bubbleRate = 2.0;
    const tankCapacity = 100;
    const expected = (bubbleRate * CO2_MASS_RATE) / tankCapacity;
    expect(calculateCo2Injection(bubbleRate, tankCapacity)).toBe(expected);
  });
});

describe('formatCo2Rate', () => {
  it('formats rate with correct unit', () => {
    // 1 bps in 100L = 0.57 mg/L/hr
    const formatted = formatCo2Rate(1.0, TANK_100L);
    expect(formatted).toBe('+0.6 mg/L/hr');
  });

  it('shows one decimal place', () => {
    // 2 bps in 100L = 1.14 mg/L/hr → +1.1
    const formatted = formatCo2Rate(2.0, TANK_100L);
    expect(formatted).toBe('+1.1 mg/L/hr');
  });

  it('includes plus sign prefix', () => {
    const formatted = formatCo2Rate(0.5, TANK_100L);
    expect(formatted.startsWith('+')).toBe(true);
  });

  it('formats for 10gal tank correctly', () => {
    // 1 bps in 10gal ≈ 1.5 mg/L/hr
    const formatted = formatCo2Rate(1.0, TANK_10GAL);
    expect(formatted).toBe('+1.5 mg/L/hr');
  });

  it('formats minimum bubble rate in 100L tank', () => {
    // 0.5 bps in 100L = 0.285 → +0.3
    const formatted = formatCo2Rate(0.5, TANK_100L);
    expect(formatted).toBe('+0.3 mg/L/hr');
  });

  it('formats maximum bubble rate in 100L tank', () => {
    // 5.0 bps in 100L = 2.85 → +2.9
    const formatted = formatCo2Rate(5.0, TANK_100L);
    expect(formatted).toBe('+2.9 mg/L/hr');
  });
});

describe('co2GeneratorUpdate', () => {
  describe('when enabled and schedule active', () => {
    it('injects CO2 when schedule is active', () => {
      const state = createSimulation({
        tankCapacity: 100,
        co2Generator: {
          enabled: true,
          bubbleRate: 1.0,
          schedule: { startHour: 8, duration: 12 },
        },
      });
      // Set tick to hour 10 (within schedule)
      const stateAtHour10 = { ...state, tick: 10 };

      const { effects, isOn } = co2GeneratorUpdate(stateAtHour10);

      expect(isOn).toBe(true);
      expect(effects).toHaveLength(1);
      expect(effects[0].tier).toBe('active');
      expect(effects[0].resource).toBe('co2');
      expect(effects[0].delta).toBe(0.57); // 57 / 100
      expect(effects[0].source).toBe('co2-generator');
    });

    it('injection scales with bubble rate', () => {
      const state1 = createSimulation({
        tankCapacity: 100,
        co2Generator: {
          enabled: true,
          bubbleRate: 1.0,
          schedule: { startHour: 0, duration: 24 },
        },
      });
      const state2 = createSimulation({
        tankCapacity: 100,
        co2Generator: {
          enabled: true,
          bubbleRate: 3.0,
          schedule: { startHour: 0, duration: 24 },
        },
      });

      const result1 = co2GeneratorUpdate(state1);
      const result2 = co2GeneratorUpdate(state2);

      expect(result2.effects[0].delta).toBe(result1.effects[0].delta * 3);
    });

    it('injection scales inversely with tank capacity', () => {
      const smallTankState = createSimulation({
        tankCapacity: 50,
        co2Generator: {
          enabled: true,
          bubbleRate: 1.0,
          schedule: { startHour: 0, duration: 24 },
        },
      });
      const largeTankState = createSimulation({
        tankCapacity: 100,
        co2Generator: {
          enabled: true,
          bubbleRate: 1.0,
          schedule: { startHour: 0, duration: 24 },
        },
      });

      const smallResult = co2GeneratorUpdate(smallTankState);
      const largeResult = co2GeneratorUpdate(largeTankState);

      // 50L tank should have 2x the concentration increase
      expect(smallResult.effects[0].delta).toBe(largeResult.effects[0].delta * 2);
    });

    it('works at schedule start hour', () => {
      const state = createSimulation({
        tankCapacity: 100,
        co2Generator: {
          enabled: true,
          bubbleRate: 2.0,
          schedule: { startHour: 7, duration: 12 },
        },
      });
      const stateAtHour7 = { ...state, tick: 7 };

      const { effects, isOn } = co2GeneratorUpdate(stateAtHour7);

      expect(isOn).toBe(true);
      expect(effects).toHaveLength(1);
      expect(effects[0].delta).toBe(1.14); // 2 * 57 / 100
    });

    it('works at last hour of schedule', () => {
      const state = createSimulation({
        tankCapacity: 100,
        co2Generator: {
          enabled: true,
          bubbleRate: 2.0,
          schedule: { startHour: 7, duration: 12 }, // 7-19 (ends at 18)
        },
      });
      const stateAtHour18 = { ...state, tick: 18 };

      const { effects, isOn } = co2GeneratorUpdate(stateAtHour18);

      expect(isOn).toBe(true);
      expect(effects).toHaveLength(1);
    });
  });

  describe('when schedule inactive', () => {
    it('does not inject when before schedule', () => {
      const state = createSimulation({
        tankCapacity: 100,
        co2Generator: {
          enabled: true,
          bubbleRate: 2.0,
          schedule: { startHour: 8, duration: 12 },
        },
      });
      const stateAtHour5 = { ...state, tick: 5 };

      const { effects, isOn } = co2GeneratorUpdate(stateAtHour5);

      expect(isOn).toBe(false);
      expect(effects).toHaveLength(0);
    });

    it('does not inject when after schedule', () => {
      const state = createSimulation({
        tankCapacity: 100,
        co2Generator: {
          enabled: true,
          bubbleRate: 2.0,
          schedule: { startHour: 8, duration: 10 }, // 8-18 (ends at 17)
        },
      });
      const stateAtHour20 = { ...state, tick: 20 };

      const { effects, isOn } = co2GeneratorUpdate(stateAtHour20);

      expect(isOn).toBe(false);
      expect(effects).toHaveLength(0);
    });

    it('does not inject at hour just after schedule ends', () => {
      const state = createSimulation({
        tankCapacity: 100,
        co2Generator: {
          enabled: true,
          bubbleRate: 2.0,
          schedule: { startHour: 7, duration: 12 }, // 7-19 (ends at 18)
        },
      });
      const stateAtHour19 = { ...state, tick: 19 };

      const { effects, isOn } = co2GeneratorUpdate(stateAtHour19);

      expect(isOn).toBe(false);
      expect(effects).toHaveLength(0);
    });
  });

  describe('when disabled', () => {
    it('does not inject when disabled even if schedule active', () => {
      const state = createSimulation({
        tankCapacity: 100,
        co2Generator: {
          enabled: false,
          bubbleRate: 2.0,
          schedule: { startHour: 0, duration: 24 },
        },
      });

      const { effects, isOn } = co2GeneratorUpdate(state);

      expect(isOn).toBe(false);
      expect(effects).toHaveLength(0);
    });
  });

  describe('schedule wrapping', () => {
    it('handles schedule that wraps around midnight', () => {
      const state = createSimulation({
        tankCapacity: 100,
        co2Generator: {
          enabled: true,
          bubbleRate: 1.0,
          schedule: { startHour: 22, duration: 6 }, // 22:00 to 04:00
        },
      });

      // Test at 23:00 (within schedule)
      const stateAtHour23 = { ...state, tick: 23 };
      const result1 = co2GeneratorUpdate(stateAtHour23);
      expect(result1.isOn).toBe(true);

      // Test at 2:00 (within schedule, after midnight)
      const stateAtHour2 = { ...state, tick: 2 };
      const result2 = co2GeneratorUpdate(stateAtHour2);
      expect(result2.isOn).toBe(true);

      // Test at 5:00 (outside schedule)
      const stateAtHour5 = { ...state, tick: 5 };
      const result3 = co2GeneratorUpdate(stateAtHour5);
      expect(result3.isOn).toBe(false);
    });

    it('uses modulo for ticks beyond 24 hours', () => {
      const state = createSimulation({
        tankCapacity: 100,
        co2Generator: {
          enabled: true,
          bubbleRate: 1.0,
          schedule: { startHour: 8, duration: 12 },
        },
      });

      // tick 34 = hour 10 (34 % 24 = 10)
      const stateAtTick34 = { ...state, tick: 34 };
      const result = co2GeneratorUpdate(stateAtTick34);

      expect(result.isOn).toBe(true);
      expect(result.effects).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('handles minimum bubble rate', () => {
      const state = createSimulation({
        tankCapacity: 100,
        co2Generator: {
          enabled: true,
          bubbleRate: 0.5,
          schedule: { startHour: 0, duration: 24 },
        },
      });

      const { effects } = co2GeneratorUpdate(state);

      expect(effects[0].delta).toBe(0.285); // 0.5 * 57 / 100
    });

    it('handles maximum bubble rate', () => {
      const state = createSimulation({
        tankCapacity: 100,
        co2Generator: {
          enabled: true,
          bubbleRate: 5.0,
          schedule: { startHour: 0, duration: 24 },
        },
      });

      const { effects } = co2GeneratorUpdate(state);

      expect(effects[0].delta).toBe(2.85); // 5.0 * 57 / 100
    });
  });
});

describe('applyCo2GeneratorStateChange', () => {
  it('updates isOn state when different', () => {
    const state = createSimulation({
      tankCapacity: 100,
      co2Generator: {
        enabled: true,
        isOn: false,
        bubbleRate: 1.0,
        schedule: { startHour: 8, duration: 12 },
      },
    });

    const newState = applyCo2GeneratorStateChange(state, true);

    expect(newState.equipment.co2Generator.isOn).toBe(true);
    expect(newState).not.toBe(state);
  });

  it('returns same state when isOn unchanged', () => {
    const state = createSimulation({
      tankCapacity: 100,
      co2Generator: {
        enabled: true,
        isOn: true,
        bubbleRate: 1.0,
        schedule: { startHour: 8, duration: 12 },
      },
    });

    const newState = applyCo2GeneratorStateChange(state, true);

    expect(newState).toBe(state);
  });

  it('does not mutate original state', () => {
    const state = createSimulation({
      tankCapacity: 100,
      co2Generator: {
        enabled: true,
        isOn: false,
        bubbleRate: 1.0,
        schedule: { startHour: 8, duration: 12 },
      },
    });

    applyCo2GeneratorStateChange(state, true);

    expect(state.equipment.co2Generator.isOn).toBe(false);
  });

  it('can toggle from on to off', () => {
    const state = createSimulation({
      tankCapacity: 100,
      co2Generator: {
        enabled: true,
        isOn: true,
        bubbleRate: 1.0,
        schedule: { startHour: 8, duration: 12 },
      },
    });

    const newState = applyCo2GeneratorStateChange(state, false);

    expect(newState.equipment.co2Generator.isOn).toBe(false);
  });

  it('preserves other co2Generator properties', () => {
    const state = createSimulation({
      tankCapacity: 100,
      co2Generator: {
        enabled: true,
        isOn: false,
        bubbleRate: 2.5,
        schedule: { startHour: 7, duration: 10 },
      },
    });

    const newState = applyCo2GeneratorStateChange(state, true);

    expect(newState.equipment.co2Generator.enabled).toBe(true);
    expect(newState.equipment.co2Generator.bubbleRate).toBe(2.5);
    expect(newState.equipment.co2Generator.schedule).toEqual({ startHour: 7, duration: 10 });
  });
});

describe('default CO2 generator configuration', () => {
  it('has default schedule starting 1 hour before lights', () => {
    const state = createSimulation({ tankCapacity: 100 });

    // Default lights are 8-20, so CO2 default should be 7-17 (10 hours)
    expect(state.equipment.co2Generator.schedule.startHour).toBe(7);
    expect(state.equipment.co2Generator.schedule.duration).toBe(10);
  });

  it('is disabled by default', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.equipment.co2Generator.enabled).toBe(false);
  });

  it('has default bubble rate of 1.0 bps', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.equipment.co2Generator.bubbleRate).toBe(1.0);
  });

  it('has isOn false by default', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.equipment.co2Generator.isOn).toBe(false);
  });
});
