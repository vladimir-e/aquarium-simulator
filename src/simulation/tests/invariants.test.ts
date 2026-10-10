import { beforeAll, describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation, type Fish, type SimulationState } from '../state.js';
import { tick } from '../tick.js';
import { applyAction } from '../actions/index.js';
import { DEFAULT_CONFIG, configRange, withTunable, type TunableConfig } from '../config/index.js';
import { nitrogenCycleDefaults } from '../config/nitrogen-cycle.js';
import { mapNutrients, NUTRIENTS, WASTE_NUTRIENTS, type NutrientVector, type WasteNutrient } from '../config/nutrients.js';
import { CACO3_PER_EQUIVALENT, MW_N, MW_NH3, MW_NO2, MW_NO3 } from '../core/chemistry.js';
import { ALGAE_KINDS, bloomMass } from '../algae/index.js';
import { bloomParams, plantParams } from '../flora/params.js';
import type { FloraParams, FloraState } from '../systems/flora-budget.js';
import { offshootStructure } from '../plants/create-plant.js';
import { fishOrganics, fishParams, fishSize, frySize } from '../systems/fish-body.js';
import { stockedBody } from '../livestock/create-fish.js';
import { mature } from '../systems/deb.js';
import { spawnsAt } from '../systems/brood.js';
import { clutchOrganics } from '../systems/clutch.js';
import { addOrganics, atRecipe, ofComposition } from '../core/organics.js';
import { LEAN } from './organics.js';
import { freshSubstrate } from '../equipment/substrate.js';
import { plantRecord } from './plant.js';
import { bloomAt, bloomsTissue } from './blooms.js';
import { BREEDING_TANK_MS } from './breeding-tank.js';
import { leaves, nonFinitePaths } from './leaves.js';
// The scenario setups are the shared definition of a real tank, so the engine invariants run over them.
import { SETUPS, type Setup } from '../../cli/scenarios/setups.js';
import { keepTank } from '../../cli/scenarios/run.js';
import { fishRecord, holdingEggs } from './fish.js';

function run(state: SimulationState, hours: number, config = DEFAULT_CONFIG): SimulationState {
  let running = state;
  for (let hour = 0; hour < hours; hour++) running = tick(running, config);
  return running;
}

/** Grams of organic matter the fish hold: their budgets and guts and every clutch, laid or carried. */
function livestockOrganics({ fish, clutches }: Pick<SimulationState, 'fish' | 'clutches'>): number {
  const bodies = fish.reduce((sum, f) => sum + fishOrganics(f) + f.gut, 0);
  return bodies + clutches.reduce((sum, clutch) => sum + clutchOrganics(clutch), 0);
}

/** Grams of organic matter at food's recipe: food and the livestock's. */
function organics(state: SimulationState): number {
  return state.resources.food + livestockOrganics(state);
}

/** mg of each nutrient a flora's budget holds: its structure at Q_min and its stores. */
function budgetContent(budget: FloraState, p: FloraParams): NutrientVector {
  return mapNutrients((n) => p.qMin[n] * budget.structure + budget.stores[n]);
}

/** mg of each nutrient the plants and the blooms hold. */
function floraContent({ plants, algae }: SimulationState): NutrientVector {
  const held = [
    ...plants.map((plant) => budgetContent(plant.budget, plantParams(plant.species, DEFAULT_CONFIG.plants))),
    ...ALGAE_KINDS.map((kind) => budgetContent(algae[kind].budget, bloomParams(kind, DEFAULT_CONFIG.plants))),
  ];
  return mapNutrients((n) => held.reduce((sum, content) => sum + content[n], 0));
}

/** mg of each nutrient the organic pools hold, whatever they were made of: the standing waste and the bed's mulm. */
function pooled({ resources, equipment }: SimulationState): NutrientVector {
  return addOrganics(resources.waste, equipment.substrate.organicReserve).nutrients;
}

/** Nitrogen in the water column, dissolved, mg as N. */
function dissolvedNitrogen({ resources }: SimulationState): number {
  const { ammonia, nitrite, nitrate } = resources;
  return (ammonia / MW_NH3 + nitrite / MW_NO2 + nitrate / MW_NO3) * MW_N;
}

