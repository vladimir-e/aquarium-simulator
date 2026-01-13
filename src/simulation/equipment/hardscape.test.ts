import { describe, it, expect } from 'vitest';
import {
  getHardscapeSurface,
  calculateHardscapeTotalSurface,
  getHardscapeName,
  getHardscapePHEffect,
} from './hardscape.js';
import { calculateHardscapeSlots, createSimulation, HARDSCAPE_SURFACE } from '../state.js';
import type { HardscapeItem, HardscapeType } from '../state.js';

describe('getHardscapeSurface', () => {
  it('neutral_rock returns 400 cm²', () => {
    expect(getHardscapeSurface('neutral_rock')).toBe(400);
  });

  it('calcite_rock returns 400 cm²', () => {
    expect(getHardscapeSurface('calcite_rock')).toBe(400);
  });

  it('driftwood returns 650 cm²', () => {
    expect(getHardscapeSurface('driftwood')).toBe(650);
  });

  it('plastic_decoration returns 100 cm²', () => {
    expect(getHardscapeSurface('plastic_decoration')).toBe(100);
  });

  it('returns values matching HARDSCAPE_SURFACE constant', () => {
    const types: HardscapeType[] = ['neutral_rock', 'calcite_rock', 'driftwood', 'plastic_decoration'];
    for (const type of types) {
      expect(getHardscapeSurface(type)).toBe(HARDSCAPE_SURFACE[type]);
    }
  });
});

describe('calculateHardscapeTotalSurface', () => {
  it('empty array returns 0', () => {
    expect(calculateHardscapeTotalSurface([])).toBe(0);
  });

  it('single item returns its surface area', () => {
    const items: HardscapeItem[] = [{ id: '1', type: 'neutral_rock' }];
    expect(calculateHardscapeTotalSurface(items)).toBe(400);
  });

  it('multiple items of same type sum correctly', () => {
    const items: HardscapeItem[] = [
      { id: '1', type: 'neutral_rock' },
      { id: '2', type: 'neutral_rock' },
      { id: '3', type: 'neutral_rock' },
    ];
    expect(calculateHardscapeTotalSurface(items)).toBe(1200); // 400 * 3
  });

  it('mixed types calculate correctly', () => {
    const items: HardscapeItem[] = [
      { id: '1', type: 'neutral_rock' },   // 400
      { id: '2', type: 'driftwood' },       // 650
      { id: '3', type: 'plastic_decoration' }, // 100
    ];
    expect(calculateHardscapeTotalSurface(items)).toBe(1150);
  });

  it('driftwood provides most surface per item', () => {
    const driftwoodItems: HardscapeItem[] = [{ id: '1', type: 'driftwood' }];
    const rockItems: HardscapeItem[] = [{ id: '1', type: 'neutral_rock' }];
    const plasticItems: HardscapeItem[] = [{ id: '1', type: 'plastic_decoration' }];

    expect(calculateHardscapeTotalSurface(driftwoodItems)).toBeGreaterThan(
      calculateHardscapeTotalSurface(rockItems)
    );
    expect(calculateHardscapeTotalSurface(rockItems)).toBeGreaterThan(
      calculateHardscapeTotalSurface(plasticItems)
    );
  });
});

describe('calculateHardscapeSlots', () => {
  it('10L tank (2.6 gal) = 5 slots', () => {
    const slots = calculateHardscapeSlots(10);
    expect(slots).toBe(5); // floor(10/3.785 * 2) = floor(5.28) = 5
  });

  it('20L tank (5.3 gal) = 8 slots (capped)', () => {
    const slots = calculateHardscapeSlots(20);
    // floor(20/3.785 * 2) = floor(10.57) = 10, capped at 8
    expect(slots).toBe(8);
  });

  it('40L tank (10.6 gal) = 8 slots (capped)', () => {
    const slots = calculateHardscapeSlots(40);
    // floor(40/3.785 * 2) = floor(21.14) = 21, capped at 8
    expect(slots).toBe(8);
  });

  it('100L tank (26.4 gal) = 8 slots (capped)', () => {
    const slots = calculateHardscapeSlots(100);
    // floor(100/3.785 * 2) = floor(52.85) = 52, capped at 8
    expect(slots).toBe(8);
  });

  it('small tanks have fewer slots', () => {
    // 5L = floor(5/3.785 * 2) = floor(2.64) = 2
    expect(calculateHardscapeSlots(5)).toBe(2);
    // 3L = floor(3/3.785 * 2) = floor(1.58) = 1
    expect(calculateHardscapeSlots(3)).toBe(1);
  });

  it('very small tank has 0 slots', () => {
    // 1L = floor(1/3.785 * 2) = floor(0.53) = 0
    expect(calculateHardscapeSlots(1)).toBe(0);
  });
});

