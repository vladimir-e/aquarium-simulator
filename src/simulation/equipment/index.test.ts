import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  biofilmKept,
  calculateSurface,
  disturbBed,
  liftHardscape,
  placeHardscape,
  resetHardscape,
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

describe('disturbBed', () => {
  const settled = (): SimulationState =>
    produce(createSimulation({ tankCapacity: 100, substrate: { type: 'aqua_soil' } }), (draft) => {
      draft.resources.aob = 1000;
      draft.resources.nob = 500;
      draft.resources.waste = 0;
    });
  const disturbed = (state: SimulationState, share: number): SimulationState =>
    produce(state, (draft) => disturbBed(draft, share));

  it('moves that share of the bed’s organics into the water, conserving them', () => {
    const state = settled();
    const after = disturbed(state, 0.25);
    const reserve = state.equipment.substrate.organicReserve;

    expect(after.resources.waste).toBeCloseTo(reserve * 0.25, 12);
    expect(after.equipment.substrate.organicReserve + after.resources.waste).toBeCloseTo(reserve, 12);
  });

  it('scrapes that share of the bed’s colony and nothing off the glass or the filter', () => {
    const state = settled();
    const lost = 0.25 * (1 - biofilmKept(state));
    const after = disturbed(state, 0.25);

    expect(after.resources.aob).toBeCloseTo(1000 * (1 - lost), 9);
    expect(after.resources.nob).toBeCloseTo(500 * (1 - lost), 9);
    expect(disturbed(state, 1).resources.aob).toBeCloseTo(1000 * biofilmKept(state), 9);
  });

  it('leaves the tank as it was for a share of nothing', () => {
    const state = settled();
    expect(disturbed(state, 0)).toEqual(state);
  });

  it('never stirs more than the whole bed', () => {
    const state = settled();
    expect(disturbed(state, Infinity)).toEqual(disturbed(state, 1));
    expect(disturbed(state, -1)).toEqual(state);
  });
});

describe('hardscape moves', () => {
  const scaped = (): SimulationState =>
    produce(
      createSimulation({
        tankCapacity: 100,
        substrate: { type: 'gravel' },
        hardscape: { items: [createHardscapeItem('rock', 'neutral_rock')] },
      }),
      (draft) => {
        draft.resources.aob = 1000;
      }
    );

  it('sets a piece sterile and grows the surface by its own', () => {
    const state = scaped();
    const placed = placeHardscape(state, createHardscapeItem('wood', 'driftwood'));

    expect(placed.resources.aob).toBe(1000);
    expect(placed.resources.surface).toBe(calculateSurface(placed));
    expect(placed.resources.surface).toBeGreaterThan(calculateSurface(state));
  });

  it('refuses a piece the tank has no slot for', () => {
    const full = produce(scaped(), (draft) => void (draft.tank.hardscapeSlots = 1));
    expect(placeHardscape(full, createHardscapeItem('wood', 'driftwood'))).toBe(full);
  });

  it('lifts a piece with its biofilm and stirs one slot of the bed', () => {
    const state = scaped();
    const density = state.resources.aob / calculateSurface(state);
    const stirred = getSubstrateSurface('gravel', 100) / state.tank.hardscapeSlots;
    const lifted = liftHardscape(state, 'rock');

    expect(lifted.equipment.hardscape.items).toEqual([]);
    expect(lifted.resources.surface).toBe(calculateSurface(lifted));
    expect(lifted.resources.aob).toBeCloseTo(density * (lifted.resources.surface - stirred), 9);
    expect(lifted.resources.waste).toBeGreaterThan(state.resources.waste);
  });

  it('stirs no bed on a tank with no slots', () => {
    const state = produce(scaped(), (draft) => void (draft.tank.hardscapeSlots = 0));
    const lifted = liftHardscape(state, 'rock');

    expect(Number.isFinite(lifted.resources.aob)).toBe(true);
    expect(lifted.equipment.substrate.organicReserve).toBe(state.equipment.substrate.organicReserve);
  });

  it('lifts nothing for an unknown id', () => {
    const state = scaped();
    expect(liftHardscape(state, 'missing')).toBe(state);
  });

  const crowded = (pieces: number, slots: number): SimulationState =>
    produce(scaped(), (draft) => {
      draft.tank.hardscapeSlots = slots;
      draft.equipment.hardscape.items = Array.from({ length: pieces }, (_, i) =>
        createHardscapeItem(`rock-${i}`, i === 0 ? 'driftwood' : 'neutral_rock')
      );
      draft.equipment.hardscape.items[0]!.tannins = 0;
      draft.resources.surface = calculateSurface(draft);
    });

  it('stirs one slot of the bed as it stood for each piece lifted together', () => {
    const state = crowded(4, 8);
    const reserve = state.equipment.substrate.organicReserve;
    const lifted = liftHardscape(state, 'rock-0', 'rock-1', 'rock-2');

    expect(lifted.equipment.hardscape.items.map((i) => i.id)).toEqual(['rock-3']);
    expect(lifted.equipment.substrate.organicReserve).toBeCloseTo(reserve * (1 - 3 / 8), 12);
  });

  it('sets every piece back fresh, stirring the whole bed they sat on', () => {
    const state = crowded(8, 8);
    const reset = resetHardscape(state);

    expect(reset.equipment.hardscape.items).toEqual(
      state.equipment.hardscape.items.map((i) => createHardscapeItem(i.id, i.type))
    );
    expect(reset.equipment.hardscape.items[0]!.tannins).toBeGreaterThan(0);
    expect(reset.equipment.substrate.organicReserve).toBe(0);
    expect(reset.resources.surface).toBe(calculateSurface(reset));
    expect(reset.resources.aob).toBeLessThan(state.resources.aob);
  });

  it('keeps every piece of a tank carrying more than its slots', () => {
    const state = crowded(5, 2);
    expect(resetHardscape(state).equipment.hardscape.items).toHaveLength(5);
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