function nitrogenInPools(state: SimulationState): number {
  const { ammonia, nitrite, nitrate } = state.resources;
  const bed = state.equipment.substrate.nutrients.nitrate;
  return (
    organics(state) * DEFAULT_CONFIG.livestock.foodNitrogenFraction +
    ((ammonia / MW_NH3 + nitrite / MW_NO2 + (nitrate + bed + pooled(state).nitrate + floraContent(state).nitrate) / MW_NO3) *
      MW_N) /
      1000
  );
}

function mineralsInPools(state: SimulationState, n: WasteNutrient): number {
  return (
    organics(state) * DEFAULT_CONFIG.nutrients.foodMineralContent[n] +
    pooled(state)[n] +
    floraContent(state)[n] +
    state.resources[n] +
    state.equipment.substrate.nutrients[n]
  );
}

function alkalinityNetOfNitrogen({ resources, equipment }: SimulationState): number {
  const { kh, ammonia, nitrite, nitrate } = resources;
  const charge = ammonia / MW_NH3 - nitrite / MW_NO2 - (nitrate + equipment.substrate.nutrients.nitrate) / MW_NO3;
  return kh - charge * CACO3_PER_EQUIVALENT;
}

function tetra(id: string): Fish {
  return fishRecord({ id });
}

function cycledBareTank(tankCapacity = 150): SimulationState {
  const state = createSimulation({ tankCapacity });
  const colony = state.resources.surface * nitrogenCycleDefaults.bacteriaPerCm2;
  return produce(state, (draft) => {
    draft.resources.aob = colony;
    draft.resources.nob = colony;
  });
}

const keep = (setup: Setup, days: number): SimulationState =>
  keepTank(setup, { config: DEFAULT_CONFIG, untilTick: days * 24 });

