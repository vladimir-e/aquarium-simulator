import { describe, it, expect } from 'vitest';
import { createSimulation, type SimulationConfig } from './state.js';
import { FISH_SPECIES_DATA } from './livestock/species.js';
import { cycledColony, cycledNitrate, cycledReserve, type PresetSeed } from './seed.js';
import { DEFAULT_PLANT_SIZE } from './plants/create-plant.js';

const TANK: SimulationConfig = { tankCapacity: 40, substrate: { type: 'aqua_soil' } };

/** Everything a seed writes, ids and all. */
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

  it("sizes a 'cycled' colony against the capacity the tank was actually built at", () => {
    for (const tankCapacity of [20, 150]) {
      const seeded = createSimulation({ ...TANK, tankCapacity }, { bacteria: 'cycled' });

      expect(seeded.resources.aob).toBe(cycledColony(tankCapacity).aob);
      expect(seeded.resources.nob).toBe(cycledColony(tankCapacity).nob);
    }
  });

  describe('the bed', () => {
    it("ages a 'cycled' bed against the type and capacity the tank was built with", () => {
      for (const type of ['gravel', 'aqua_soil', 'sand'] as const) {
        for (const tankCapacity of [20, 150]) {
          const config = { tankCapacity, substrate: { type } };
          const seeded = createSimulation(config, { bacteria: 'cycled' });
          const virgin = createSimulation(config);

          expect(seeded.equipment.substrate.organicReserve).toBe(cycledReserve(type, tankCapacity));
          expect(seeded.equipment.substrate.organicReserve).toBeGreaterThan(0);
          expect(seeded.equipment.substrate.organicReserve).toBeLessThan(
            virgin.equipment.substrate.organicReserve
          );
        }
      }
    });

    it('sets the reserve on its own, without a colony', () => {
      const seeded = createSimulation(TANK, { substrate: { organicReserve: 0.4 } });

      expect(seeded.equipment.substrate.organicReserve).toBe(0.4);
      expect(seeded.equipment.substrate.type).toBe('aqua_soil');
      expect(seeded.resources.aob).toBe(0);
    });

    it('takes a named reserve over the one the shorthand would have resolved', () => {
      const seeded = createSimulation(TANK, {
        bacteria: 'cycled',
        substrate: { organicReserve: 1.5 },
      });

      expect(seeded.equipment.substrate.organicReserve).toBe(1.5);
      expect(seeded.resources.aob).toBe(cycledColony(TANK.tankCapacity).aob);
    });
  });

  describe('the nitrate a cycled tank has already made', () => {
    it('stands against the type and capacity the tank was built with', () => {
      for (const type of ['gravel', 'aqua_soil', 'sand'] as const) {
        const ppm = [20, 150].map((tankCapacity) => {
          const seeded = createSimulation(
            { tankCapacity, substrate: { type } },
            { bacteria: 'cycled' }
          );

          expect(seeded.resources.nitrate).toBe(cycledNitrate(type, tankCapacity));
          return seeded.resources.nitrate / seeded.resources.water;
        });

        expect(ppm[0]).toBeGreaterThan(0);
        expect(ppm[1]).toBeCloseTo(ppm[0], 10);
      }
    });

    it('scales with the organics the bed had to leach', () => {
      const perLitre = (type: 'sand' | 'gravel' | 'aqua_soil'): number => cycledNitrate(type, 1);

      expect(perLitre('aqua_soil')).toBeGreaterThan(perLitre('gravel'));
      expect(perLitre('gravel')).toBeGreaterThan(perLitre('sand'));
      expect(perLitre('sand')).toBeGreaterThan(0);
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

      expect(bedless.resources.aob).toBe(gravel.resources.aob);
      expect(gravel.resources.nitrate).toBeGreaterThan(0);
      expect(bedless.resources.nitrate).toBe(0);
    });

    it('takes a named nitrate over the one the shorthand would have resolved', () => {
      const seeded = createSimulation(TANK, { bacteria: 'cycled', resources: { nitrate: 900 } });

      expect(seeded.resources.nitrate).toBe(900);
    });

    it('survives a seed that names some other stock', () => {
      const seeded = createSimulation(TANK, { bacteria: 'cycled', resources: { ammonia: 80 } });

      expect(seeded.resources.ammonia).toBe(80);
      expect(seeded.resources.nitrate).toBe(cycledNitrate('aqua_soil', TANK.tankCapacity));
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

    it('stocks adults at age 0 by default, one per group', () => {
      const state = createSimulation(TANK, { fish: [{ species: 'neon_tetra' }] });

      expect(state.fish).toHaveLength(1);
      expect(state.fish[0].age).toBe(0);
      expect(state.fish[0].stage).toBe('adult');
      expect(state.fish[0].mass).toBe(FISH_SPECIES_DATA.neon_tetra.adultMass);
    });

    it('builds juveniles at an age, under adult mass', () => {
      const { breeding, adultMass } = FISH_SPECIES_DATA.guppy;
      const state = createSimulation(TANK, {
        fish: [{ species: 'guppy', count: 2, stage: 'fry', age: breeding.maturityAge / 2 }],
      });

      expect(state.fish).toHaveLength(2);
      for (const fish of state.fish) {
        expect(fish.stage).toBe('fry');
        expect(fish.age).toBe(breeding.maturityAge / 2);
        expect(fish.mass).toBeLessThan(adultMass);
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
          { species: 'java_fern', count: 3, size: 180 },
          { species: 'anubias' },
        ],
      });

      expect(state.plants).toHaveLength(4);
      expect(state.plants.slice(0, 3).map((p) => p.size)).toEqual([180, 180, 180]);
      expect(state.plants[3].species).toBe('anubias');
      expect(state.plants[3].size).toBe(DEFAULT_PLANT_SIZE);
      expect(state.plants.every((p) => p.condition === 100 && p.surplus === 0)).toBe(true);
    });
  });

  describe('determinism', () => {
    const SEED: PresetSeed = {
      bacteria: cycledColony(40),
      resources: { nitrate: 400 },
      fish: [
        { species: 'neon_tetra', count: 8 },
        { species: 'corydoras', count: 4, sex: 'female', age: 24 * 200 },
      ],
      plants: [{ species: 'java_fern', count: 3, size: 120 }],
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
    it('takes a fish older than its species lifespan', () => {
      const past = FISH_SPECIES_DATA.betta.maxAge * 2;
      const state = createSimulation(TANK, { fish: [{ species: 'betta', age: past }] });

      expect(state.fish[0].age).toBe(past);
    });

    it('takes a colony with no ammonia history', () => {
      const state = createSimulation(TANK, { bacteria: cycledColony(40) });

      expect(state.resources.aob).toBeGreaterThan(0);
      expect(state.resources.ammonia).toBe(0);
    });

    it('plants a species the substrate would refuse, and overstocks past the action caps', () => {
      const state = createSimulation(
        { tankCapacity: 20, substrate: { type: 'none' } },
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
