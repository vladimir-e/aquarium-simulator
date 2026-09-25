import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  calculateCalciteDissolution,
  calculateHardscapeTotalSurface,
  calculateTanninLeach,
  checkHardscapeCapacity,
  createHardscapeItem,
  hardscapeUpdate,
  HARDSCAPE_SURFACE,
  HARDSCAPE_TANNINS,
  type HardscapeItem,
  type HardscapeType,
} from './hardscape.js';
import { calculateHardscapeSlots, createSimulation, type SimulationState } from '../state.js';
import { waterChemistryDefaults } from '../config/water-chemistry.js';

describe('calculateHardscapeTotalSurface', () => {
  it('sums each item’s surface', () => {
    const items: HardscapeItem[] = [
      createHardscapeItem('1', 'neutral_rock'),
      createHardscapeItem('2', 'driftwood'),
      createHardscapeItem('3', 'driftwood'),
    ];
    expect(calculateHardscapeTotalSurface([])).toBe(0);
    expect(calculateHardscapeTotalSurface(items)).toBe(
      HARDSCAPE_SURFACE.neutral_rock + 2 * HARDSCAPE_SURFACE.driftwood
    );
  });
});

describe('calculateHardscapeSlots', () => {
  it('grows with the tank and stops at a cap', () => {
    const slots = [1, 3, 5, 10, 20, 40, 100, 1000].map(calculateHardscapeSlots);
    for (let i = 1; i < slots.length; i++) expect(slots[i]).toBeGreaterThanOrEqual(slots[i - 1]!);
    expect(slots[0]).toBe(0);
    expect(calculateHardscapeSlots(100)).toBe(calculateHardscapeSlots(1000));
  });
});

describe('checkHardscapeCapacity', () => {
  const items = (n: number): HardscapeItem[] =>
    Array.from({ length: n }, (_, i) => createHardscapeItem(`rock_${i}`, 'neutral_rock'));

  it('says nothing while a slot is free', () => {
    expect(checkHardscapeCapacity(items(4), 5)).toEqual({ ok: true, message: '' });
  });

  it('refuses with the ceiling it was measured against', () => {
    expect(checkHardscapeCapacity(items(5), 5)).toEqual({
      ok: false,
      message: 'Tank at hardscape capacity (5 slots max)',
    });
  });
});

describe('createSimulation with hardscape', () => {
  it('starts empty, with the slots the tank size allows', () => {
    const state = createSimulation({ tankCapacity: 10 });
    expect(state.equipment.hardscape.items).toEqual([]);
    expect(state.tank.hardscapeSlots).toBe(calculateHardscapeSlots(10));
  });

  it('counts the items it starts with into the colonisable surface', () => {
    const items: HardscapeItem[] = [
      createHardscapeItem('test-1', 'driftwood'),
      createHardscapeItem('test-2', 'neutral_rock'),
    ];
    const bare = { tankCapacity: 75, filter: { enabled: false }, substrate: { type: 'none' as const } };
    const withHardscape = createSimulation({ ...bare, hardscape: { items } });

    expect(withHardscape.equipment.hardscape.items).toEqual(items);
    expect(withHardscape.resources.surface).toBe(
      createSimulation(bare).resources.surface + calculateHardscapeTotalSurface(items)
    );
  });
});

describe('createHardscapeItem', () => {
  it('gives only driftwood tannins to leach', () => {
    expect(createHardscapeItem('w', 'driftwood').tannins).toBeGreaterThan(0);
    for (const type of ['neutral_rock', 'calcite_rock', 'plastic_decoration'] as const) {
      expect(createHardscapeItem('x', type).tannins).toBe(0);
    }
  });
});

describe('calculateCalciteDissolution', () => {
  it('scales with the rocks', () => {
    expect(calculateCalciteDissolution(3, 7)).toBeCloseTo(3 * calculateCalciteDissolution(1, 7), 10);
    expect(calculateCalciteDissolution(0, 6)).toBe(0);
  });

  it('runs ten times faster a pH unit lower', () => {
    expect(calculateCalciteDissolution(1, 6.5)).toBeCloseTo(10 * calculateCalciteDissolution(1, 7.5), 10);
  });
});

describe('calculateTanninLeach', () => {
  it('takes a fixed fraction of what is left', () => {
    expect(calculateTanninLeach(2000)).toBeCloseTo(2 * calculateTanninLeach(1000), 10);
    expect(calculateTanninLeach(0)).toBe(0);
  });

  it('never releases more than the piece holds', () => {
    expect(calculateTanninLeach(5, { ...waterChemistryDefaults, tanninLeachRate: 3 })).toBe(5);
  });
});

describe('hardscapeUpdate', () => {
  const tank = (hardscape: HardscapeType[]): SimulationState =>
    createSimulation({
      tankCapacity: 100,
      tapKh: 4,
      hardscape: { items: hardscape.map((type, i) => ({ id: String(i), type })) },
    });

  const khDelta = (state: SimulationState): number =>
    hardscapeUpdate(state)
      .effects.filter((effect) => effect.resource === 'kh')
      .reduce((sum, effect) => sum + effect.delta, 0);

  it('leaves KH alone in an inert scape', () => {
    expect(khDelta(tank(['neutral_rock', 'plastic_decoration']))).toBe(0);
  });

  it('adds KH for calcite and spends it for driftwood', () => {
    expect(khDelta(tank(['calcite_rock']))).toBeGreaterThan(0);
    expect(khDelta(tank(['driftwood']))).toBeLessThan(0);
  });

  it('draws the acid it spends out of the piece', () => {
    const state = tank(['driftwood']);
    const next = hardscapeUpdate(state).state;
    const spent = HARDSCAPE_TANNINS.driftwood - next.equipment.hardscape.items[0]!.tannins;
    expect(spent).toBeCloseTo(-khDelta(state), 10);
  });

  it('spends less KH as the wood is spent', () => {
    const fresh = tank(['driftwood']);
    const aged = produce(fresh, (draft) => {
      draft.equipment.hardscape.items[0]!.tannins /= 4;
    });
    expect(khDelta(aged)).toBeCloseTo(khDelta(fresh) / 4, 10);
  });

  it('does nothing in a drained tank', () => {
    const drained = produce(tank(['calcite_rock', 'driftwood']), (draft) => {
      draft.resources.water = 0;
    });
    expect(hardscapeUpdate(drained).effects).toEqual([]);
  });
});