describe('nitrogen mass', () => {
  it('is conserved through NH3 → NO2 → NO3', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.resources.ammonia = 50;
    });
    const end = run(start, 1000);

    expect(end.resources.ammonia + end.resources.nitrite).toBeLessThan(1);
    expect(nitrogenInPools(end) / nitrogenInPools(start)).toBeCloseTo(1, 2);
  });

  it('is conserved through waste mineralization and the chain', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.resources.waste = atRecipe(10, DEFAULT_CONFIG);
    });
    const end = run(start, 2000);

    expect(end.resources.waste.grams).toBeLessThan(0.05);
    expect(nitrogenInPools(end) / nitrogenInPools(start)).toBeCloseTo(1, 2);
  });

  it('is conserved as uneaten food decays and its waste mineralizes', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.resources.food = 5;
    });
    const end = run(start, 2000);

    expect(end.resources.food + end.resources.waste.grams).toBeLessThan(0.05);
    expect(nitrogenInPools(end) / nitrogenInPools(start)).toBeCloseTo(1, 10);
  });

  it('is conserved through the bed, as waste settles in and leaches back out', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.equipment.substrate.type = 'gravel';
      draft.resources.waste = atRecipe(10, DEFAULT_CONFIG);
    });
    const mid = run(start, 24);
    const end = run(mid, 2000);

    expect(mid.equipment.substrate.organicReserve.grams).toBeGreaterThan(0);
    expect(nitrogenInPools(mid) / nitrogenInPools(start)).toBeCloseTo(1, 2);
    expect(nitrogenInPools(end) / nitrogenInPools(start)).toBeCloseTo(1, 2);
  });

  it('is conserved through the bed and the chain for waste of a composition far from food’s', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.equipment.substrate.type = 'gravel';
      draft.resources.waste = ofComposition(10, LEAN);
    });
    const mid = run(start, 24);
    const end = run(mid, 2000);

    expect(mid.equipment.substrate.organicReserve.grams).toBeGreaterThan(0);
    expect(pooled(end).nitrate).toBeLessThan(pooled(start).nitrate / 2);
    for (const state of [mid, end]) {
      expect(nitrogenInPools(state) / nitrogenInPools(start)).toBeCloseTo(1, 10);
      for (const n of WASTE_NUTRIENTS) expect(mineralsInPools(state, n) / mineralsInPools(start, n)).toBeCloseTo(1, 10);
    }
  });

  it('is conserved through the fish that eat and digest the food', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.fish = [tetra('a'), tetra('b'), tetra('c')];
      draft.resources.food = 0.5;
    });
    const fed = run(start, 1);
    const end = run(fed, 48);

    expect(fed.fish.every((f) => f.gut > 0)).toBe(true);
    expect(end.fish).toHaveLength(3);
    expect(nitrogenInPools(fed) / nitrogenInPools(start)).toBeCloseTo(1, 10);
    expect(nitrogenInPools(end) / nitrogenInPools(start)).toBeCloseTo(1, 10);
  });

  it('is conserved through a clutch the fish eat and the water kills', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.fish = [tetra('a'), tetra('b'), tetra('c')];
      draft.clutches = [{ id: 'c', species: 'corydoras', eggs: 30, development: 0 }];
      draft.resources.nitrite = 5 * draft.resources.water;
    });
    const end = run(start, 48);

    expect(end.clutches).toHaveLength(1);
    expect(end.clutches[0].eggs).toBeLessThan(30);
    expect(end.clutches[0].eggs).toBeGreaterThan(0);
    expect(end.fish).toHaveLength(3);
    expect(nitrogenInPools(end) / nitrogenInPools(start)).toBeCloseTo(1, 10);
    for (const n of WASTE_NUTRIENTS) expect(mineralsInPools(end, n) / mineralsInPools(start, n)).toBeCloseTo(1, 10);
  });

  it('is conserved through a clutch the fish eat in the hour it hatches, the hatchlings’ yolks out of their eggs', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.fish = [tetra('a'), tetra('b'), tetra('c')];
      draft.clutches = [{ id: 'c', species: 'corydoras', eggs: 30, development: 0.9999 }];
    });
    const end = run(start, 1);
    const hatchlings = end.fish.filter((f) => !start.fish.some((s) => s.id === f.id));

    expect(end.clutches).toHaveLength(0);
    expect(hatchlings.length).toBeGreaterThan(0);
    expect(hatchlings.length).toBeLessThan(30);
    expect(nitrogenInPools(end) / nitrogenInPools(start)).toBeCloseTo(1, 10);
  });

  it('is conserved over a month of guppies breeding, hunting their fry, growing and wearing, against the food alone', () => {
    const { foodNitrogenFraction: n } = DEFAULT_CONFIG.livestock;
    const minerals = DEFAULT_CONFIG.nutrients.foodMineralContent;
    const guppy = (id: string, sex: Fish['sex'], size: number): Fish => fishRecord({ id, species: 'guppy', size, sex });
    let state = produce(cycledBareTank(10), (draft) => {
      draft.clutches = [{ id: 'brood', species: 'guppy', eggs: 10, development: 0.8, motherId: 'mother' }];
      draft.fish = [
        holdingEggs(guppy('mother', 'female', 90), 40),
        holdingEggs(guppy('father', 'male', 90), 40),
        ...[1, 2, 3, 4, 5].map((i) => guppy(`fry${i}`, i % 2 ? 'male' : 'female', frySize('guppy'))),
      ];
    });
    const start = state;
    let fed = 0;
    let eaten = 0;
    let born = 0;
    let laid = 0;
    for (let hour = 0; hour < 30 * 24; hour++) {
      if (hour % 24 === 0) {
        state = produce(state, (draft) => {
          draft.resources.food += 0.02;
        });
        fed += 0.02;
      }
      const before = state;
      state = tick(state, DEFAULT_CONFIG);
      const logs = state.logs.slice(before.logs.length);
      eaten += logs.filter((log) => log.event === 'fish-died' && log.message.includes('(eaten)')).length;
      born += logs.filter((log) => log.event === 'fry-born').length;
      laid += logs.filter((log) => log.event === 'eggs-laid').length;
    }

    expect(born).toBeGreaterThan(0);
    expect(laid).toBeGreaterThan(0);
    expect(eaten).toBeGreaterThan(0);
    expect((nitrogenInPools(state) - fed * n) / nitrogenInPools(start)).toBeCloseTo(1, 10);
    for (const m of WASTE_NUTRIENTS) {
      expect((mineralsInPools(state, m) - fed * minerals[m]) / mineralsInPools(start, m)).toBeCloseTo(1, 10);
    }
  });
});

