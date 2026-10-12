import { beforeAll, describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation, type Fish, type SimulationState } from '../state.js';
import { settleEnvironment, tick } from '../tick.js';
import { gasExchangeSystem } from '../systems/gas-exchange.js';
import { CO2_MASS_RATE } from '../equipment/co2-generator.js';
import { deltaOf } from './effects.js';
import { loseFlora } from '../systems/flora.js';
import { disturbBed } from '../equipment/index.js';
import { applyAction } from '../actions/index.js';
import { DEFAULT_CONFIG, configRange, withTunable, type TunableConfig } from '../config/index.js';
import { nitrogenCycleDefaults } from '../config/nitrogen-cycle.js';
import { mapNutrients, NUTRIENTS, WASTE_NUTRIENTS, type NutrientVector, type WasteNutrient } from '../config/nutrients.js';
import {
  CACO3_PER_EQUIVALENT,
  CH2O_TO_C_MASS_RATIO,
  C_TO_CO2_MASS_RATIO,
  MW_N,
  MW_NH3,
  MW_NO2,
  MW_NO3,
  RESERVE_TO_N_MASS_RATIO,
} from '../core/chemistry.js';
import { ALGAE_KINDS, bloomCoverage } from '../algae/index.js';
import { bloomParams, plantParams } from '../flora/params.js';
import { floraNutrients, floraOrganics, type FloraState } from '../systems/flora-budget.js';
import { offshootStructure } from '../plants/create-plant.js';
import { sizeOf } from '../plants/canopy.js';
import { fishComposition, fishOrganics, fishParams, fishSize, frySize } from '../systems/fish-body.js';
import { stockedBody } from '../livestock/create-fish.js';
import { mature } from '../systems/deb.js';
import { spawnsAt } from '../systems/brood.js';
import { clutchOrganics } from '../systems/clutch.js';
import { addOrganics, atRecipe, portion, type Organics } from '../core/organics.js';
import { sum } from '../core/sum.js';
import { LEAN, ofFood } from './organics.js';
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

const BODY = fishComposition(DEFAULT_CONFIG);

/** The organic matter the fish hold: their budgets and every clutch, laid or carried, at their composition, and their guts. */
function livestockOrganics({ fish, clutches }: Pick<SimulationState, 'fish' | 'clutches'>): Organics {
  const bodies = sum(fish.map(fishOrganics)) + sum(clutches.map(clutchOrganics));
  return addOrganics(portion(BODY, bodies), ...fish.map((f) => f.gut));
}

/** Every organic pool, whatever it was made of: food, the livestock's, the standing waste and the bed's mulm. */
function pooled(state: SimulationState): Organics {
  const { resources, equipment } = state;
  return addOrganics(resources.food, livestockOrganics(state), resources.waste, equipment.substrate.organicReserve);
}

/** mg of each nutrient the plants and the blooms hold. */
function floraContent({ plants, algae }: SimulationState): NutrientVector {
  const held = [
    ...plants.map((plant) => floraNutrients(plant.budget, plantParams(plant.species, DEFAULT_CONFIG.plants))),
    ...ALGAE_KINDS.map((kind) => floraNutrients(algae[kind].budget, bloomParams(kind, DEFAULT_CONFIG.plants))),
  ];
  return mapNutrients((n) => held.reduce((sum, content) => sum + content[n], 0));
}

/** Grams of carbon the plants and the blooms hold, every gram of them carbohydrate. */
function floraCarbon({ plants, algae }: SimulationState): number {
  const budgets = [...plants.map((plant) => plant.budget), ...ALGAE_KINDS.map((kind) => algae[kind].budget)];
  return CH2O_TO_C_MASS_RATIO * sum(budgets.map(floraOrganics));
}

/** Grams of carbon in the organic pools and the flora. */
function carbonInPools(state: SimulationState): number {
  return pooled(state).carbon + floraCarbon(state);
}

/** Nitrogen in the water column, dissolved, mg as N. */
function dissolvedNitrogen({ resources }: SimulationState): number {
  const { ammonia, nitrite, nitrate } = resources;
  return (ammonia / MW_NH3 + nitrite / MW_NO2 + nitrate / MW_NO3) * MW_N;
}

/** Grams of nitrogen carried as `nitrate` mg of nitrate. */
const nitrogenOfNitrate = (nitrate: number): number => (nitrate / MW_NO3) * MW_N / 1000;

