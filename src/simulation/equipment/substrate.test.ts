import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  calculateBedLeak,
  calculateSubstrateKhUptake,
  calculateSubstrateLeach,
  freshSubstrate,
  getSubstrateKhReserve,
  getSubstrateNutrients,
  getSubstrateOrganicReserve,
  getSubstrateSurface,
  replaceSubstrate,
  substrateUpdate,
  wasteSettlingShare,
  SUBSTRATE_ORGANIC_COMPOSITION,
  SUBSTRATE_SURFACE_PER_LITER,
  type Substrate,
  type SubstrateType,
} from './substrate.js';
import { createSimulation, type SimulationState } from '../state.js';
import { decayDefaults } from '../config/decay.js';
import { waterChemistryDefaults } from '../config/water-chemistry.js';
import { mapNutrients, NUTRIENTS, nutrientsDefaults } from '../config/nutrients.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import type { Effect } from '../core/effects.js';
import { deltaOf } from '../tests/effects.js';
import { addOrganics, atRecipe, NO_ORGANICS, portion, scaleOrganics, type Organics } from '../core/organics.js';
import { LEAN, organicsCloseTo } from '../tests/organics.js';

const wasteDeltas = (effects: readonly Effect[]): Organics[] =>
  effects.flatMap((effect) => (effect.resource === 'waste' ? [effect.delta] : []));

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
    expect(getSubstrateOrganicReserve('none', 100)).toEqual(NO_ORGANICS);
  });

  it('scales the reserve with tank capacity', () => {
    for (const type of SUBSTRATES) {
      expect(getSubstrateOrganicReserve(type, 200)).toEqual(
        organicsCloseTo(scaleOrganics(getSubstrateOrganicReserve(type, 100), 2))
      );
    }
  });

  it('comes out of the bag at the bag’s own composition', () => {
    for (const type of SUBSTRATES) {
      const reserve = getSubstrateOrganicReserve(type, 100);
      expect(reserve).toEqual(organicsCloseTo(portion(SUBSTRATE_ORGANIC_COMPOSITION, reserve.grams)));
    }
  });
});