describe('a lone female fasting to her death', () => {
  let start: SimulationState;
  let fasted: SimulationState;
  let end: SimulationState;
  let resorbed = 0;
  beforeAll(() => {
    const she = fishRecord({ id: 'she', sex: 'female', survivalDraw: 0 });
    start = produce(cycledBareTank(), (draft) => {
      draft.fish = [holdingEggs(she, spawnsAt('neon_tetra') + 0.5)];
    });
    fasted = start;
    for (let hour = 0; hour < 25 * 24; hour++) {
      const before = fasted.fish[0].deb.broodBuffer;
      fasted = tick(fasted);
      if (hour === 0) resorbed = before - fasted.fish[0].deb.broodBuffer;
    }
    end = tick(
      produce(fasted, (draft) => {
        draft.fish[0].survivalDraw = draft.fish[0].survival;
      })
    );
  });

  it('resorbs the clutch no male fathered, burns her body for her upkeep, and dies of old age', () => {
    const { E0, kappaR } = fishParams(start.fish[0]);
    expect(resorbed).toBeGreaterThanOrEqual((0.99 * spawnsAt('neon_tetra') * E0) / kappaR);
    expect(start.clutches).toHaveLength(0);
    expect(fasted.clutches).toHaveLength(0);
    expect(fasted.fish).toHaveLength(1);
    expect(fasted.fish[0].deb.structure).toBeLessThan(start.fish[0].deb.structure);
    expect(end.fish).toHaveLength(0);
    expect(end.logs.filter((log) => log.event === 'fish-died').map((log) => log.message)).toEqual(['Neon Tetra (old age) died']);
  });

  it('conserves nitrogen and every mineral through all of it', () => {
    for (const state of [fasted, end]) {
      expect(nitrogenInPools(state) / nitrogenInPools(start)).toBeCloseTo(1, 10);
      for (const n of WASTE_NUTRIENTS) expect(mineralsInPools(state, n) / mineralsInPools(start, n)).toBeCloseTo(1, 10);
    }
  });
});

describe('the fish as ledger entries', () => {
  const { foodNitrogenFraction: n } = DEFAULT_CONFIG.livestock;
  const nitrogenOf = (state: Pick<SimulationState, 'fish' | 'clutches'>): number => livestockOrganics(state) * n;
  const tank = produce(cycledBareTank(), (draft) => {
    draft.fish = [
      holdingEggs(fishRecord({ id: 'mother', species: 'guppy', sex: 'female', gut: 0.01 }), 2.4),
      fishRecord({ id: 'fry', species: 'guppy', size: 20, gut: 0.001 }),
      tetra('adult'),
    ];
    draft.clutches = [
      { id: 'carried', species: 'guppy', eggs: 12, development: 0.3, motherId: 'mother' },
      { id: 'laid', species: 'neon_tetra', eggs: 40, development: 0.3 },
    ];
  });

  it('bring a stocked fish’s body in as an input, exactly', () => {
    const stocked = applyAction(tank, { type: 'addFish', species: 'angelfish', size: 40 }).state;
    const arrived = stocked.fish.at(-1)!;
    expect(stocked.fish).toHaveLength(tank.fish.length + 1);
    expect(nitrogenInPools(stocked) - nitrogenInPools(tank)).toBeCloseTo(nitrogenOf({ fish: [arrived], clutches: [] }), 15);
    const body = stockedBody('angelfish', 40);
    expect(nitrogenOf({ fish: [arrived], clutches: [] })).toBeCloseTo(fishOrganics({ species: 'angelfish', deb: body.deb }) * n, 15);
  });

  it('take a removed fish’s body, brood buffer, gut and carried brood out as an output, exactly', () => {
    const removed = applyAction(tank, { type: 'removeFish', fishId: 'mother' }).state;
    const out = { fish: [tank.fish[0]], clutches: [tank.clutches[0]] };
    expect(removed.clutches.map((clutch) => clutch.id)).toEqual(['laid']);
    expect(nitrogenInPools(tank) - nitrogenInPools(removed)).toBeCloseTo(nitrogenOf(out), 15);
  });

  it('take sold fry out as an output, exactly their bodies and guts', () => {
    const sold = applyAction(tank, { type: 'sellFry' }).state;
    expect(sold.fish.map((f) => f.id)).toEqual(['mother', 'adult']);
    expect(nitrogenInPools(tank) - nitrogenInPools(sold)).toBeCloseTo(nitrogenOf({ fish: [tank.fish[1]], clutches: [] }), 15);
  });
});