function nitrogenInPools(state: SimulationState): number {
  const { ammonia, nitrite, nitrate } = state.resources;
  const bed = state.equipment.substrate.nutrients.nitrate;
  return (
    ((ammonia / MW_NH3 + nitrite / MW_NO2) * MW_N) / 1000 +
    nitrogenOfNitrate(nitrate + bed + pooled(state).nutrients.nitrate + floraContent(state).nitrate)
  );
}

function mineralsInPools(state: SimulationState, n: WasteNutrient): number {
  return (
    pooled(state).nutrients[n] + floraContent(state)[n] + state.resources[n] + state.equipment.substrate.nutrients[n]
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

  it('is conserved through waste rot and the chain', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.resources.waste = atRecipe(10, DEFAULT_CONFIG);
    });
    const end = run(start, 2000);

    expect(end.resources.waste.grams).toBeLessThan(0.05);
    expect(nitrogenInPools(end) / nitrogenInPools(start)).toBeCloseTo(1, 2);
  });

  it('is conserved as uneaten food rots', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.resources.food = ofFood(5);
    });
    const end = run(start, 2000);

    expect(end.resources.food.grams).toBeLessThan(0.05);
    expect(nitrogenInPools(end) / nitrogenInPools(start)).toBeCloseTo(1, 10);
  });

  it('is conserved through the bed, as waste settles in and rots there', () => {
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

  it('is conserved through the bed and the chain for waste of a composition far from food’s, most of it ending as dissolved nitrate in the dark', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.equipment.substrate.type = 'gravel';
      draft.equipment.light.enabled = false;
      draft.resources.waste = portion(LEAN, 10);
    });
    const mid = run(start, 24);
    const end = run(mid, 2000);

    expect(mid.equipment.substrate.organicReserve.grams).toBeGreaterThan(0);
    expect(end.resources.nitrate / (end.resources.nitrate + pooled(end).nutrients.nitrate)).toBeGreaterThan(0.5);
    for (const state of [mid, end]) {
      expect(nitrogenInPools(state) / nitrogenInPools(start)).toBeCloseTo(1, 10);
      for (const n of WASTE_NUTRIENTS) expect(mineralsInPools(state, n) / mineralsInPools(start, n)).toBeCloseTo(1, 10);
    }
  });

  it('is conserved through the fish that eat and digest the food', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.fish = [tetra('a'), tetra('b'), tetra('c')];
      draft.resources.food = ofFood(0.5);
    });
    const fed = run(start, 1);
    const end = run(fed, 48);

    expect(fed.fish.every((f) => f.gut.grams > 0)).toBe(true);
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
          draft.resources.food = addOrganics(draft.resources.food, ofFood(0.02));
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
      const before = fasted.fish[0].budget.broodBuffer;
      fasted = tick(fasted);
      if (hour === 0) resorbed = before - fasted.fish[0].budget.broodBuffer;
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
    expect(fasted.fish[0].budget.structure).toBeLessThan(start.fish[0].budget.structure);
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
  const nitrogenOf = (state: Pick<SimulationState, 'fish' | 'clutches'>): number =>
    nitrogenOfNitrate(livestockOrganics(state).nutrients.nitrate);
  const tank = produce(cycledBareTank(), (draft) => {
    draft.fish = [
      holdingEggs(fishRecord({ id: 'mother', species: 'guppy', sex: 'female', gut: ofFood(0.01) }), 2.4),
      fishRecord({ id: 'fry', species: 'guppy', size: 20, gut: ofFood(0.001) }),
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
    expect(nitrogenOf({ fish: [arrived], clutches: [] })).toBeCloseTo(
      fishOrganics({ species: 'angelfish', budget: body.budget }) * RESERVE_TO_N_MASS_RATIO,
      15
    );
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

  it('is conserved as uneaten food rots', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.resources.food = ofFood(5);
    });
    const end = run(start, 2000);

    expect(end.resources.food.grams).toBeLessThan(0.05);
    expectConserved(start, end);
  });

  it('is conserved through the bed, as waste settles in and rots there', () => {
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
      draft.resources.food = ofFood(0.5);
    });
    const end = run(start, 48);

    expect(end.fish).toHaveLength(3);
    expectConserved(start, end);
  });
});

