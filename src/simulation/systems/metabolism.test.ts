import { describe, it, expect } from 'vitest';
import { burn, fishPace, gillAmmonia, liveHour, loadStress, processMetabolism } from './metabolism.js';
import { NO_STRESS, oxygenPace, totalBurned } from './reserve.js';
import { appetite, gutCapacity, gutRoom, type Pace } from './digestion.js';
import { livestockDefaults as config, TOXINS, ZERO_TOXINS, type ToxinVector } from '../config/livestock.js';
import { speciesTau } from '../livestock/species.js';
import { fishHardiness, toxinEdges } from '../livestock/tolerance.js';
import { waterStressors } from './fish-health.js';
import { createSimulation, type Fish } from '../state.js';
import { NUTRIENTS, WASTE_NUTRIENTS } from '../config/nutrients.js';
import { DEFAULT_CONFIG, configRange, withTunable } from '../config/index.js';
import { MW_CO2, MW_NH3, MW_NO3, MW_O2 } from '../core/chemistry.js';
import { NO_ORGANICS, addOrganics, atRecipe, portion, type Organics } from '../core/organics.js';
import { sum } from '../core/sum.js';
import { FISH_SPECIES_DATA, type FishSpecies } from '../livestock/species.js';
import { fishComposition, fishOrganics } from './fish-body.js';
import { fishRecord } from '../tests/fish.js';
import { LEAN, ofFood, organicsCloseTo } from '../tests/organics.js';

const SATURATED = 8;
const REFERENCE: Pace = { tau: 1, omega: 1, stress: NO_STRESS };
const body = fishComposition(DEFAULT_CONFIG);

describe('oxygenPace', () => {
  it('reads 1 in saturated water and above it, and nothing in none', () => {
    expect(oxygenPace(SATURATED, SATURATED, 1)).toBe(1);
    expect(oxygenPace(12, SATURATED, 1)).toBe(1);
    expect(oxygenPace(0, SATURATED, 1)).toBe(0);
  });

  it('is a Monod on dissolved oxygen against saturated water', () => {
    expect(oxygenPace(1, SATURATED, 1)).toBeCloseTo(0.5 / (SATURATED / (1 + SATURATED)), 12);
    expect(oxygenPace(2, SATURATED, 1)).toBeLessThan(oxygenPace(4, SATURATED, 1));
  });
});

const guppy = fishRecord({ species: 'guppy' });
const loadedWith = (load: Partial<ToxinVector>, fish: Fish = guppy): Fish => ({ ...fish, load: { ...ZERO_TOXINS, ...load } });
const edges = toxinEdges(fishHardiness(guppy));
const WATER = { temperature: 26, oxygen: SATURATED };

describe('loadStress', () => {
  it('is no stress at all on a fish carrying nothing', () => {
    expect(loadStress(guppy, config)).toEqual(NO_STRESS);
  });

  it('holds the ceiling whole up to the fish’s own edge, and lowers it hyperbolically on the e-folds past it', () => {
    expect(loadStress(loadedWith({ nitrite: edges.nitrite }), config).assimilation).toBe(1);
    expect(loadStress(loadedWith({ nitrite: edges.nitrite * Math.E }), config).assimilation).toBeCloseTo(
      1 / (1 + config.loadAssimilationSeverity),
      12
    );
  });

  it('falls as the load rises past the edge, and stays in (0, 1]', () => {
    const shares = [1, 2, 10, 1e3, 1e12].map(
      (times) => loadStress(loadedWith({ ammonia: edges.ammonia * times }), config).assimilation
    );
    shares.slice(1).forEach((share, i) => expect(share).toBeLessThan(shares[i]));
    for (const share of shares) {
      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThanOrEqual(1);
    }
  });

  it('weighs an e-fold of one toxin as an e-fold of another', () => {
    const one = loadStress(loadedWith({ ammonia: edges.ammonia * Math.E ** 2 }), config);
    const both = loadStress(loadedWith({ ammonia: edges.ammonia * Math.E, nitrate: edges.nitrate * Math.E }), config);
    expect(both.assimilation).toBeCloseTo(one.assimilation, 12);
  });

  it('reads the e-folds health charges, past the same edges hardiness moves', () => {
    const { resources } = createSimulation({ tankCapacity: 100 });
    const load = { ammonia: 0.1, nitrite: 3, nitrate: 400 };
    const fishes = [
      loadedWith(load),
      loadedWith(load, fishRecord({ species: 'neon_tetra' })),
      loadedWith(load, fishRecord({ species: 'angelfish', hardinessOffset: 0.1 })),
    ];
    for (const fish of fishes) {
      const charged = waterStressors(fish.species, fishHardiness(fish), fish.load, resources, resources.water, config);
      const folds = sum(
        TOXINS.map((t) => charged.find((factor) => factor.key === t)!.amount / config[`${t}StressSeverity`])
      );
      expect(1 / loadStress(fish, config).assimilation - 1).toBeCloseTo(config.loadAssimilationSeverity * folds, 12);
    }
  });

  it('leaves maintenance, growth cost and egg cost whole', () => {
    const stress = loadStress(loadedWith({ ammonia: 1, nitrite: 20, nitrate: 2000 }), config);
    expect({ ...stress, assimilation: 1 }).toEqual(NO_STRESS);
  });
});

