import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  calculateSubstrateKhUptake,
  calculateSubstrateLeach,
  freshSubstrate,
  getSubstrateKhReserve,
  getSubstrateOrganicReserve,
  getSubstrateSurface,
  replaceSubstrate,
  substrateUpdate,
  SUBSTRATE_SURFACE_PER_LITER,
  type Substrate,
  type SubstrateType,
} from './substrate.js';
import { createSimulation, type SimulationState } from '../state.js';
import { decayDefaults } from '../config/decay.js';
import { waterChemistryDefaults } from '../config/water-chemistry.js';

const SUBSTRATES: SubstrateType[] = ['none', 'sand', 'gravel', 'aqua_soil'];

describe('getSubstrateSurface', () => {
  it('is the substrate’s surface per litre times the tank', () => {
    for (const type of SUBSTRATES) {
      expect(getSubstrateSurface(type, 200)).toBe(SUBSTRATE_SURFACE_PER_LITER[type] * 200);
    }
    expect(getSubstrateSurface('none', 100)).toBe(0);
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
});

describe('replaceSubstrate', () => {
  const spent = { type: 'aqua_soil', organicReserve: 0.4, khReserve: 10 } as const;

  it('returns the same bed when the type does not change', () => {
    expect(replaceSubstrate(spent, 'aqua_soil', 100)).toBe(spent);
  });

  it('lays a full fresh reserve when the type changes', () => {
    expect(replaceSubstrate(spent, 'gravel', 100)).toEqual(freshSubstrate('gravel', 100));
  });

  it('empties the reserve when the bed is taken out', () => {
    expect(replaceSubstrate(spent, 'none', 100).organicReserve).toBe(0);
  });

  it('re-mints the same type only by way of another type', () => {
    const stripped = replaceSubstrate(spent, 'none', 100);
    const relaid = replaceSubstrate(stripped, 'aqua_soil', 100);

    expect(relaid).toEqual(freshSubstrate('aqua_soil', 100));
    expect(relaid.organicReserve).toBeGreaterThan(spent.organicReserve);
    expect(relaid.khReserve).toBeGreaterThan(spent.khReserve);
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

  it('leaches nothing from an empty or negative reserve', () => {
    expect(calculateSubstrateLeach(0, decayDefaults)).toBe(0);
    expect(calculateSubstrateLeach(-1, decayDefaults)).toBe(0);
  });

  it('never releases more than the bed holds, whatever the rate is set to', () => {
    for (const substrateLeachRate of [1, 2, 500]) {
      expect(calculateSubstrateLeach(3, { ...decayDefaults, substrateLeachRate })).toBe(3);
    }
  });
});

describe('substrateUpdate', () => {
  function soilTank(): SimulationState {
    return createSimulation({ tankCapacity: 100, substrate: { type: 'aqua_soil' } });
  }

  it('moves mass out of the bed and into the waste pool, gram for gram', () => {
    const state = soilTank();
    const { state: next, effects } = substrateUpdate(state, decayDefaults);
    const waste = effects.filter((effect) => effect.resource === 'waste');

    expect(waste).toHaveLength(1);
    expect(next.equipment.substrate.organicReserve).toBeCloseTo(
      state.equipment.substrate.organicReserve - waste[0].delta,
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

  it('stops when the reserves are spent', () => {
    const spent = produce(soilTank(), (draft) => {
      draft.equipment.substrate.organicReserve = 0;
      draft.equipment.substrate.khReserve = 0;
    });

    expect(substrateUpdate(spent, decayDefaults).effects).toEqual([]);
  });

  it('cannot be driven past empty by a rate a debug session tuned above 1', () => {
    const state = soilTank();
    const held = state.equipment.substrate.organicReserve;
    const { state: next, effects } = substrateUpdate(state, {
      ...decayDefaults,
      substrateLeachRate: 5,
    });
    const waste = (result: typeof effects): number[] =>
      result.filter((effect) => effect.resource === 'waste').map((effect) => effect.delta);

    expect(waste(effects)).toEqual([held]);
    expect(next.equipment.substrate.organicReserve).toBe(0);
    expect(waste(substrateUpdate(next, { ...decayDefaults, substrateLeachRate: 5 }).effects)).toEqual([]);
  });
});

describe('getSubstrateKhReserve', () => {
  it('gives only aqua soil a buffer, scaled with the tank', () => {
    for (const type of ['none', 'sand', 'gravel'] as const) {
      expect(getSubstrateKhReserve(type, 100)).toBe(0);
    }
    expect(getSubstrateKhReserve('aqua_soil', 200)).toBeCloseTo(2 * getSubstrateKhReserve('aqua_soil', 100), 10);
  });
});

describe('calculateSubstrateKhUptake', () => {
  const fresh = freshSubstrate('aqua_soil', 100);

  it('takes a share of the tank’s KH from a fresh bed', () => {
    expect(calculateSubstrateKhUptake(2000, fresh, 100)).toBeCloseTo(
      2 * calculateSubstrateKhUptake(1000, fresh, 100),
      10
    );
  });

  it('loosens its grip as the reserve is spent', () => {
    const half = { ...fresh, khReserve: fresh.khReserve / 2 };
    expect(calculateSubstrateKhUptake(1000, half, 100)).toBeCloseTo(
      calculateSubstrateKhUptake(1000, fresh, 100) / 2,
      10
    );
  });

  it('never takes more than the bed can still hold', () => {
    const nearlySpent = { ...fresh, khReserve: 0.001 };
    const greedy = { ...waterChemistryDefaults, aquaSoilKhUptake: 1 };
    expect(calculateSubstrateKhUptake(1e9, nearlySpent, 100, greedy)).toBe(0.001);
  });

  it('leaves KH alone over an inert bed', () => {
    for (const type of ['none', 'sand', 'gravel'] as const) {
      expect(calculateSubstrateKhUptake(2000, freshSubstrate(type, 100), 100)).toBe(0);
    }
  });
});

describe('substrateUpdate on alkalinity', () => {
  const soilTank = (): SimulationState =>
    createSimulation({ tankCapacity: 100, tapKh: 4, substrate: { type: 'aqua_soil' } });

  it('moves the KH it takes out of the water into the bed’s spent reserve', () => {
    const state = soilTank();
    const { state: next, effects } = substrateUpdate(state);
    const kh = effects.filter((effect) => effect.resource === 'kh');

    expect(kh).toHaveLength(1);
    expect(kh[0].delta).toBeLessThan(0);
    expect(next.equipment.substrate.khReserve).toBeCloseTo(
      state.equipment.substrate.khReserve + kh[0].delta,
      10
    );
  });

  it('exchanges GH for the KH it spends, mg for mg', () => {
    const { effects } = substrateUpdate(soilTank());
    const kh = effects.find((effect) => effect.resource === 'kh')!;
    const gh = effects.find((effect) => effect.resource === 'gh')!;

    expect(gh.delta).toBe(kh.delta);
  });

  it('takes no more than the water holds of either hardness', () => {
    const soft = produce(soilTank(), (draft) => {
      draft.resources.gh = 0.01;
    });
    const { effects } = substrateUpdate(soft);
    for (const effect of effects.filter((e) => e.resource === 'kh' || e.resource === 'gh')) {
      expect(effect.delta).toBeCloseTo(-0.01, 10);
    }
  });

  it('takes nothing from a drained tank', () => {
    const drained = produce(soilTank(), (draft) => {
      draft.resources.water = 0;
    });
    expect(substrateUpdate(drained).effects.some((effect) => effect.resource === 'kh')).toBe(false);
  });
});