describe('carbon mass', () => {
  const dissolvedCarbon = ({ resources }: SimulationState): number => (resources.co2 * resources.water) / C_TO_CO2_MASS_RATIO / 1000;
  const carbonIn = (state: SimulationState): number => carbonInPools(state) + dissolvedCarbon(state);

  /** No air over the water to trade CO2 with, and none for it to evaporate into. */
  const SEALED: TunableConfig = { ...DEFAULT_CONFIG, gasExchange: { ...DEFAULT_CONFIG.gasExchange, baseExchangeRate: 0 } };
  const sealed = (state: SimulationState): SimulationState =>
    produce(state, (draft) => {
      draft.equipment.lid.type = 'sealed';
    });

  function sealedHours(start: SimulationState, hours: number): SimulationState {
    let state = start;
    for (let hour = 0; hour < hours; hour++) state = tick(state, SEALED);
    return state;
  }

  const starved = (fish: Fish): Fish => ({ ...fish, budget: { ...fish.budget, reserve: 0 } });

  /** Fish feeding, breeding and dying, a planting with a plant dying in it, blooms, and every organic pool, over a gravel bed. */
  const living = (oxygen: number): SimulationState =>
    sealed(
      produce(cycledBareTank(), (draft) => {
        draft.equipment.substrate = freshSubstrate('gravel', draft.tank.capacity);
        draft.fish = [
          tetra('a'),
          tetra('b'),
          fishRecord({ id: 'old', survivalDraw: 1 }),
          starved(fishRecord({ id: 'fry', size: 15, health: 0.001 })),
          fishRecord({ id: 'angel', species: 'angelfish', size: 60, gut: ofFood(0.01) }),
          holdingEggs(fishRecord({ id: 'mother', species: 'guppy', sex: 'female' }), 2.4),
        ];
        draft.clutches = [
          { id: 'laid', species: 'neon_tetra', eggs: 60, development: 0.5 },
          { id: 'carried', species: 'guppy', eggs: 8, development: 0.9999, motherId: 'mother' },
        ];
        const doomed = plantRecord({ id: 'doomed', species: 'amazon_sword', size: 50, condition: 0.01 });
        doomed.budget.reserve = 0;
        draft.plants = [plantRecord({ id: 'fern', species: 'java_fern', size: 60 }), doomed];
        for (const kind of ALGAE_KINDS) draft.algae[kind] = bloomAt(draft, kind, 20);
        draft.resources.food = ofFood(0.5);
        draft.resources.waste = portion(LEAN, 2);
        draft.resources.nitrate = 10 * draft.resources.water;
        draft.resources.phosphate = 1 * draft.resources.water;
        draft.resources.potassium = 10 * draft.resources.water;
        draft.resources.iron = 0.2 * draft.resources.water;
        draft.resources.oxygen = oxygen;
      })
    );

  it.each([
    ['aerated', 8],
    ['anoxic', 0],
  ])(
    'is conserved across whole ticks in a sealed %s tank — fish eating, burning, breeding and dying, the flora fixing, respiring, shedding and dying, spores landing, every pool rotting and settling',
    (_name, oxygen) => {
      const start = living(oxygen);
      const end = sealedHours(start, 48);

      expect(end.fish.map((f) => f.id)).not.toContain('fry');
      expect(end.plants.map((p) => p.id)).not.toContain('doomed');
      expect(end.clutches.find((clutch) => clutch.id === 'laid')!.eggs).toBeLessThan(60);
      expect(end.resources.food.grams).toBeLessThan(start.resources.food.grams);
      expect(end.equipment.substrate.organicReserve.grams).toBeGreaterThan(start.equipment.substrate.organicReserve.grams);
      expect(carbonIn(end) / carbonIn(start)).toBeCloseTo(1, 10);
    }
  );

  it.each([
    ['leaner', 0.03, 5],
    ['richer', 0.12, 100],
  ])(
    'is conserved with nitrogen and every mineral as fish eat a recipe %s in nitrogen and phosphorus than their bodies',
    (_name, nitrogen, phosphate) => {
      const config = withTunable(withTunable(SEALED, 'livestock.foodNitrogenFraction', nitrogen), 'nutrients.foodMineralContent.phosphate', phosphate);
      const start = sealed(
        produce(cycledBareTank(), (draft) => {
          draft.fish = [tetra('a'), fishRecord({ id: 'angel', species: 'angelfish', size: 40 })];
          draft.resources.food = atRecipe(0.5, config);
        })
      );
      const end = run(start, 48, config);

      expect(end.fish).toHaveLength(2);
      expect(end.resources.food.grams).toBeLessThan(start.resources.food.grams);
      expect(carbonIn(end) / carbonIn(start)).toBeCloseTo(1, 10);
      expect(nitrogenInPools(end) / nitrogenInPools(start)).toBeCloseTo(1, 10);
      for (const n of WASTE_NUTRIENTS) expect(mineralsInPools(end, n) / mineralsInPools(start, n)).toBeCloseTo(1, 10);
    }
  );

  it('travels intact from the flora into what it sheds and what it leaves dead', () => {
    const sword = plantRecord({ id: 'sword', species: 'amazon_sword', size: 50 });
    const p = plantParams('amazon_sword', DEFAULT_CONFIG.plants);
    const held = CH2O_TO_C_MASS_RATIO * floraOrganics(sword.budget);
    for (const condition of [40, 0]) {
      const loss = loseFlora(sword.budget, p, condition, DEFAULT_CONFIG.plants);
      const kept = loss.survivor === null ? 0 : CH2O_TO_C_MASS_RATIO * floraOrganics(loss.survivor);
      expect(loss.shed.carbon).toBeGreaterThan(0);
      expect(kept + loss.shed.carbon + loss.died.carbon).toBeCloseTo(held, 12);
    }
  });

  it('stays in the tank as the bed is stirred up', () => {
    const settled = sealedHours(
      sealed(
        produce(cycledBareTank(), (draft) => {
          draft.equipment.substrate = freshSubstrate('gravel', draft.tank.capacity);
          draft.resources.waste = addOrganics(portion(LEAN, 5), ofFood(5));
        })
      ),
      48
    );
    const stirred = produce(settled, (draft) => {
      disturbBed(draft, 0.4);
    });

    expect(stirred.resources.waste.carbon).toBeGreaterThan(settled.resources.waste.carbon);
    expect(carbonIn(stirred) / carbonIn(settled)).toBeCloseTo(1, 12);
  });

  describe('as ledger entries', () => {
    const { foodCarbonFraction } = DEFAULT_CONFIG.livestock;
    const inert = sealed(
      produce(createSimulation({ tankCapacity: 150 }), (draft) => {
        draft.resources.co2 = 20;
      })
    );

    it('takes in exactly the carbon fed', () => {
      const fed = applyAction(inert, { type: 'feed', amount: 2 }).state;
      expect(carbonIn(fed) - carbonIn(inert)).toBeCloseTo(2 * foodCarbonFraction, 12);
    });

    it('trades with the air exactly the CO2 gas exchange moves', () => {
      const settled = settleEnvironment(inert);
      const exchanged = gasExchangeSystem
        .update(settled, DEFAULT_CONFIG, settled.resources.oxygen)
        .filter((effect) => effect.resource === 'co2')
        .map((effect) => deltaOf(effect));
      expect(exchanged).toHaveLength(1);
      expect(exchanged[0]).toBeLessThan(0);
      expect(carbonIn(tick(inert)) - carbonIn(inert)).toBeCloseTo(
        (exchanged[0] * inert.resources.water) / C_TO_CO2_MASS_RATIO / 1000,
        12
      );
    });

    it('takes in exactly the CO2 the injector meters', () => {
      const injecting = produce(inert, (draft) => {
        draft.equipment.co2Generator = {
          ...draft.equipment.co2Generator,
          enabled: true,
          bubbleRate: 2,
          schedule: { startHour: 0, duration: 24 },
        };
      });
      const injected = (2 * CO2_MASS_RATE) / C_TO_CO2_MASS_RATIO / 1000;
      expect(carbonIn(tick(injecting, SEALED)) - carbonIn(injecting)).toBeCloseTo(injected, 12);
    });

    it('lets a water change carry out its share of the CO2 and the green water and bring in the tap’s, and the vacuum its share of the mulm', () => {
      const tank = produce(inert, (draft) => {
        draft.equipment.substrate = freshSubstrate('gravel', draft.tank.capacity);
        draft.algae.greenWater = bloomAt(draft, 'greenWater', 30);
      });
      const changed = applyAction(tank, { type: 'waterChange', amount: 0.3, vacuum: 0.5 }).state;
      const greenWater = CH2O_TO_C_MASS_RATIO * floraOrganics(tank.algae.greenWater.budget);
      const tapIn = (DEFAULT_CONFIG.gasExchange.atmosphericCo2 * 0.3 * tank.resources.water) / C_TO_CO2_MASS_RATIO / 1000;
      const out = 0.3 * (dissolvedCarbon(tank) + greenWater) + 0.5 * tank.equipment.substrate.organicReserve.carbon;

      expect(carbonIn(tank) - carbonIn(changed)).toBeCloseTo(out - tapIn, 12);
    });

    it('takes a removed fish, sold fry and a pulled plant out exactly, bodies, guts and broods', () => {
      const tank = produce(cycledBareTank(), (draft) => {
        draft.fish = [
          holdingEggs(fishRecord({ id: 'mother', species: 'guppy', sex: 'female', gut: ofFood(0.01) }), 2.4),
          fishRecord({ id: 'fry', species: 'guppy', size: 20, gut: ofFood(0.001) }),
          tetra('adult'),
        ];
        draft.clutches = [{ id: 'carried', species: 'guppy', eggs: 12, development: 0.3, motherId: 'mother' }];
        draft.plants = [plantRecord({ id: 'fern', species: 'java_fern', size: 60 })];
      });
      const removed = applyAction(tank, { type: 'removeFish', fishId: 'mother' }).state;
      const sold = applyAction(tank, { type: 'sellFry' }).state;
      const pulled = applyAction(tank, { type: 'removePlant', plantId: 'fern' }).state;

      expect(carbonIn(tank) - carbonIn(removed)).toBeCloseTo(livestockOrganics({ fish: [tank.fish[0]], clutches: tank.clutches }).carbon, 12);
      expect(carbonIn(tank) - carbonIn(sold)).toBeCloseTo(livestockOrganics({ fish: [tank.fish[1]], clutches: [] }).carbon, 12);
      expect(carbonIn(tank) - carbonIn(pulled)).toBeCloseTo(CH2O_TO_C_MASS_RATIO * floraOrganics(tank.plants[0].budget), 12);
    });
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
  let dieBacks = 0;
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
      const before = crashed;
      crashed = tick(crashed);
      peakAmmonia = Math.max(peakAmmonia, crashed.resources.ammonia);
      dieBacks += ALGAE_KINDS.filter((kind) => before.algae[kind].condition < 100 && crashed.algae[kind].condition === 100).length;
    }
  });

  it('grow on the water and fade in the dark, every kind, until one dies back, their tissue fouling the water', () => {
    expect(bloomsTissue(bloomed)).toBeGreaterThan(bloomsTissue(start));
    expect(bloomed.resources.nitrate).toBeLessThan(start.resources.nitrate);
    for (const kind of ALGAE_KINDS) {
      expect(crashed.algae[kind].budget.structure).toBeLessThan(bloomed.algae[kind].budget.structure / 2);
    }
    expect(dieBacks).toBeGreaterThan(0);
    expect(peakAmmonia).toBeGreaterThan(bloomed.resources.ammonia);
  });

  it('conserves nitrogen, every mineral and KH net of nitrogen through the blooms, the crash and the die-back’s rot', () => {
    for (const state of [bloomed, crashed]) {
      expect(nitrogenInPools(state) / nitrogenInPools(start)).toBeCloseTo(1, 10);
      for (const n of WASTE_NUTRIENTS) expect(mineralsInPools(state, n) / mineralsInPools(start, n)).toBeCloseTo(1, 10);
      expect(alkalinityNetOfNitrogen(state) / alkalinityNetOfNitrogen(start)).toBeCloseTo(1, 10);
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
      draft.resources.food = ofFood(2);
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

  it('moves KH exactly as far as the charge on the inorganic nitrogen moves while KH lasts, through gills, growth from the water and the bed, shedding and rot', () => {
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
    draft.plants = (
      [
        ['java_fern', 60],
        ['amazon_sword', 99],
        ['monte_carlo', 60],
      ] as const
    ).map(([species, size]) => plantRecord({ id: species, species, size }));
  });

  const expectBounded = (fill: number, { budget, condition }: { budget: FloraState; condition: number }): void => {
    expect(fill).toBeGreaterThanOrEqual(0);
    expect(fill).toBeLessThanOrEqual(100);
    expect(condition).toBeGreaterThanOrEqual(0);
    expect(condition).toBeLessThanOrEqual(100);
    for (const held of [budget.structure, budget.reserve, budget.offshootBuffer, ...Object.values(budget.stores)]) {
      expect(held).toBeGreaterThanOrEqual(0);
    }
  };

  const keepBounded = (start: SimulationState, config: TunableConfig): SimulationState => {
    let state = start;
    for (let hour = 0; hour < 48; hour++) {
      state = tick(state, config);
      for (const kind of ALGAE_KINDS) expectBounded(bloomCoverage(state, kind), state.algae[kind]);
      for (const plant of state.plants) expectBounded(sizeOf(plant), plant);
    }
    return state;
  };

  it.each(maxed)('keep coverage within [0, 100], condition within [0, 100] and every pool of the budget ≥ 0 with %s at its max', (_path, config) => {
    keepBounded(crowded, config);
  });

  it.each(maxed)('keep those bounds over a planting, every plant within a full unit, every figure finite, with %s at its max', (_path, config) => {
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
      (floraNutrients(coated.algae.greenWater.budget, bloomParams('greenWater', DEFAULT_CONFIG.plants)).nitrate / MW_NO3) *
      MW_N;
    const exported = share * (dissolvedNitrogen(coated) + greenWater);

    expect(changed.algae.film).toEqual(coated.algae.film);
    expect((nitrogenInPools(coated) - nitrogenInPools(changed)) * 1000).toBeCloseTo(exported, 9);
    expect(tissueNitrogen(coated) - tissueNitrogen(changed)).toBeCloseTo(share * greenWater, 9);
  });

  it('keep every gram of a scrub in the tank as waste, its stores with it and KH untouched', () => {
    const scrubbed = applyAction(coated, { type: 'scrubAlgae' }).state;
    expect(bloomCoverage(scrubbed, 'film')).toBeLessThan(bloomCoverage(coated, 'film'));
    expect(scrubbed.algae.greenWater).toEqual(coated.algae.greenWater);
    expect(scrubbed.resources.kh).toBe(coated.resources.kh);
    expect(nitrogenInPools(scrubbed) / nitrogenInPools(coated)).toBeCloseTo(1, 12);
    expect(carbonInPools(scrubbed) / carbonInPools(coated)).toBeCloseTo(1, 12);
    expect(alkalinityNetOfNitrogen(scrubbed) / alkalinityNetOfNitrogen(coated)).toBeCloseTo(1, 12);
    for (const n of WASTE_NUTRIENTS) expect(mineralsInPools(scrubbed, n) / mineralsInPools(coated, n)).toBeCloseTo(1, 12);
  });
});

describe('a plant dying in the dark', () => {
  const start = produce(cycledBareTank(), (draft) => {
    const doomed = plantRecord({ id: 'sword', species: 'amazon_sword', size: 50, condition: 0.01 });
    doomed.budget.reserve = 0;
    draft.plants = [doomed];
    draft.equipment.light.enabled = false;
    draft.resources.nitrate = 20 * draft.resources.water;
  });
  const end = tick(start);

  it('leaves its stores in the waste with its tissue, nitrogen and KH net of it conserved', () => {
    expect(end.plants).toHaveLength(0);
    expect(end.logs.some((log) => log.event === 'plant-died')).toBe(true);
    expect(nitrogenInPools(end) / nitrogenInPools(start)).toBeCloseTo(1, 12);
    expect(alkalinityNetOfNitrogen(end) / alkalinityNetOfNitrogen(start)).toBeCloseTo(1, 12);
  });
});

describe('a fresh tank with no iron', () => {
  let state: SimulationState;
  beforeAll(() => {
    state = run(
      produce(createSimulation({ tankCapacity: 100 }), (draft) => {
        draft.resources.ammonia = 2 * draft.resources.water;
        draft.resources.nitrate = 10 * draft.resources.water;
        draft.resources.phosphate = 1 * draft.resources.water;
        draft.resources.potassium = 5 * draft.resources.water;
      }),
      60 * 24
    );
  });

  it('builds no spore in sixty days, and so holds nothing for one', () => {
    expect(state.resources.iron).toBe(0);
    for (const kind of ALGAE_KINDS) {
      expect(state.algae[kind].budget.structure).toBe(0);
      for (const n of NUTRIENTS) expect(state.algae[kind].budget.stores[n]).toBe(0);
    }
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

  it('is born at its growth form’s offshoot size, full condition, beside its parent', () => {
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
          grown.push(mature(she.budget, fishParams(she)));
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
