import { describe, it, expect } from 'vitest';
import { sizeOf } from './plants/canopy.js';
import { createSimulation, type Resources, type SimulationConfig } from './state.js';
import { STOCKED_FISH_SIZE, stockedBody } from './livestock/create-fish.js';
import {
  cycledBedNutrients,
  cycledColony,
  cycledHardness,
  cycledKhReserve,
  cycledReserve,
  cycledWaterNutrients,
  type PresetSeed,
} from './seed.js';
import {
  getSubstrateKhReserve,
  getSubstrateNutrients,
  getSubstrateOrganicReserve,
  type SubstrateType,
} from './equipment/substrate.js';
import { NUTRIENTS, ZERO_NUTRIENTS } from './config/nutrients.js';
import { addOrganics, atRecipe, scaleOrganics } from './core/organics.js';
import { DEFAULT_CONFIG } from './config/index.js';
import { calculateMaxBacteria } from './systems/nitrogen-cycle.js';
import { HARDSCAPE_TANNINS } from './equipment/hardscape.js';
import { DEFAULT_PLANT_SIZE, MIN_PLANTABLE_SIZE } from './plants/create-plant.js';
import { plantParams } from './flora/params.js';
import { stocked as stockedFlora } from './systems/flora-budget.js';
import { getDgh, getDkh, getKhMass } from './resources/helpers.js';
import { CACO3_PER_EQUIVALENT, MW_NO3 } from './core/chemistry.js';

const TANK: SimulationConfig = { tankCapacity: 40, substrate: { type: 'aqua_soil' } };

function stocked(seed: PresetSeed, rngSeed: number): unknown {
  const state = createSimulation(TANK, seed, rngSeed);
  return { resources: state.resources, fish: state.fish, plants: state.plants };
}