describe('mineral mass', () => {
  function expectConserved(start: SimulationState, end: SimulationState): void {
    for (const n of WASTE_NUTRIENTS) {
      expect(mineralsInPools(end, n) / mineralsInPools(start, n)).toBeCloseTo(1, 6);
    }
  }

  it('is conserved as uneaten food decays and its waste mineralizes', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.resources.food = 5;
    });
    const end = run(start, 2000);

    expect(end.resources.food + end.resources.waste.grams).toBeLessThan(0.05);
    expectConserved(start, end);
  });

  it('is conserved through the bed, as waste settles in and leaches back out', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.equipment.substrate.type = 'gravel';
      draft.resources.waste = atRecipe(10, DEFAULT_CONFIG);
    });
    const mid = run(start, 24);
    const end = run(mid, 2000);

    expect(mid.equipment.substrate.organicReserve.grams).toBeGreaterThan(0);
    expectConserved(start, mid);
    expectConserved(start, end);
  });

  it('is conserved through the fish that eat the food', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.fish = [tetra('a'), tetra('b'), tetra('c')];
      draft.resources.food = 0.5;
    });
    const end = run(start, 48);

    expect(end.fish).toHaveLength(3);
    expectConserved(start, end);
  });
});

describe('a planting over a charged bed', () => {
  const GROWING_DAYS = 10;
  const LIT_DAYS = 30;
  const BLACKOUT_DAYS = 90;
  let start: SimulationState;
  let growing: SimulationState;
  let grown: SimulationState;
  let dark: SimulationState;
  beforeAll(() => {
    start = produce(cycledBareTank(), (draft) => {
      draft.equipment.substrate = freshSubstrate('aqua_soil', draft.tank.capacity);
      draft.plants = (['java_fern', 'amazon_sword', 'monte_carlo', 'anubias'] as const).map((species) =>
        plantRecord({ id: species, species, size: 40 })
      );
      draft.resources.nitrate = 10 * draft.resources.water;
      draft.resources.phosphate = 1 * draft.resources.water;
      draft.resources.potassium = 10 * draft.resources.water;
      draft.resources.iron = 0.2 * draft.resources.water;
    });
    growing = run(start, GROWING_DAYS * 24);
    grown = run(growing, (LIT_DAYS - GROWING_DAYS) * 24);
    dark = run(
      produce(grown, (draft) => {
        draft.equipment.light.enabled = false;
      }),
      BLACKOUT_DAYS * 24
    );
  });

  const tissue = (state: SimulationState): number => state.plants.reduce((sum, plant) => sum + plant.budget.structure, 0);

  it('grows under the lamp, the sword drawing the bed down past its leak', () => {
    const leakedOnly =
      start.equipment.substrate.nutrients.phosphate * (1 - DEFAULT_CONFIG.nutrients.bedLeakRate) ** (GROWING_DAYS * 24);
    expect(tissue(growing)).toBeGreaterThan(tissue(start));
    expect(growing.equipment.substrate.nutrients.phosphate).toBeLessThan(leakedOnly);
  });

  it('conserves nitrogen through the bed’s leak, growth, spores, shedding and death, the blooms drawing beside the plants', () => {
    for (const state of [growing, grown, dark]) {
      expect(nitrogenInPools(state) / nitrogenInPools(start)).toBeCloseTo(1, 10);
    }
  });

  it('conserves every mineral the same way', () => {
    for (const state of [growing, grown, dark]) {
      for (const n of WASTE_NUTRIENTS) expect(mineralsInPools(state, n) / mineralsInPools(start, n)).toBeCloseTo(1, 10);
    }
  });

  it('never takes a nutrient below zero or off the number line', () => {
    for (const state of [growing, grown, dark]) {
      for (const n of NUTRIENTS) {
        expect(state.resources[n]).toBeGreaterThanOrEqual(0);
        expect(state.equipment.substrate.nutrients[n]).toBeGreaterThanOrEqual(0);
      }
      expect(nonFinitePaths(state)).toEqual([]);
    }
  });
});

