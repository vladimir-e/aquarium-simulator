import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  calculateSubstrateLeach,
  getSubstrateOrganicReserve,
  getSubstrateSurface,
  replaceSubstrate,
  substrateUpdate,
  SUBSTRATE_ORGANIC_PER_LITER,
  SUBSTRATE_SURFACE_PER_LITER,
  type Substrate,
  type SubstrateType,
} from './substrate.js';
import { createSimulation, type SimulationState } from '../state.js';
import { decayDefaults } from '../config/decay.js';

const SUBSTRATES: SubstrateType[] = ['none', 'sand', 'gravel', 'aqua_soil'];

describe('getSubstrateSurface', () => {
  it('returns 0 for no substrate', () => {
    expect(getSubstrateSurface('none', 100)).toBe(0);
  });

  it('returns correct surface for sand (400 cm²/L)', () => {
    expect(getSubstrateSurface('sand', 100)).toBe(40000);
  });

  it('returns correct surface for gravel (800 cm²/L)', () => {
    expect(getSubstrateSurface('gravel', 100)).toBe(80000);
  });

  it('returns correct surface for aqua soil (1200 cm²/L, highest)', () => {
    expect(getSubstrateSurface('aqua_soil', 100)).toBe(120000);
  });

  it('scales surface with tank capacity', () => {
    expect(getSubstrateSurface('gravel', 50)).toBe(40000);
    expect(getSubstrateSurface('gravel', 200)).toBe(160000);
  });

  it('matches SUBSTRATE_SURFACE_PER_LITER constants', () => {
    expect(getSubstrateSurface('none', 100)).toBe(SUBSTRATE_SURFACE_PER_LITER.none * 100);
    expect(getSubstrateSurface('sand', 100)).toBe(SUBSTRATE_SURFACE_PER_LITER.sand * 100);
    expect(getSubstrateSurface('gravel', 100)).toBe(SUBSTRATE_SURFACE_PER_LITER.gravel * 100);
    expect(getSubstrateSurface('aqua_soil', 100)).toBe(SUBSTRATE_SURFACE_PER_LITER.aqua_soil * 100);
  });
});

describe('getSubstrateOrganicReserve', () => {
  it('gives a bare bottom nothing to leach', () => {
    expect(getSubstrateOrganicReserve('none', 100)).toBe(0);
  });

  it('scales the reserve with tank capacity', () => {
    for (const type of SUBSTRATES) {
      expect(getSubstrateOrganicReserve(type, 200)).toBeCloseTo(
        getSubstrateOrganicReserve(type, 100) * 2,
        12
      );
    }
  });

  it('ranks the substrates aqua_soil > gravel >= sand > none', () => {
    const { aqua_soil, gravel, sand, none } = SUBSTRATE_ORGANIC_PER_LITER;
    expect(aqua_soil).toBeGreaterThan(gravel);
    expect(gravel).toBeGreaterThanOrEqual(sand);
    expect(sand).toBeGreaterThan(none);
  });

  it('is a quantity of its own, not a restatement of surface area', () => {
    const surfaceRatio = SUBSTRATE_SURFACE_PER_LITER.aqua_soil / SUBSTRATE_SURFACE_PER_LITER.gravel;
    const organicRatio = SUBSTRATE_ORGANIC_PER_LITER.aqua_soil / SUBSTRATE_ORGANIC_PER_LITER.gravel;
    expect(organicRatio).not.toBeCloseTo(surfaceRatio, 1);
  });
});

describe('replaceSubstrate', () => {
  const spent = { type: 'aqua_soil', organicReserve: 0.4 } as const;

  it('returns the same bed when the type does not change', () => {
    expect(replaceSubstrate(spent, 'aqua_soil', 100)).toBe(spent);
  });

  it('lays a full fresh reserve when the type changes', () => {
    expect(replaceSubstrate(spent, 'gravel', 100)).toEqual({
      type: 'gravel',
      organicReserve: getSubstrateOrganicReserve('gravel', 100),
    });
  });

  it('empties the reserve when the bed is taken out', () => {
    expect(replaceSubstrate(spent, 'none', 100).organicReserve).toBe(0);
  });

  it('re-mints the same type only by way of another type', () => {
    const stripped = replaceSubstrate(spent, 'none', 100);
    const relaid = replaceSubstrate(stripped, 'aqua_soil', 100);

    expect(relaid.organicReserve).toBe(getSubstrateOrganicReserve('aqua_soil', 100));
    expect(relaid.organicReserve).toBeGreaterThan(spent.organicReserve);
  });

  it('cannot be used to top a bed up by re-selecting it', () => {
    let substrate: Substrate = spent;
    for (let attempt = 0; attempt < 10; attempt++) {
      substrate = replaceSubstrate(substrate, 'aqua_soil', 100);
    }

    expect(substrate.organicReserve).toBe(spent.organicReserve);
  });
});

describe('calculateSubstrateLeach', () => {
  it('takes a fixed fraction of what is left', () => {
    expect(calculateSubstrateLeach(2, decayDefaults)).toBeCloseTo(
      2 * decayDefaults.substrateLeachRate,
      12
    );
  });

  it('tapers to nothing as the reserve empties', () => {
    let reserve = getSubstrateOrganicReserve('aqua_soil', 100);
    const first = calculateSubstrateLeach(reserve, decayDefaults);

    for (let hour = 0; hour < 24 * 56; hour++) {
      const leached = calculateSubstrateLeach(reserve, decayDefaults);
      expect(leached).toBeLessThanOrEqual(reserve);
      reserve -= leached;
    }

    expect(calculateSubstrateLeach(reserve, decayDefaults)).toBeLessThan(first * 0.05);
  });

  it('leaches nothing from an empty or negative reserve', () => {
    expect(calculateSubstrateLeach(0, decayDefaults)).toBe(0);
    expect(calculateSubstrateLeach(-1, decayDefaults)).toBe(0);
  });
});

describe('substrateUpdate', () => {
  function soilTank(): SimulationState {
    return createSimulation({ tankCapacity: 100, substrate: { type: 'aqua_soil' } });
  }

  it('moves mass out of the bed and into the waste pool, gram for gram', () => {
    const state = soilTank();
    const { state: next, effects } = substrateUpdate(state, decayDefaults);

    expect(effects).toHaveLength(1);
    expect(effects[0].resource).toBe('waste');
    expect(next.equipment.substrate.organicReserve).toBeCloseTo(
      state.equipment.substrate.organicReserve - effects[0].delta,
      12
    );
  });

  it('leaves the reserve monotonically non-increasing', () => {
    let state = soilTank();
    let previous = state.equipment.substrate.organicReserve;

    for (let hour = 0; hour < 24 * 30; hour++) {
      state = substrateUpdate(state, decayDefaults).state;
      const reserve = state.equipment.substrate.organicReserve;
      expect(reserve).toBeLessThanOrEqual(previous);
      previous = reserve;
    }

    expect(previous).toBeGreaterThan(0);
  });

  it('does nothing at all on a bare bottom', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const result = substrateUpdate(state, decayDefaults);

    expect(result.effects).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('stops when the reserve is spent', () => {
    const spent = produce(soilTank(), (draft) => {
      draft.equipment.substrate.organicReserve = 0;
    });

    expect(substrateUpdate(spent, decayDefaults).effects).toEqual([]);
  });
});