describe('replaceSubstrate', () => {
  const spent: Substrate = {
    type: 'aqua_soil',
    organicReserve: atRecipe(0.4, DEFAULT_CONFIG),
    khReserve: 10,
    nutrients: { nitrate: 50, phosphate: 5, potassium: 20, iron: 1 },
  };

  it('returns the same bed when the type does not change', () => {
    expect(replaceSubstrate(spent, 'aqua_soil', 100)).toBe(spent);
  });

  it('lays a full fresh reserve when the type changes', () => {
    expect(replaceSubstrate(spent, 'gravel', 100)).toEqual(freshSubstrate('gravel', 100));
  });

  it('empties the reserve when the bed is taken out', () => {
    expect(replaceSubstrate(spent, 'none', 100).organicReserve).toEqual(NO_ORGANICS);
  });

  it('re-mints the same type only by way of another type', () => {
    const stripped = replaceSubstrate(spent, 'none', 100);
    const relaid = replaceSubstrate(stripped, 'aqua_soil', 100);

    expect(relaid).toEqual(freshSubstrate('aqua_soil', 100));
    expect(relaid.organicReserve.grams).toBeGreaterThan(spent.organicReserve.grams);
    expect(relaid.khReserve).toBeGreaterThan(spent.khReserve);
    expect(relaid.nutrients.nitrate).toBeGreaterThan(spent.nutrients.nitrate);
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
  const reserve = portion(LEAN, 2);

  it('takes a fixed fraction of what is left, its content in proportion', () => {
    expect(calculateSubstrateLeach(reserve, decayDefaults)).toEqual(
      organicsCloseTo(scaleOrganics(reserve, decayDefaults.substrateLeachRate))
    );
  });

  it('leaches nothing from an empty reserve', () => {
    expect(calculateSubstrateLeach(NO_ORGANICS, decayDefaults).grams).toBe(0);
  });

  it('never releases more than the bed holds, whatever the rate is set to', () => {
    for (const substrateLeachRate of [1, 2, 500]) {
      expect(calculateSubstrateLeach(reserve, { ...decayDefaults, substrateLeachRate })).toEqual(reserve);
    }
  });
});

describe('substrateUpdate', () => {
  function soilTank(): SimulationState {
    return createSimulation({ tankCapacity: 100, substrate: { type: 'aqua_soil' } });
  }

  it('moves organics out of the bed and into the waste pool, its content pro rata', () => {
    const reserve = portion(LEAN, 2);
    const state = produce(soilTank(), (draft) => {
      draft.equipment.substrate.organicReserve = reserve;
    });
    const { state: next, effects } = substrateUpdate(state, decayDefaults);
    const waste = wasteDeltas(effects);

    expect(waste).toEqual([organicsCloseTo(scaleOrganics(reserve, decayDefaults.substrateLeachRate))]);
    expect(addOrganics(next.equipment.substrate.organicReserve, waste[0])).toEqual(organicsCloseTo(reserve));
  });

  it('drains a bed that nothing settles into', () => {
    let state = soilTank();
    let previous = state.equipment.substrate.organicReserve.grams;

    for (let hour = 0; hour < 24 * 30; hour++) {
      state = substrateUpdate(state, decayDefaults).state;
      const reserve = state.equipment.substrate.organicReserve.grams;
      expect(reserve).toBeLessThanOrEqual(previous);
      previous = reserve;
    }

    expect(previous).toBeGreaterThan(0);
  });

  it('settles its share of standing waste into the bed, its content pro rata', () => {
    const waste = portion(LEAN, 2);
    const state = produce(soilTank(), (draft) => {
      draft.resources.waste = waste;
    });
    const { state: next, effects } = substrateUpdate(state, decayDefaults);
    const settled = effects.find((effect) => effect.source === 'substrate-settling');
    const before = addOrganics(state.equipment.substrate.organicReserve, waste);

    expect(settled?.delta).toEqual(organicsCloseTo(scaleOrganics(waste, -wasteSettlingShare(state, decayDefaults))));
    expect(addOrganics(next.equipment.substrate.organicReserve, waste, ...wasteDeltas(effects))).toEqual(
      organicsCloseTo(before)
    );
  });

  it('settles less the harder the water is moving', () => {
    const at = (flow: number): number =>
      wasteSettlingShare(
        produce(soilTank(), (draft) => {
          draft.resources.flow = flow;
        }),
        decayDefaults
      );

    expect(at(0)).toBe(decayDefaults.wasteSettlingRate);
    expect(at(400)).toBeLessThan(at(0));
    expect(at(1600)).toBeLessThan(at(400));
    expect(at(100 * decayDefaults.settlingHalfTurnover)).toBeCloseTo(at(0) / 2, 12);
  });

  it('settles nothing without a bed', () => {
    const bare = produce(createSimulation({ tankCapacity: 100 }), (draft) => {
      draft.resources.waste = atRecipe(2, DEFAULT_CONFIG);
    });
    expect(wasteSettlingShare(bare, decayDefaults)).toBe(0);
  });

  it('does nothing at all on a bare bottom', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const result = substrateUpdate(state, decayDefaults);

    expect(result.effects).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('leaks the bed’s nutrients into the water, mg for mg', () => {
    const state = soilTank();
    const { state: next, effects } = substrateUpdate(state, decayDefaults, waterChemistryDefaults, nutrientsDefaults);
    const leaked = calculateBedLeak(state.equipment.substrate.nutrients, nutrientsDefaults);

    for (const n of NUTRIENTS) {
      const leak = effects.find((effect) => effect.resource === n && effect.source === 'substrate-leak');
      expect(leak?.delta).toBeGreaterThan(0);
      expect(leak?.delta).toBe(leaked[n]);
      expect(next.equipment.substrate.nutrients[n]).toBeCloseTo(state.equipment.substrate.nutrients[n] - leaked[n], 12);
    }
  });

  it('stops when the reserves are spent', () => {
    const spent = produce(soilTank(), (draft) => {
      draft.equipment.substrate.organicReserve = NO_ORGANICS;
      draft.equipment.substrate.khReserve = 0;
      for (const n of NUTRIENTS) draft.equipment.substrate.nutrients[n] = 0;
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

    expect(wasteDeltas(effects)).toEqual([held]);
    expect(next.equipment.substrate.organicReserve).toEqual(NO_ORGANICS);
    expect(wasteDeltas(substrateUpdate(next, { ...decayDefaults, substrateLeachRate: 5 }).effects)).toEqual([]);
  });
});

describe('getSubstrateNutrients', () => {
  it('charges only aqua soil, scaled with the tank', () => {
    for (const type of ['none', 'sand', 'gravel'] as const) {
      for (const n of NUTRIENTS) expect(getSubstrateNutrients(type, 100)[n]).toBe(0);
    }
    for (const n of NUTRIENTS) {
      expect(getSubstrateNutrients('aqua_soil', 100)[n]).toBeGreaterThan(0);
      expect(getSubstrateNutrients('aqua_soil', 200)[n]).toBeCloseTo(2 * getSubstrateNutrients('aqua_soil', 100)[n], 10);
    }
  });
});

describe('calculateBedLeak', () => {
  it('is a share of what the bed holds, so the leak tapers as it empties', () => {
    const full = getSubstrateNutrients('aqua_soil', 100);
    const half = mapNutrients((n) => full[n] / 2);
    for (const n of NUTRIENTS) {
      expect(calculateBedLeak(full)[n]).toBeCloseTo(full[n] * nutrientsDefaults.bedLeakRate, 12);
      expect(calculateBedLeak(half)[n]).toBeCloseTo(calculateBedLeak(full)[n] / 2, 12);
    }
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
    expect(deltaOf(kh[0])).toBeLessThan(0);
    expect(next.equipment.substrate.khReserve).toBeCloseTo(
      state.equipment.substrate.khReserve + deltaOf(kh[0]),
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