describe('blooms and their crash', () => {
  const LIT_DAYS = 10;
  const BLACKOUT_DAYS = 20;
  let start: SimulationState;
  let bloomed: SimulationState;
  let crashed: SimulationState;
  let peakAmmonia = 0;
  beforeAll(() => {
    start = produce(cycledBareTank(), (draft) => {
      for (const kind of ALGAE_KINDS) draft.algae[kind] = bloomAt(draft, kind, 1);
      draft.resources.nitrate = 10 * draft.resources.water;
      draft.resources.phosphate = 1 * draft.resources.water;
      draft.resources.potassium = 10 * draft.resources.water;
      draft.resources.iron = 0.2 * draft.resources.water;
    });
    bloomed = run(start, LIT_DAYS * 24);
    crashed = produce(bloomed, (draft) => {
      draft.equipment.light.enabled = false;
    });
    for (let hour = 0; hour < BLACKOUT_DAYS * 24; hour++) {
      crashed = tick(crashed);
      peakAmmonia = Math.max(peakAmmonia, crashed.resources.ammonia);
    }
  });

  it('grow on the water and fade in the dark, every kind, their tissue fouling the water', () => {
    expect(bloomsTissue(bloomed)).toBeGreaterThan(bloomsTissue(start));
    expect(bloomed.resources.nitrate).toBeLessThan(start.resources.nitrate);
    for (const kind of ALGAE_KINDS) {
      expect(crashed.algae[kind].budget.structure).toBeLessThan(bloomed.algae[kind].budget.structure / 2);
    }
    expect(peakAmmonia).toBeGreaterThan(bloomed.resources.ammonia);
  });

  it('conserves nitrogen and every mineral through the blooms and the crash', () => {
    for (const state of [bloomed, crashed]) {
      expect(nitrogenInPools(state) / nitrogenInPools(start)).toBeCloseTo(1, 10);
      for (const n of WASTE_NUTRIENTS) expect(mineralsInPools(state, n) / mineralsInPools(start, n)).toBeCloseTo(1, 10);
    }
  });
});

describe('a bloom fed on ammonia', () => {
  let start: SimulationState;
  let fed: SimulationState;
  beforeAll(() => {
    start = produce(createSimulation({ tankCapacity: 150 }), (draft) => {
      draft.algae.greenWater = bloomAt(draft, 'greenWater', 1);
      draft.resources.ammonia = 2 * draft.resources.water;
      draft.resources.phosphate = 1 * draft.resources.water;
      draft.resources.potassium = 10 * draft.resources.water;
      draft.resources.iron = 0.2 * draft.resources.water;
    });
    fed = run(start, 3 * 24);
  });

  it('builds the ammonia the water loses into its tissue, with no nitrate to take', () => {
    const tissueNitrogen = (state: SimulationState): number => (floraContent(state).nitrate / MW_NO3) * MW_N;
    const ammoniaNitrogen = (state: SimulationState): number => (state.resources.ammonia / MW_NH3) * MW_N;

    const gained = tissueNitrogen(fed) - tissueNitrogen(start);
    const lost = ammoniaNitrogen(start) - ammoniaNitrogen(fed);

    expect(start.resources.nitrate).toBe(0);
    expect(gained / lost).toBeCloseTo(1, 2);
  });

  it('conserves nitrogen through the ammonia it builds into tissue', () => {
    expect(nitrogenInPools(fed) / nitrogenInPools(start)).toBeCloseTo(1, 10);
  });
});

describe('alkalinity around the nitrogen loop', () => {
  const LIT_DAYS = 10;
  const BLACKOUT_DAYS = 5;
  let start: SimulationState;
  let lit: SimulationState;
  let dark: SimulationState;
  beforeAll(() => {
    start = produce(cycledBareTank(), (draft) => {
      draft.equipment.substrate = {
        ...freshSubstrate('gravel', draft.tank.capacity),
        nutrients: { ...DEFAULT_CONFIG.nutrients.rootTab },
      };
      draft.fish = [tetra('a'), tetra('b'), tetra('c')];
      draft.resources.food = 2;
      draft.plants = (['java_fern', 'amazon_sword', 'monte_carlo'] as const).map((species) =>
        plantRecord({ id: species, species, size: 40 })
      );
      for (const kind of ALGAE_KINDS) draft.algae[kind] = bloomAt(draft, kind, 1);
      draft.resources.nitrate = 10 * draft.resources.water;
      draft.resources.phosphate = 1 * draft.resources.water;
      draft.resources.potassium = 10 * draft.resources.water;
      draft.resources.iron = 0.2 * draft.resources.water;
    });
    lit = run(start, LIT_DAYS * 24);
    dark = run(
      produce(lit, (draft) => {
        draft.equipment.light.enabled = false;
      }),
      BLACKOUT_DAYS * 24
    );
  });

  it('moves KH exactly as far as the charge on the inorganic nitrogen moves while KH lasts, through gills, decay, growth from the water and the bed, shedding and rot', () => {
    const leakedOnly =
      start.equipment.substrate.nutrients.nitrate * (1 - DEFAULT_CONFIG.nutrients.bedLeakRate) ** (LIT_DAYS * 24);
    expect(lit.equipment.substrate.nutrients.nitrate).toBeLessThan(leakedOnly);

    for (const state of [lit, dark]) {
      expect(state.resources.kh).toBeGreaterThan(0);
      expect(Math.abs(state.resources.kh - start.resources.kh)).toBeGreaterThan(1);
      expect(alkalinityNetOfNitrogen(state) / alkalinityNetOfNitrogen(start)).toBeCloseTo(1, 10);
    }
  });
});

