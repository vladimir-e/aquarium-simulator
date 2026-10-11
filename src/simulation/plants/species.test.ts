import { describe, it, expect } from 'vitest';
import { PLANT_SPECIES_DATA, type GrowthForm, type PlantSpecies } from './species.js';
import { sizeOf, tissueMass } from './canopy.js';
import { MIN_PLANTABLE_SIZE, offshootStructure } from './create-plant.js';
import { plantParams } from '../flora/params.js';
import { plantsDefaults } from '../config/plants.js';
import { NUTRIENTS, type Nutrient } from '../config/nutrients.js';
import { HOURS_PER_DAY } from '../core/clock.js';
import { droopFactor, droopLimits, stocked, type FloraParams, type FloraState } from '../systems/flora-budget.js';
import { growthTaper } from '../systems/flora.js';
import { reserveDensity } from '../systems/reserve.js';
import { DARK, floraTank, grow, hoursUntil, runFlora, type Growth } from '../tests/flora.js';
import { plantRecord } from '../tests/plant.js';

const roster = Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[];

const slower = (species: PlantSpecies): PlantSpecies[] =>
  roster.filter((other) => PLANT_SPECIES_DATA[other].growthRate < PLANT_SPECIES_DATA[species].growthRate);

/** Days between plantlets a grown unit takes in a rich, bright tank, by what its form buds. */
const PLANTLET_DAYS: Record<GrowthForm, readonly [number, number]> = {
  carpet: [1, 7],
  rosette: [4, 30],
  attached: [21, 90],
};

const p = (species: PlantSpecies): FloraParams => plantParams(species, plantsDefaults);

const sizeIn = (species: PlantSpecies, budget: FloraState): number => sizeOf({ species, budget });

const fedFreely = (species: PlantSpecies, size: number, days: number): Growth =>
  grow(p(species), stocked(tissueMass(species, size), p(species)), days * HOURS_PER_DAY, {
    room: (budget) => growthTaper(sizeIn(species, budget)),
    offshoot: offshootStructure(species),
  });

const byRoster = <T>(read: (species: PlantSpecies) => T): Record<PlantSpecies, T> =>
  Object.fromEntries(roster.map((species) => [species, read(species)])) as Record<PlantSpecies, T>;

const toNinety = byRoster((species) => {
  const sizes = fedFreely(species, MIN_PLANTABLE_SIZE, 800).states.map((budget) => sizeIn(species, budget));
  return { sizes, hours: hoursUntil(sizes, (size) => size >= 90) };
});

const plantletDays = byRoster((species) => {
  const { buds } = fedFreely(species, 100, 300);
  return (buds.at(-1)! - buds[0]) / (buds.length - 1) / HOURS_PER_DAY;
});

const inTheDark = byRoster((species) => {
  const run = runFlora(floraTank({ plants: [plantRecord({ id: species, species, size: 50 })] }), 90 * HOURS_PER_DAY, DARK);
  const plant = run.hours.map(({ state }) => state.plants.find(({ id }) => id === species));
  return {
    reserveEmpty: hoursUntil(plant, (it) => it !== undefined && reserveDensity(it.budget, p(species)) < 0.1),
    conditionFalls: hoursUntil(plant, (it) => it !== undefined && it.condition < 100),
    death: hoursUntil(plant, (it) => it === undefined),
  };
});

const leastStore = (params: FloraParams): Nutrient => {
  const room = (n: Nutrient): number => (params.qMax[n] - params.qMin[n]) / params.qMin[n];
  return NUTRIENTS.reduce((least, n) => (room(n) < room(least) ? n : least));
};

describe.each(roster)('%s on its energy budget', (species) => {
  it('grows from the smallest plantable unit toward full, fed freely, sooner than every slower grower', () => {
    const { sizes, hours } = toNinety[species];
    expect(sizes.every((size, hour) => size <= 100 && (hour === 0 || size >= sizes[hour - 1]))).toBe(true);
    expect(hours).toBeLessThan(Infinity);
    for (const other of slower(species)) expect(hours).toBeLessThan(toNinety[other].hours);
  });

  it('buds a plantlet grown and fed freely inside its form’s range of days, sooner than every slower grower', () => {
    const [fastest, slowest] = PLANTLET_DAYS[PLANT_SPECIES_DATA[species].growthForm];
    expect(plantletDays[species]).toBeGreaterThanOrEqual(fastest);
    expect(plantletDays[species]).toBeLessThanOrEqual(slowest);
    for (const other of slower(species)) expect(plantletDays[species]).toBeLessThan(plantletDays[other]);
  });

  it('kept dark from a full reserve, empties it before its condition falls and dies after, before every slower grower', () => {
    const { reserveEmpty, conditionFalls, death } = inTheDark[species];
    expect(reserveEmpty).toBeLessThan(conditionFalls);
    expect(conditionFalls).toBeLessThan(death);
    expect(death).toBeLessThan(Infinity);
    for (const other of slower(species)) expect(death).toBeLessThan(inTheDark[other].death);
  });

  it('carries its growth on full stores for days in lean water, the least store’s Droop limit ruling as it falls', () => {
    const params = p(species);
    const { states } = grow(params, stocked(tissueMass(species, 50), params), 14 * HOURS_PER_DAY, { fed: false });
    const daily = states.filter((_, hour) => (hour + 1) % HOURS_PER_DAY === 0).map(({ structure }) => structure);
    const least = leastStore(params);
    expect(daily.slice(0, 7).every((structure, day) => day === 0 || structure > daily[day - 1])).toBe(true);
    expect(states.every((state) => droopFactor(state, params) === droopLimits(state, params)[least])).toBe(true);
    expect(droopFactor(states.at(-1)!, params)).toBeLessThan(droopFactor(states[0], params));
  });
});