describe('fishPace', () => {
  it('runs on its species’ Arrhenius temperature, on oxygen alone for ω, and on its load for stress', () => {
    const fish = loadedWith({ nitrite: 4 });
    const pace = fishPace(fish, { temperature: 26, oxygen: 3 }, SATURATED, config);
    expect(pace.tau).toBe(speciesTau('guppy', 26));
    expect(pace.omega).toBe(oxygenPace(3, SATURATED, config.oxygenHalfSaturation));
    expect(pace.stress).toEqual(loadStress(fish, config));
  });

  it('lowers a loaded fish’s hourly appetite below an unloaded one’s, and a full gut still bites', () => {
    const loaded = loadedWith({ nitrite: edges.nitrite * 4 });
    const cleanPace = fishPace(guppy, WATER, SATURATED, config);
    const loadedPace = fishPace(loaded, WATER, SATURATED, config);
    expect(appetite(loaded, loadedPace)).toBeLessThan(appetite(guppy, cleanPace));

    const gut = ofFood(gutCapacity(guppy, cleanPace));
    const assimilated = (fish: Fish, pace: Pace): number =>
      liveHour({ ...fish, gut }, pace, 0, config, body).fluxes.assimilated;
    expect(assimilated(loaded, loadedPace)).toBeLessThan(assimilated(guppy, cleanPace));
  });
});

describe('burn', () => {
  it('excretes the body’s nitrogen as NH3 through the gills and its minerals, gram for gram', () => {
    const burnt = burn(2, body, config);
    expect(burnt.ammonia).toBeCloseTo((2 * body.nutrients.nitrate * MW_NH3) / MW_NO3, 9);
    expect(burnt.ammonia).toBe(gillAmmonia(2, body));
    for (const n of WASTE_NUTRIENTS) expect(burnt.minerals[n]).toBeCloseTo(2 * body.nutrients[n], 12);
  });

  it('breathes oxygenPerGramBurned and exhales the respiratory quotient in moles', () => {
    const burnt = burn(0.5, body, config);
    expect(burnt.oxygen).toBeCloseTo(0.5 * config.oxygenPerGramBurned, 9);
    expect(burnt.co2 / MW_CO2 / (burnt.oxygen / MW_O2)).toBeCloseTo(config.respiratoryQuotient, 12);
  });
});