describe('blooms at every tunable’s maximum', () => {
  const maxed = leaves(DEFAULT_CONFIG).flatMap(([path]): [string, TunableConfig][] => {
    const range = configRange(path);
    return range === undefined ? [] : [[path, withTunable(DEFAULT_CONFIG, path, range.max)]];
  });
  const crowded = produce(cycledBareTank(), (draft) => {
    for (const kind of ALGAE_KINDS) draft.algae[kind] = bloomAt(draft, kind, 95);
    for (const n of NUTRIENTS) draft.resources[n] = 1000 * DEFAULT_CONFIG.nutrients.halfSaturation[n] * draft.resources.water;
  });
  const planted = produce(crowded, (draft) => {
    draft.plants = (['java_fern', 'amazon_sword', 'monte_carlo'] as const).map((species) =>
      plantRecord({ id: species, species, size: 60 })
    );
  });

  const keepBounded = (start: SimulationState, config: TunableConfig): SimulationState => {
    let state = start;
    for (let hour = 0; hour < 48; hour++) {
      state = tick(state, config);
      for (const kind of ALGAE_KINDS) {
        const { budget, condition } = state.algae[kind];
        const mass = bloomMass(state, kind);
        expect(mass).toBeGreaterThanOrEqual(0);
        expect(mass).toBeLessThanOrEqual(100);
        expect(condition).toBeGreaterThanOrEqual(0);
        expect(condition).toBeLessThanOrEqual(100);
        for (const held of [budget.structure, budget.reserve, budget.offshootBuffer, ...Object.values(budget.stores)]) {
          expect(held).toBeGreaterThanOrEqual(0);
        }
      }
    }
    return state;
  };

  it.each(maxed)('keep mass within [0, 100], condition within [0, 100] and every pool of the budget ≥ 0 with %s at its max', (_path, config) => {
    keepBounded(crowded, config);
  });

  it.each(maxed)('keep those bounds over a planting, every figure finite, with %s at its max', (_path, config) => {
    expect(nonFinitePaths(keepBounded(planted, config))).toEqual([]);
  });
});

describe('the keeper’s hands on the blooms', () => {
  const coated = produce(cycledBareTank(), (draft) => {
    for (const kind of ALGAE_KINDS) draft.algae[kind] = bloomAt(draft, kind, 50);
    draft.resources.ammonia = 0.5 * draft.resources.water;
    draft.resources.nitrate = 20 * draft.resources.water;
  });
  const tissueNitrogen = (state: SimulationState): number => (floraContent(state).nitrate / MW_NO3) * MW_N;

  it('export with a water change exactly the nitrogen the water and the green water in it carry out', () => {
    const share = 0.3;
    const changed = applyAction(coated, { type: 'waterChange', amount: share }).state;
    const greenWater =
      (budgetContent(coated.algae.greenWater.budget, bloomParams('greenWater', DEFAULT_CONFIG.plants)).nitrate / MW_NO3) *
      MW_N;
    const exported = share * (dissolvedNitrogen(coated) + greenWater);

    expect(changed.algae.film).toEqual(coated.algae.film);
    expect((nitrogenInPools(coated) - nitrogenInPools(changed)) * 1000).toBeCloseTo(exported, 9);
    expect(tissueNitrogen(coated) - tissueNitrogen(changed)).toBeCloseTo(share * greenWater, 9);
  });

  it('keep every gram of a scrub in the tank, as waste and leachate', () => {
    const scrubbed = applyAction(coated, { type: 'scrubAlgae' }).state;
    expect(bloomMass(scrubbed, 'film')).toBeLessThan(bloomMass(coated, 'film'));
    expect(scrubbed.algae.greenWater).toEqual(coated.algae.greenWater);
    expect(nitrogenInPools(scrubbed) / nitrogenInPools(coated)).toBeCloseTo(1, 12);
  });
});

