import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  biofilmKept,
  calculatePassiveResources,
  processEquipment,
  type PassiveResourceValues,
} from './index.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { getSubstrateSurface, type SubstrateType } from './substrate.js';
import {
  calculateTankHeight,
  createSimulation,
  type SimulationState,
  type SimulationConfig,
} from '../state.js';
import { calculateParAtDepth } from './light.js';
import { opticsDefaults } from '../config/optics.js';
import { FILTER_SURFACE, getFilterFlow } from './filter.js';
import { POWERHEAD_FLOW_LPH } from './powerhead.js';
import { calculateHardscapeTotalSurface, createHardscapeItem, type HardscapeItem } from './hardscape.js';

const passive = (state: SimulationState): PassiveResourceValues =>
  calculatePassiveResources(state, opticsDefaults);

const bare: SimulationConfig = {
  tankCapacity: 100,
  filter: { enabled: false },
  substrate: { type: 'none' },
  powerhead: { enabled: false },
};

const tank = (overrides: Partial<SimulationConfig> = {}): SimulationState =>
  createSimulation({ ...bare, ...overrides });

describe('calculatePassiveResources', () => {
  describe('surface', () => {
    it('gives a bare tank its glass', () => {
      const { surface } = passive(tank());
      expect(surface).toBeGreaterThan(0);
      expect(Number.isInteger(surface)).toBe(true);
    });

    it('adds the filter, substrate and hardscape on top of the glass', () => {
      const items: HardscapeItem[] = [
        createHardscapeItem('1', 'neutral_rock'),
        createHardscapeItem('2', 'driftwood'),
      ];
      const full = tank({
        filter: { enabled: true, type: 'hob' },
        substrate: { type: 'sand' },
        hardscape: { items },
      });

      expect(passive(full).surface).toBe(
        passive(tank()).surface +
          FILTER_SURFACE.hob +
          getSubstrateSurface('sand', 100) +
          calculateHardscapeTotalSurface(items)
      );
    });

    it('counts no surface for a disabled filter', () => {
      expect(passive(tank({ filter: { enabled: false, type: 'canister' } })).surface).toBe(
        passive(tank()).surface
      );
    });
  });

  describe('flow', () => {
    it('sums the filter and powerhead that are running', () => {
      expect(
        passive(
          tank({
            filter: { enabled: true, type: 'canister' },
            powerhead: { enabled: true, flowRateGPH: 600 },
          })
        ).flow
      ).toBe(getFilterFlow('canister', 100) + POWERHEAD_FLOW_LPH[600]);
    });

    it('counts nothing for disabled devices', () => {
      expect(
        passive(
          tank({
            filter: { enabled: false, type: 'hob' },
            powerhead: { enabled: false, flowRateGPH: 850 },
          })
        ).flow
      ).toBe(0);
    });
  });

  describe('light', () => {
    const atSubstrate = (capacity: number, surfacePar: number): number =>
      calculateParAtDepth(surfacePar, calculateTankHeight(capacity), opticsDefaults);

    const lit = (
      tick: number,
      light: Partial<SimulationState['equipment']['light']> = {},
      capacity = 100
    ): number =>
      passive(
        produce(tank({ tankCapacity: capacity }), (draft) => {
          draft.tick = tick;
          Object.assign(draft.equipment.light, light);
        })
      ).light;

    it('lands the fixture attenuated to the substrate while scheduled', () => {
      const light = lit(10, { par: 150, schedule: { startHour: 8, duration: 10 } });
      expect(light).toBeCloseTo(atSubstrate(100, 150), 10);
      expect(light).toBeLessThan(150);
    });

    it('is dark when disabled or off schedule', () => {
      expect(lit(10, { enabled: false })).toBe(0);
      expect(lit(20, { schedule: { startHour: 8, duration: 10 } })).toBe(0);
    });

    it('reads the hour of day off the tick, across days and midnight', () => {
      const overnight = { par: 50, schedule: { startHour: 22, duration: 8 } };
      expect(lit(23, overnight)).toBeCloseTo(atSubstrate(100, 50), 10);
      expect(lit(24 + 2, overnight)).toBeCloseTo(atSubstrate(100, 50), 10);
      expect(lit(48 + 10, overnight)).toBe(0);
    });

    it('lands the same fixture harder on a shallow tank than a deep one', () => {
      const at = (capacity: number): number => lit(10, { par: 90 }, capacity);

      expect(at(20)).toBeGreaterThan(at(40));
      expect(at(40)).toBeGreaterThan(at(150));
      expect(at(150)).toBeGreaterThan(at(300));
    });
  });
});

describe('biofilmKept', () => {
  const bedded = (substrate: SubstrateType): SimulationState =>
    createSimulation({ tankCapacity: 100, substrate: { type: substrate } });

  it('is the share of the surface the bed does not carry', () => {
    const state = bedded('aqua_soil');
    const bed = getSubstrateSurface('aqua_soil', state.tank.capacity);

    expect(biofilmKept(state)).toBeCloseTo(1 - bed / passive(state).surface, 12);
  });

  it('costs more the more of the tank’s surface the bed carries', () => {
    expect(biofilmKept(bedded('aqua_soil'))).toBeLessThan(biofilmKept(bedded('sand')));
  });

  it('costs a tank with no bed nothing at all', () => {
    expect(biofilmKept(bedded('none'))).toBe(1);
  });
});

describe('processEquipment', () => {
  it('fills the auto doser with the formula the config carries', () => {
    const tuned = produce(DEFAULT_CONFIG, (draft) => {
      draft.nutrients.fertilizerFormula.nitrate = 10;
    });
    const state = produce(createSimulation({ tankCapacity: 100 }), (draft) => {
      draft.tick = draft.equipment.autoDoser.schedule.startHour;
      draft.equipment.autoDoser.enabled = true;
      draft.equipment.autoDoser.doseAmountMl = 2;
    });

    const nitrate = processEquipment(state, tuned).effects.find(
      (effect) => effect.source === 'auto-doser' && effect.resource === 'nitrate'
    );
    expect(nitrate?.delta).toBe(20);
  });
});
