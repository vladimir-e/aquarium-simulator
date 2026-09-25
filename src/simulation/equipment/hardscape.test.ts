import { describe, it, expect } from 'vitest';
import {
  calculateHardscapeTotalSurface,
  checkHardscapeCapacity,
  HARDSCAPE_SURFACE,
  type HardscapeItem,
} from './hardscape.js';
import { calculateHardscapeSlots, createSimulation } from '../state.js';

describe('calculateHardscapeTotalSurface', () => {
  it('sums each item’s surface', () => {
    const items: HardscapeItem[] = [
      { id: '1', type: 'neutral_rock' },
      { id: '2', type: 'driftwood' },
      { id: '3', type: 'driftwood' },
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
    Array.from({ length: n }, (_, i) => ({ id: `rock_${i}`, type: 'neutral_rock' }));

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
      { id: 'test-1', type: 'driftwood' },
      { id: 'test-2', type: 'neutral_rock' },
    ];
    const bare = { tankCapacity: 75, filter: { enabled: false }, substrate: { type: 'none' as const } };
    const withHardscape = createSimulation({ ...bare, hardscape: { items } });

    expect(withHardscape.equipment.hardscape.items).toEqual(items);
    expect(withHardscape.resources.surface).toBe(
      createSimulation(bare).resources.surface + calculateHardscapeTotalSurface(items)
    );
  });
});