describe('an offshoot bought out of the buffer and the stores', () => {
  let start: SimulationState;
  let budded: SimulationState;
  beforeAll(() => {
    start = produce(cycledBareTank(20), (draft) => {
      const fern = plantRecord({ id: 'fern', species: 'java_fern', size: 99 });
      fern.budget.offshootBuffer = offshootStructure('java_fern');
      draft.plants = [fern];
      draft.resources.nitrate = 10 * draft.resources.water;
      draft.resources.phosphate = 0.04 * draft.resources.water;
      draft.resources.potassium = 10 * draft.resources.water;
      draft.resources.iron = 0.2 * draft.resources.water;
    });
    budded = tick(start);
  });

  it('is born a plantlet at its growth form’s offshoot size, full condition, beside its parent', () => {
    expect(budded.plants).toHaveLength(2);
    expect(budded.plants[1].budget.structure).toBeCloseTo(offshootStructure('java_fern'), 12);
    expect(budded.plants[1].parentId).toBe('fern');
  });

  it('conserves nitrogen and every mineral through the purchase', () => {
    expect(nitrogenInPools(budded) / nitrogenInPools(start)).toBeCloseTo(1, 10);
    for (const n of WASTE_NUTRIENTS) expect(mineralsInPools(budded, n) / mineralsInPools(start, n)).toBeCloseTo(1, 10);
  });
});

describe('a guppy stocked as a fry, among the fish that hunt her', () => {
  const DAYS = 180;
  const FRY_RATION = 0.1;
  const sizes: number[] = [];
  const grown: boolean[] = [];
  let firstBrood = -1;
  beforeAll(() => {
    const nano = SETUPS.find((candidate) => candidate.name === 'nano')!;
    const setup: Setup = {
      ...nano,
      fish: [
        { species: 'guppy', count: 1, sex: 'female', size: frySize('guppy') },
        { species: 'guppy', count: 1, sex: 'male' },
      ],
      schedule: nano.schedule.map((entry) =>
        'shareOfStock' in entry.action ? { ...entry, action: { ...entry.action, shareOfStock: FRY_RATION } } : entry
      ),
    };
    let id: string | undefined;
    let logsRead = 0;
    keepTank(setup, {
      config: DEFAULT_CONFIG,
      untilTick: DAYS * 24,
      observe: (state) => {
        id ??= state.fish[0].id;
        const she = state.fish.find((f) => f.id === id);
        if (she) {
          sizes.push(fishSize(she));
          grown.push(mature(she.deb, fishParams(she)));
        }
        const laid = state.logs.slice(logsRead).some((log) => log.event === 'eggs-laid');
        if (firstBrood < 0 && laid) firstBrood = sizes.length - 1;
        logsRead = state.logs.length;
      },
    });
  });

  it('grows from her hatchling size past puberty until she broods, mature at her first brood', () => {
    expect(sizes[0]).toBeCloseTo(frySize('guppy'), 10);
    expect(grown[0]).toBe(false);
    expect(firstBrood).toBeGreaterThan(0);
    expect(sizes[firstBrood - 1]).toBeGreaterThan(2 * frySize('guppy'));
    expect(grown[firstBrood - 1]).toBe(true);
  });

  it('fed, never shrinks, her broods made of her buffer and not her body, and never reaches grown', () => {
    expect(Math.max(...sizes)).toBeLessThan(100);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
  });
});

describe.each(SETUPS.map((setup) => [setup.name, setup] as const))('the %s tank', (_name, setup) => {
  const DAYS = 90;
  let state: SimulationState;
  beforeAll(() => {
    state = keep(setup, DAYS);
  }, BREEDING_TANK_MS);

  it('never holds a non-finite number', () => {
    expect(nonFinitePaths(state)).toEqual([]);
  });

  it('runs the same life twice on one rng seed', () => {
    expect(keep(setup, DAYS)).toStrictEqual(state);
  }, BREEDING_TANK_MS);
});