describe('getHardscapeName', () => {
  it('returns human-readable name for neutral_rock', () => {
    expect(getHardscapeName('neutral_rock')).toBe('Neutral Rock');
  });

  it('returns human-readable name for calcite_rock', () => {
    expect(getHardscapeName('calcite_rock')).toBe('Calcite Rock');
  });

  it('returns human-readable name for driftwood', () => {
    expect(getHardscapeName('driftwood')).toBe('Driftwood');
  });

  it('returns human-readable name for plastic_decoration', () => {
    expect(getHardscapeName('plastic_decoration')).toBe('Plastic Decoration');
  });
});

describe('getHardscapePHEffect', () => {
  it('neutral_rock returns null', () => {
    expect(getHardscapePHEffect('neutral_rock')).toBeNull();
  });

  it("calcite_rock returns 'Raises pH'", () => {
    expect(getHardscapePHEffect('calcite_rock')).toBe('Raises pH');
  });

  it("driftwood returns 'Lowers pH'", () => {
    expect(getHardscapePHEffect('driftwood')).toBe('Lowers pH');
  });

  it('plastic_decoration returns null', () => {
    expect(getHardscapePHEffect('plastic_decoration')).toBeNull();
  });
});

describe('createSimulation with hardscape', () => {
  it('initializes hardscape with empty items array', () => {
    const state = createSimulation({ tankCapacity: 75 });
    expect(state.equipment.hardscape).toBeDefined();
    expect(state.equipment.hardscape.items).toEqual([]);
  });

  it('calculates hardscape slots correctly based on tank capacity', () => {
    const state = createSimulation({ tankCapacity: 75 });
    // 75L = floor(75/3.785 * 2) = floor(39.63) = 39, capped at 8
    expect(state.tank.hardscapeSlots).toBe(8);
  });

  it('small tank has fewer slots', () => {
    const state = createSimulation({ tankCapacity: 10 });
    // 10L = floor(10/3.785 * 2) = floor(5.28) = 5
    expect(state.tank.hardscapeSlots).toBe(5);
  });

  it('can initialize with hardscape items', () => {
    const items: HardscapeItem[] = [
      { id: 'test-1', type: 'neutral_rock' },
      { id: 'test-2', type: 'driftwood' },
    ];
    const state = createSimulation({
      tankCapacity: 75,
      hardscape: { items },
    });
    expect(state.equipment.hardscape.items).toHaveLength(2);
    expect(state.equipment.hardscape.items[0].type).toBe('neutral_rock');
    expect(state.equipment.hardscape.items[1].type).toBe('driftwood');
  });

  it('includes hardscape surface in initial passive resources', () => {
    const items: HardscapeItem[] = [
      { id: 'test-1', type: 'driftwood' },  // 650
      { id: 'test-2', type: 'neutral_rock' }, // 400
    ];
    const stateWithHardscape = createSimulation({
      tankCapacity: 75,
      filter: { enabled: false },
      substrate: { type: 'none' },
      hardscape: { items },
    });
    const stateWithoutHardscape = createSimulation({
      tankCapacity: 75,
      filter: { enabled: false },
      substrate: { type: 'none' },
    });

    // Hardscape adds 1050 cm² (650 + 400)
    expect(stateWithHardscape.passiveResources.surface).toBe(
      stateWithoutHardscape.passiveResources.surface + 1050
    );
  });
});