describe('createSimulation seeding', () => {
  it('builds the same empty tank as before when there is no seed', () => {
    const bare = createSimulation(TANK);
    const seeded = createSimulation(TANK, {});

    expect(seeded.resources).toEqual(bare.resources);
    expect(seeded.fish).toEqual([]);
    expect(seeded.plants).toEqual([]);
    expect(seeded.tick).toBe(0);
  });

  it('hands back a tank as mutable as an unseeded one', () => {
    const bare = createSimulation(TANK);
    const seeded = createSimulation(TANK, {
      bacteria: { aob: 1200 },
      fish: [{ species: 'guppy' }],
      plants: [{ species: 'anubias' }],
    });

    expect(Object.isFrozen(seeded)).toBe(Object.isFrozen(bare));
    expect(Object.isFrozen(seeded.resources)).toBe(Object.isFrozen(bare.resources));
    expect(Object.isFrozen(seeded.fish)).toBe(Object.isFrozen(bare.fish));
  });

  it('leaves every stock a seed does not name where it was', () => {
    const bare = createSimulation(TANK);
    const seeded = createSimulation(TANK, { resources: { nitrate: 500 } });

    expect(seeded.resources.nitrate).toBe(500);
    expect(seeded.resources).toEqual({ ...bare.resources, nitrate: 500 });
  });

  it('sets the colony and the chemistry stocks it names', () => {
    const seeded = createSimulation(TANK, {
      bacteria: { aob: 1200, nob: 800 },
      resources: {
        ammonia: 80,
        nitrite: 4,
        nitrate: 900,
        phosphate: 20,
        potassium: 60,
        iron: 2,
        oxygen: 5.5,
        co2: 18,
      },
    });

    expect(seeded.resources.aob).toBe(1200);
    expect(seeded.resources.nob).toBe(800);
    expect(seeded.resources.ammonia).toBe(80);
    expect(seeded.resources.nitrite).toBe(4);
    expect(seeded.resources.nitrate).toBe(900);
    expect(seeded.resources.phosphate).toBe(20);
    expect(seeded.resources.potassium).toBe(60);
    expect(seeded.resources.iron).toBe(2);
    expect(seeded.resources.oxygen).toBe(5.5);
    expect(seeded.resources.co2).toBe(18);
  });

  it('seeds one colony without the other', () => {
    const seeded = createSimulation(TANK, { bacteria: { aob: 1200 } });

    expect(seeded.resources.aob).toBe(1200);
    expect(seeded.resources.nob).toBe(0);
  });

  it("floors a fishless 'cycled' colony on the surface its capacity, filter and bed give it", () => {
    const cycled = (config: Omit<SimulationConfig, 'tankCapacity'>, tankCapacity = 100): Resources =>
      createSimulation({ tankCapacity, ...config }, { bacteria: 'cycled' }).resources;

    const share = (resources: Resources): [number, number] => {
      const ceiling = calculateMaxBacteria(resources.surface);
      return [resources.aob / ceiling, resources.nob / ceiling];
    };
    const [aobShare, nobShare] = share(cycled({}, 20));
    const others = [
      cycled({}, 150),
      cycled({ filter: { type: 'canister' } }),
      cycled({ substrate: { type: 'sand' } }),
    ];
    for (const tank of others) {
      expect(share(tank)[0]).toBeCloseTo(aobShare, 12);
      expect(share(tank)[1]).toBeCloseTo(nobShare, 12);
    }
    expect(cycled({ filter: { type: 'canister' } }).aob).toBeGreaterThan(
      cycled({ filter: { type: 'sponge' } }).aob
    );
    expect(cycled({ substrate: { type: 'aqua_soil' } }).aob).toBeGreaterThan(
      cycled({ substrate: { type: 'gravel' } }).aob
    );
    expect(cycled({ substrate: { type: 'gravel' } }).aob).toBeGreaterThan(
      cycled({ substrate: { type: 'sand' } }).aob
    );
  });

  it("grows a 'cycled' colony into the stock it carries, under the surface ceiling", () => {
    const cycled = (count: number): Resources =>
      createSimulation(TANK, { bacteria: 'cycled', fish: [{ species: 'angelfish', count }] }).resources;

    const few = cycled(2);
    const many = cycled(6);
    expect(many.aob).toBeGreaterThan(few.aob);
    expect(many.nob).toBeGreaterThan(few.nob);
    expect(few.aob).toBeGreaterThan(cycled(0).aob);

    const packed = cycled(10_000);
    const ceiling = calculateMaxBacteria(packed.surface);
    expect(packed.aob).toBeLessThanOrEqual(ceiling);
    expect(packed.nob).toBeLessThanOrEqual(ceiling);
    expect(packed.aob).toBeGreaterThan(ceiling * 0.9);
  });

  it("sizes a 'cycled' colony on the upkeep its fish burn, owed in any oxygen", () => {
    const tank = createSimulation(TANK, { fish: [{ species: 'angelfish', count: 6 }] });
    const colony = (oxygen: number): number => cycledColony({ ...tank, resources: { ...tank.resources, oxygen } }).aob;

    expect(colony(1)).toBeGreaterThan(cycledColony({ ...tank, fish: [] }).aob);
    expect(colony(1)).toBe(colony(tank.resources.oxygen));
  });

  describe('the bed', () => {
    it("ages a 'cycled' bed against the type and capacity the tank was built with", () => {
      for (const type of ['gravel', 'aqua_soil', 'sand'] as const) {
        for (const tankCapacity of [20, 150]) {
          const config = { tankCapacity, substrate: { type } };
          const seeded = createSimulation(config, { bacteria: 'cycled' });
          const virgin = createSimulation(config);

          expect(seeded.equipment.substrate.organicReserve).toEqual(cycledReserve(type, tankCapacity));
          expect(seeded.equipment.substrate.organicReserve.grams).toBeGreaterThan(0);
          expect(seeded.equipment.substrate.organicReserve.grams).toBeLessThan(
            virgin.equipment.substrate.organicReserve.grams
          );
        }
      }
    });

    it("leaves a 'cycled' aqua soil bed a month of its leak short of fresh, and an inert bed empty", () => {
      const seeded = createSimulation(TANK, { bacteria: 'cycled' });
      const virgin = createSimulation(TANK);
      expect(seeded.equipment.substrate.nutrients).toEqual(cycledBedNutrients('aqua_soil', TANK.tankCapacity));
      expect(seeded.equipment.substrate.nutrients.nitrate).toBeGreaterThan(0);
      expect(seeded.equipment.substrate.nutrients.nitrate).toBeLessThan(virgin.equipment.substrate.nutrients.nitrate);
      expect(cycledBedNutrients('gravel', TANK.tankCapacity)).toEqual(ZERO_NUTRIENTS);
    });

    it('takes a named bed store over the cycled one', () => {
      const nutrients = { nitrate: 400, phosphate: 60, potassium: 200, iron: 10 };
      const seeded = createSimulation(
        { ...TANK, substrate: { type: 'gravel' } },
        { bacteria: 'cycled', substrate: { nutrients } }
      );

      expect(seeded.equipment.substrate.nutrients).toEqual(nutrients);
    });

    it('sets the reserve on its own, without a colony', () => {
      const organicReserve = atRecipe(0.4, DEFAULT_CONFIG);
      const seeded = createSimulation(TANK, { substrate: { organicReserve } });

      expect(seeded.equipment.substrate.organicReserve).toEqual(organicReserve);
      expect(seeded.equipment.substrate.type).toBe('aqua_soil');
      expect(seeded.resources.aob).toBe(0);
    });

    it('takes a named KH reserve over the cycled one, and leaves the organics to the shorthand', () => {
      const seeded = createSimulation(TANK, { bacteria: 'cycled', substrate: { khReserve: 123 } });

      expect(seeded.equipment.substrate.khReserve).toBe(123);
      expect(seeded.equipment.substrate.organicReserve).toEqual(
        cycledReserve('aqua_soil', TANK.tankCapacity)
      );
    });

    it('takes a named reserve over the one the shorthand would have resolved', () => {
      const organicReserve = atRecipe(1.5, DEFAULT_CONFIG);
      const seeded = createSimulation(TANK, {
        bacteria: 'cycled',
        substrate: { organicReserve },
      });

      expect(seeded.equipment.substrate.organicReserve).toEqual(organicReserve);
      expect(seeded.resources.aob).toBe(cycledColony(seeded).aob);
    });
  });

  describe('the alkalinity a cycled tank keeps', () => {
    it('keeps less KH over aqua soil than over an inert bed', () => {
      const soil = cycledHardness('aqua_soil', 5, 8, 100);
      expect(soil.kh).toBeLessThan(cycledHardness('gravel', 5, 8, 100).kh);
      expect(soil.kh).toBeGreaterThan(0);
    });

    it('scales with capacity', () => {
      for (const type of ['aqua_soil', 'sand'] as const) {
        const small = cycledHardness(type, 5, 8, 100);
        const large = cycledHardness(type, 5, 8, 200);
        expect(large.kh).toBeCloseTo(2 * small.kh, 10);
        expect(large.gh).toBeCloseTo(2 * small.gh, 10);
      }
    });

    it('charges an equivalent of KH per mole of the nitrate its leached organics left, as the nitrogen loop does', () => {
      for (const type of ['gravel', 'sand'] as const) {
        const { kh } = cycledHardness(type, 5, 8, 100);
        const { nitrate } = cycledWaterNutrients(type, 100);

        expect(nitrate).toBeGreaterThan(0);
        expect(kh + (nitrate / MW_NO3) * CACO3_PER_EQUIVALENT).toBeCloseTo(getKhMass(5, 100), 10);
      }
    });

    it('keeps GH as far below the tap as the soil took KH, and KH lower by the nitrate its organics left', () => {
      const seeded = createSimulation({ ...TANK, tapKh: 5, tapGh: 8 }, { bacteria: 'cycled' });
      const { resources, environment } = seeded;
      const { tankCapacity } = TANK;
      const ghShort = environment.tapGh - getDgh(resources.gh, resources.water);
      const khShort = environment.tapKh - getDkh(resources.kh, resources.water);
      const leached = (type: SubstrateType): number =>
        getSubstrateOrganicReserve(type, tankCapacity).grams - cycledReserve(type, tankCapacity).grams;
      const gravelSpent = 5 - getDkh(cycledHardness('gravel', 5, 8, tankCapacity).kh, tankCapacity);

      expect(resources.gh).toBe(cycledHardness('aqua_soil', 5, 8, tankCapacity).gh);
      expect(ghShort).toBeGreaterThan(0);
      expect(khShort - ghShort).toBeCloseTo((gravelSpent * leached('aqua_soil')) / leached('gravel'), 10);
    });

    it('takes no more KH than the tap has GH to give up alongside it', () => {
      const short = (tapKh: number, tapGh: number): { kh: number; gh: number } => {
        const { kh, gh } = cycledHardness('aqua_soil', tapKh, tapGh, 100);
        return { kh: tapKh - getDkh(kh, 100), gh: tapGh - getDgh(gh, 100) };
      };
      const capped = short(10, 2);
      const ample = short(5, 8);

      expect(capped.gh).toBeCloseTo(2, 10);
      expect(capped.kh - capped.gh).toBeCloseTo(ample.kh - ample.gh, 10);
    });

    it('spends no KH the tap never brought', () => {
      expect(cycledHardness('aqua_soil', 0, 8, 100).kh).toBe(0);
    });

    it('hands a soil bed part of its buffer, spent but not exhausted', () => {
      const seeded = createSimulation(TANK, { bacteria: 'cycled' });
      const fresh = getSubstrateKhReserve('aqua_soil', TANK.tankCapacity);

      expect(seeded.equipment.substrate.khReserve).toBe(cycledKhReserve('aqua_soil', TANK.tankCapacity));
      expect(seeded.equipment.substrate.khReserve).toBeGreaterThan(0);
      expect(seeded.equipment.substrate.khReserve).toBeLessThan(fresh);
    });

    it('hands hardscape over as bought', () => {
      const seeded = createSimulation(
        {
          ...TANK,
          hardscape: {
            items: [
              { id: 'w', type: 'driftwood' },
              { id: 'r', type: 'calcite_rock' },
            ],
          },
        },
        { bacteria: 'cycled' }
      );
      const [wood, rock] = seeded.equipment.hardscape.items;

      expect(wood!.tannins).toBe(HARDSCAPE_TANNINS.driftwood);
      expect(rock!.tannins).toBe(0);
    });
  });

  describe('the nutrients a cycled tank has already made', () => {
    it('stands against the type and capacity the tank was built with', () => {
      for (const type of ['gravel', 'aqua_soil', 'sand'] as const) {
        const ppm = [20, 150].map((tankCapacity) => {
          const seeded = createSimulation(
            { tankCapacity, substrate: { type } },
            { bacteria: 'cycled' }
          );

          expect(seeded.resources.nitrate).toBe(cycledWaterNutrients(type, tankCapacity).nitrate);
          return seeded.resources.nitrate / seeded.resources.water;
        });

        expect(ppm[0]).toBeGreaterThan(0);
        expect(ppm[1]).toBeCloseTo(ppm[0], 10);
      }
    });

    it('scales with the organics the bed had to leach', () => {
      const perLitre = (type: 'sand' | 'gravel' | 'aqua_soil'): number => cycledWaterNutrients(type, 1).nitrate;

      expect(perLitre('aqua_soil')).toBeGreaterThan(perLitre('gravel'));
      expect(perLitre('gravel')).toBeGreaterThan(perLitre('sand'));
      expect(perLitre('sand')).toBeGreaterThan(0);
    });

    it('holds a share of what the bed leached and leaked, and never more than a fresh bed had to give', () => {
      const { tankCapacity } = TANK;
      const seeded = createSimulation(TANK, { bacteria: 'cycled' });
      const leached = addOrganics(
        getSubstrateOrganicReserve('aqua_soil', tankCapacity),
        scaleOrganics(cycledReserve('aqua_soil', tankCapacity), -1)
      ).nutrients;
      const fresh = getSubstrateNutrients('aqua_soil', tankCapacity);

      for (const n of NUTRIENTS) {
        const water = seeded.resources[n];
        const bed = seeded.equipment.substrate.nutrients[n];
        const released = fresh[n] + leached[n] - bed;
        expect(water + bed).toBeLessThanOrEqual(fresh[n] + leached[n]);
        expect(water).toBeGreaterThan(0);
        expect(water / released).toBeGreaterThan(0);
        expect(water / released).toBeLessThan(1);
      }
    });

    it('is none at all in a tank whose bed never had any', () => {
      const bedless = createSimulation(
        { tankCapacity: 40, substrate: { type: 'none' } },
        { bacteria: 'cycled' }
      );
      const gravel = createSimulation(
        { tankCapacity: 40, substrate: { type: 'gravel' } },
        { bacteria: 'cycled' }
      );

      for (const n of NUTRIENTS) {
        expect(gravel.resources[n]).toBeGreaterThan(0);
        expect(bedless.resources[n]).toBe(0);
      }
    });

    it('takes a named nitrate over the one the shorthand would have resolved', () => {
      const seeded = createSimulation(TANK, { bacteria: 'cycled', resources: { nitrate: 900 } });

      expect(seeded.resources.nitrate).toBe(900);
    });

    it('survives a seed that names some other stock', () => {
      const seeded = createSimulation(TANK, { bacteria: 'cycled', resources: { ammonia: 80 } });

      expect(seeded.resources.ammonia).toBe(80);
      expect(seeded.resources.nitrate).toBe(cycledWaterNutrients('aqua_soil', TANK.tankCapacity).nitrate);
      expect(seeded.resources.nitrate).toBeGreaterThan(0);
    });
  });

  describe('roster', () => {
    it('produces exactly the sexes it names, every run', () => {
      for (let run = 0; run < 25; run++) {
        const state = createSimulation(TANK, {
          fish: [
            { species: 'guppy', count: 3, sex: 'female' },
            { species: 'guppy', count: 1, sex: 'male' },
          ],
        });

        expect(state.fish.filter((f) => f.sex === 'female')).toHaveLength(3);
        expect(state.fish.filter((f) => f.sex === 'male')).toHaveLength(1);
      }
    });

    it('stocks fish at the stocking size by default, one per group', () => {
      const state = createSimulation(TANK, { fish: [{ species: 'neon_tetra' }] });

      expect(state.fish).toHaveLength(1);
      expect(state.fish[0].budget).toEqual(stockedBody('neon_tetra', STOCKED_FISH_SIZE).budget);
    });

    it('builds fish at the size the roster names, as the shop raised them', () => {
      const state = createSimulation(TANK, { fish: [{ species: 'guppy', count: 2, size: 30 }] });

      expect(state.fish).toHaveLength(2);
      const body = stockedBody('guppy', 30);
      for (const fish of state.fish) {
        expect(fish.budget).toEqual(body.budget);
        expect(fish.age).toBe(body.age);
      }
    });

    it('refuses a size no fish is stocked at', () => {
      for (const size of [120, 0.1]) {
        expect(() => createSimulation(TANK, { fish: [{ species: 'guppy', size }] })).toThrow(/stocked from/);
      }
    });

    it('carries the individual variation a stocked fish gets', () => {
      const state = createSimulation(TANK, { fish: [{ species: 'neon_tetra', count: 40 }] }, 4);
      const offsets = new Set(state.fish.map((f) => f.hardinessOffset));

      expect(offsets.size).toBeGreaterThan(1);
      expect(new Set(state.fish.map((f) => f.id)).size).toBe(40);
    });

    it('builds the same individuals whether or not a group names its sex', () => {
      const roster = (sex?: 'male' | 'female'): PresetSeed => ({
        fish: [
          { species: 'guppy', sex },
          { species: 'neon_tetra', count: 4 },
        ],
      });
      const named = createSimulation(TANK, roster('female'), 7).fish;
      const sampled = createSimulation(TANK, roster(), 7).fish;

      expect(named.map((f) => f.hardinessOffset)).toEqual(sampled.map((f) => f.hardinessOffset));
      expect(named.map((f) => f.health)).toEqual(sampled.map((f) => f.health));
    });
  });

  describe('scape', () => {
    it('plants a group at a size, defaulting to a young specimen', () => {
      const state = createSimulation(TANK, {
        plants: [
          { species: 'java_fern', count: 3, size: 80 },
          { species: 'anubias' },
        ],
      });

      expect(state.plants).toHaveLength(4);
      for (const plant of state.plants.slice(0, 3)) expect(sizeOf(plant)).toBeCloseTo(80, 9);
      expect(state.plants[3].species).toBe('anubias');
      expect(sizeOf(state.plants[3])).toBeCloseTo(DEFAULT_PLANT_SIZE, 9);
      expect(state.plants.every((p) => p.condition === 100 && p.budget.offshootBuffer === 0)).toBe(true);
    });

    it('stocks each plant fed and full on the plants config the tank runs on', () => {
      const plants = { ...DEFAULT_CONFIG.plants, reserveCapacity: 2 * DEFAULT_CONFIG.plants.reserveCapacity };
      const [tuned] = createSimulation({ ...TANK, plants }, { plants: [{ species: 'java_fern' }] }).plants;
      const [shipped] = createSimulation(TANK, { plants: [{ species: 'java_fern' }] }).plants;

      expect(tuned.budget).toEqual(stockedFlora(tuned.budget.structure, plantParams('java_fern', plants)));
      expect(tuned.budget.reserve).toBeCloseTo(2 * shipped.budget.reserve, 12);
    });

    it('plants only a size a unit can be planted at', () => {
      const planted = (size: number) => (): unknown => createSimulation(TANK, { plants: [{ species: 'java_fern', size }] });

      expect(planted(MIN_PLANTABLE_SIZE)).not.toThrow();
      expect(planted(100)).not.toThrow();
      for (const size of [0, MIN_PLANTABLE_SIZE / 2, 100.5]) expect(planted(size)).toThrow(/size must be within/);
    });

    it('founds a family per record, each on a vigour of its own, at the age the group names', () => {
      const state = createSimulation(TANK, {
        plants: [
          { species: 'java_fern', count: 3, age: 24 * 90 },
          { species: 'anubias' },
        ],
      });

      expect(state.plants.map((p) => p.age)).toEqual([2160, 2160, 2160, 0]);
      expect(state.plants.every((p) => p.parentId === null && p.familyId === p.id)).toBe(true);
      expect(new Set(state.plants.map((p) => p.vigour)).size).toBe(4);
    });
  });

  describe('determinism', () => {
    const SEED: PresetSeed = {
      bacteria: { aob: 12000, nob: 8000 },
      resources: { nitrate: 400 },
      fish: [
        { species: 'neon_tetra', count: 8 },
        { species: 'corydoras', count: 4, sex: 'female', size: 60 },
      ],
      plants: [{ species: 'java_fern', count: 3, size: 90 }],
    };

    it('builds the same tank twice from one seed and rng seed, ids included', () => {
      expect(stocked(SEED, 2026)).toEqual(stocked(SEED, 2026));
    });

    it('builds different rosters from different rng seeds', () => {
      const roster: PresetSeed = { fish: [{ species: 'neon_tetra', count: 12 }] };

      expect(stocked(roster, 1)).not.toEqual(stocked(roster, 2));
    });

    it('spends the stream only on what the seed stocks', () => {
      const bare = createSimulation(TANK, {}, 2026);
      const one = createSimulation(TANK, { fish: [{ species: 'guppy' }] }, 2026);
      const two = createSimulation(TANK, { fish: [{ species: 'guppy', count: 2 }] }, 2026);

      expect(bare.rng).toEqual({ seed: 2026, counter: 0 });
      expect(one.rng.counter).toBeGreaterThan(0);
      expect(two.rng.counter - one.rng.counter).toBe(one.rng.counter);
    });
  });

  describe('impossible states are constructible on purpose', () => {
    it('sizes a cycled colony in water with no oxygen in it', () => {
      const anoxic = createSimulation(TANK, {
        bacteria: 'cycled',
        resources: { oxygen: 0 },
        fish: [{ species: 'neon_tetra', count: 6 }],
      });

      expect(anoxic.resources.oxygen).toBe(0);
      expect(Number.isFinite(anoxic.resources.aob)).toBe(true);
      expect(Number.isFinite(anoxic.resources.nob)).toBe(true);
      expect(anoxic.resources.aob).toBeGreaterThan(0);
      expect(anoxic.resources.nob).toBeGreaterThan(0);
    });

    it('takes a colony with no ammonia history', () => {
      const state = createSimulation(TANK, { bacteria: { aob: 12000, nob: 8000 } });

      expect(state.resources.aob).toBeGreaterThan(0);
      expect(state.resources.ammonia).toBe(0);
    });

    it('overstocks past the action caps: plants past the floor, fish past the tank’s capacity', () => {
      const state = createSimulation(
        { tankCapacity: 20 },
        {
          fish: [{ species: 'angelfish', count: 40 }],
          plants: [{ species: 'monte_carlo', count: 30 }],
        }
      );

      expect(state.fish).toHaveLength(40);
      expect(state.plants).toHaveLength(30);
    });
  });
});
