import { describe, it, expect } from 'vitest';
import { calculateEvaporation, evaporationSystem, LID_MULTIPLIERS } from './evaporation.js';
import { createSimulation, type LidType, type SimulationState } from '../state.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { evaporationDefaults } from '../config/evaporation.js';

const LIDS: LidType[] = ['none', 'mesh', 'full', 'sealed'];

describe('calculateEvaporation', () => {
  it('loses the base daily fraction when water and room agree', () => {
    expect(calculateEvaporation(100, 22, 22) * 24).toBeCloseTo(
      100 * evaporationDefaults.baseRatePerDay,
      10
    );
  });

  it('doubles per doubling interval of temperature gap, either side of the room', () => {
    const { tempDoublingInterval } = evaporationDefaults;
    const base = calculateEvaporation(100, 22, 22);

    expect(calculateEvaporation(100, 22 + tempDoublingInterval, 22)).toBeCloseTo(2 * base, 10);
    expect(calculateEvaporation(100, 22 + 2 * tempDoublingInterval, 22)).toBeCloseTo(4 * base, 10);
    expect(calculateEvaporation(100, 22 - tempDoublingInterval, 22)).toBeCloseTo(2 * base, 10);
  });

  it('scales with the water there is, and takes nothing from an empty tank', () => {
    expect(calculateEvaporation(100, 25, 22)).toBeCloseTo(2 * calculateEvaporation(50, 25, 22), 10);
    expect(calculateEvaporation(0, 25, 22)).toBe(0);
    expect(calculateEvaporation(-10, 25, 22)).toBe(0);
  });

  it('scales by the lid, which only ever holds water back', () => {
    const open = calculateEvaporation(100, 25, 22);

    expect(calculateEvaporation(100, 25, 22, 'none')).toBe(open);
    for (const lid of LIDS) {
      expect(calculateEvaporation(100, 25, 22, lid)).toBeCloseTo(open * LID_MULTIPLIERS[lid], 10);
      expect(LID_MULTIPLIERS[lid]).toBeLessThanOrEqual(1);
    }
    expect(calculateEvaporation(100, 25, 22, 'sealed')).toBe(0);
  });

  it('ranks the lids from open to sealed', () => {
    const rates = LIDS.map((lid) => LID_MULTIPLIERS[lid]);
    expect([...rates].sort((a, b) => b - a)).toEqual(rates);
  });
});

describe('evaporationSystem', () => {
  const tank = (lid: LidType = 'none'): SimulationState =>
    createSimulation({ tankCapacity: 100, initialTemperature: 25, roomTemperature: 22, lid: { type: lid } });

  it('takes water as one immediate effect', () => {
    const effects = evaporationSystem.update(tank(), DEFAULT_CONFIG);

    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({ tier: 'immediate', resource: 'water', source: 'evaporation' });
    expect(effects[0].delta).toBeLessThan(0);
  });

  it('emits nothing from an empty or sealed tank', () => {
    const empty = tank();
    expect(
      evaporationSystem.update({ ...empty, resources: { ...empty.resources, water: 0 } }, DEFAULT_CONFIG)
    ).toHaveLength(0);
    expect(evaporationSystem.update(tank('sealed'), DEFAULT_CONFIG)).toHaveLength(0);
  });
});