describe('liveHour', () => {
  const fed = fishRecord({ species: 'guppy', gut: ofFood(0.003), age: 100 });
  const preyed = { ...fed, gut: addOrganics(ofFood(0.001), portion(body, 0.002)) };
  const lean = { ...fed, gut: portion(LEAN, 0.003) };
  const held = (fish: Fish): Organics => addOrganics(fish.gut, portion(body, fishOrganics(fish)));

  it('closes its ledger in grams, carbon and every nutrient: gut and body before are gut and body after, feces and burn', () => {
    for (const fish of [fed, preyed, lean, { ...fed, gut: NO_ORGANICS }, { ...fed, health: 40 }]) {
      const hour = liveHour(fish, REFERENCE, 1e-5, config, body);
      expect(hour.feces.grams).toBeCloseTo(hour.fluxes.feces, 15);
      expect(addOrganics(held(hour.fish), hour.feces, portion(body, totalBurned(hour.fluxes)))).toEqual(
        organicsCloseTo(held(fish), 12)
      );
    }
  });

  it('passes the carbon its reserve does not keep, never less than none, at every recipe and every species', () => {
    const { min, max } = configRange('livestock.foodCarbonFraction')!;
    for (const carbon of [min, max]) {
      const tuned = withTunable(DEFAULT_CONFIG, 'livestock.foodCarbonFraction', carbon);
      for (const species of Object.keys(FISH_SPECIES_DATA) as FishSpecies[]) {
        const fish = fishRecord({ species, gut: atRecipe(gutCapacity(fishRecord({ species }), REFERENCE), tuned) });
        const hour = liveHour(fish, REFERENCE, 0, tuned.livestock, fishComposition(tuned));
        const taken = hour.fluxes.assimilated + hour.fluxes.feces;
        expect(hour.feces.grams).toBeGreaterThan(0);
        expect(hour.feces.carbon).toBeGreaterThanOrEqual(0);
        expect(hour.feces.carbon).toBeCloseTo(taken * carbon - hour.fluxes.assimilated * body.carbon, 15);
        for (const n of NUTRIENTS) expect(hour.feces.nutrients[n] / hour.feces.grams).toBeCloseTo(body.nutrients[n], 9);
      }
    }
  });

  it('digests at τ and hands the gut back what the budget could not take up', () => {
    const hour = liveHour(fed, REFERENCE, 0, config, body);
    expect(hour.fish.gut.grams).toBeCloseTo(fed.gut.grams - hour.digested.grams + hour.fluxes.returned, 15);
    expect(liveHour(fed, { ...REFERENCE, tau: 2 }, 0, config, body).digested.grams).toBeGreaterThan(hour.digested.grams);
  });

  it('ages an hour and keeps exp(−h) of its survival', () => {
    const old = { ...fed, budget: { ...fed.budget, hazard: 1e-3 }, survival: 0.8 };
    const hour = liveHour(old, REFERENCE, 0, config, body);
    expect(hour.fish.age).toBe(101);
    expect(hour.fish.survival).toBeCloseTo(0.8 * Math.exp(-1e-3), 15);
  });
});

describe('processMetabolism', () => {
  const school = [
    fishRecord({ id: 'a', species: 'guppy', size: 30 }),
    fishRecord({ id: 'b', species: 'guppy', size: 70 }),
  ];
  const paces = [REFERENCE, REFERENCE];

  it('returns nothing for no fish', () => {
    expect(processMetabolism([], [], [], { food: ofFood(1) }, config, body)).toEqual({
      hours: [],
      updatedFish: [],
      foodConsumed: NO_ORGANICS,
      feces: NO_ORGANICS,
      burned: 0,
    });
  });

  it('fills every gut while the food lasts', () => {
    const result = processMetabolism(school, paces, [0, 0], { food: ofFood(10) }, config, body);
    result.updatedFish.forEach((f) => expect(f.gut.grams).toBeCloseTo(gutCapacity(f, REFERENCE), 15));
  });

  it('serves short food in proportion to the room in each gut, so every fish fills the same share of it', () => {
    const food = 1e-4;
    const result = processMetabolism(school, paces, [0, 0], { food: ofFood(food) }, config, body);
    const rooms = result.hours.map((hour) => gutRoom(hour.fish, REFERENCE));
    expect(result.foodConsumed).toEqual(organicsCloseTo(ofFood(food), 15));
    expect(result.updatedFish[1].gut.grams / rooms[1]).toBeCloseTo(result.updatedFish[0].gut.grams / rooms[0], 9);
  });

  it('eats nothing with nothing in the water', () => {
    expect(processMetabolism(school, paces, [0, 0], { food: NO_ORGANICS }, config, body).foodConsumed).toEqual(NO_ORGANICS);
  });

  it('passes the hours’ feces and burn', () => {
    const fed = school.map((f) => ({ ...f, gut: ofFood(0.01) }));
    const result = processMetabolism(fed, paces, [0, 0], { food: NO_ORGANICS }, config, body);
    expect(result.feces).toEqual(organicsCloseTo(addOrganics(...result.hours.map((hour) => hour.feces)), 15));
    expect(result.feces.grams).toBeCloseTo(sum(result.hours.map((hour) => hour.fluxes.feces)), 15);
    expect(result.burned).toBe(sum(result.hours.map((hour) => totalBurned(hour.fluxes))));
    expect(result.feces.grams).toBeGreaterThan(0);
  });

  it('passes nothing the hour a meal is eaten: its waste comes out as it digests', () => {
    const result = processMetabolism(school, paces, [0, 0], { food: ofFood(10) }, config, body);
    expect(result.feces).toEqual(NO_ORGANICS);
  });
});
