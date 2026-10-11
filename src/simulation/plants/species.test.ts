import { beforeAll, describe, it, expect } from 'vitest';
import { PLANT_SPECIES_DATA, growthFormOf, type GrowthForm, type PlantSpecies } from './species.js';
import { sizeOf, tissueMass } from './canopy.js';
import { MIN_PLANTABLE_SIZE, offshootStructure } from './create-plant.js';
import { plantParams } from '../flora/params.js';
import { plantsDefaults } from '../config/plants.js';
import { HOURS_PER_DAY } from '../core/clock.js';
import { stocked, type FloraParams, type FloraState } from '../systems/flora-budget.js';
import { growthTaper } from '../systems/flora.js';
import { DARK, floraTank, grow, hoursUntil, runFlora, type Growth, type GrowthTerms } from '../tests/flora.js';
import { plantRecord } from '../tests/plant.js';

const roster = Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[];

const growthRate = (species: PlantSpecies): number => PLANT_SPECIES_DATA[species].growthRate;

/** Hours a run is given: `pacedDays` at growth rate 1, as the slowest species lives them. */
const horizon = (pacedDays: number): number => (pacedDays / Math.min(...roster.map(growthRate))) * HOURS_PER_DAY;

const slowerKin = (species: PlantSpecies): PlantSpecies[] =>
  roster.filter(
    (other) =>
      PLANT_SPECIES_DATA[other].growthForm === PLANT_SPECIES_DATA[species].growthForm && growthRate(other) < growthRate(species)
  );

/** Tune's: hobby estimates of offshoot cadence per growth form — days between offshoots a grown unit takes in a rich, bright tank. */
const OFFSHOOT_DAYS: Record<GrowthForm, readonly [number, number]> = {
  carpet: [1, 7],
  rosette: [4, 30],
  attached: [21, 90],
};

const alike = (values: readonly number[]): boolean => Math.max(...values) / Math.min(...values) < 1.1;

const p = (species: PlantSpecies): FloraParams => plantParams(species, plantsDefaults);

const sizeIn = (species: PlantSpecies, budget: FloraState): number => sizeOf({ species, budget });

const fedFreely = (species: PlantSpecies, size: number, hours: number, until: GrowthTerms['until']): Growth =>
  grow(p(species), stocked(tissueMass(species, size), p(species)), hours, {
    room: (budget) => growthTaper(sizeIn(species, budget)),
    offshoot: offshootStructure(species),
    until,
  });

const byRoster = <T>(read: (species: PlantSpecies) => T): Record<PlantSpecies, T> =>
  Object.fromEntries(roster.map((species) => [species, read(species)])) as Record<PlantSpecies, T>;

let toNinety: Record<PlantSpecies, { sizes: number[]; days: number }>;
let offshoots: Record<PlantSpecies, number[]>;
let inTheDark: Record<PlantSpecies, { upkeepShort: number; conditionFalls: number; death: number }>;

beforeAll(() => {
  toNinety = byRoster((species) => {
    const grown = fedFreely(species, MIN_PLANTABLE_SIZE, horizon(250), ({ states }) => sizeIn(species, states.at(-1)!) >= 90);
    const sizes = grown.states.map((budget) => sizeIn(species, budget));
    return { sizes, days: hoursUntil(sizes, (size) => size >= 90) / HOURS_PER_DAY };
  });
  offshoots = byRoster((species) => fedFreely(species, 100, horizon(100), ({ buds }) => buds.length === 3).buds);
  inTheDark = byRoster((species) => {
    const run = runFlora(floraTank({ plants: [plantRecord({ id: species, species, size: 50 })] }), horizon(60), DARK, {
      until: ({ state }) => !state.plants.some(({ id }) => id === species),
    });
    const plant = run.hours.map(({ state }) => state.plants.find(({ id }) => id === species));
    return {
      upkeepShort: hoursUntil(run.hours, ({ fluxes: [unit] }) => unit.shortfall > 0) / HOURS_PER_DAY,
      conditionFalls: hoursUntil(plant, (it) => it !== undefined && it.condition < 100) / HOURS_PER_DAY,
      death: hoursUntil(plant, (it) => it === undefined) / HOURS_PER_DAY,
    };
  });
});

const offshootDays = (species: PlantSpecies): number => {
  const buds = offshoots[species];
  expect(buds, `${species} buds three offshoots inside its horizon`).toHaveLength(3);
  return (buds[2] - buds[0]) / 2 / HOURS_PER_DAY;
};

describe('the roster on its energy budget', () => {
  it('grows from the smallest plantable unit to size 90 in days that, times its growth rate, every species shares', () => {
    expect(alike(roster.map((species) => toNinety[species].days * growthRate(species)))).toBe(true);
  });

  it('buds at a cadence that, times its growth rate over its form’s offshoot size, every species shares', () => {
    expect(alike(roster.map((species) => (offshootDays(species) * growthRate(species)) / growthFormOf(species).offshootSize))).toBe(
      true
    );
  });

  it('kept dark, runs its upkeep short in days that, times its growth rate, every species shares', () => {
    expect(alike(roster.map((species) => inTheDark[species].upkeepShort * growthRate(species)))).toBe(true);
  });
});

describe.each(roster)('%s on its energy budget', (species) => {
  it('grows from the smallest plantable unit toward full, fed freely, sooner than its slower kin', () => {
    const { sizes, days } = toNinety[species];
    expect(sizes.every((size, hour) => size <= 100 && (hour === 0 || size >= sizes[hour - 1]))).toBe(true);
    expect(days).toBeLessThan(Infinity);
    for (const other of slowerKin(species)) expect(days).toBeLessThan(toNinety[other].days);
  });

  it('buds an offshoot grown and fed freely inside its form’s range of days, sooner than its slower kin', () => {
    const [fastest, slowest] = OFFSHOOT_DAYS[PLANT_SPECIES_DATA[species].growthForm];
    expect(offshootDays(species)).toBeGreaterThanOrEqual(fastest);
    expect(offshootDays(species)).toBeLessThanOrEqual(slowest);
    for (const other of slowerKin(species)) expect(offshootDays(species)).toBeLessThan(offshootDays(other));
  });

  it('kept dark from a full reserve, holds its condition until its upkeep runs short and dies after, before its slower kin', () => {
    const { upkeepShort, conditionFalls, death } = inTheDark[species];
    expect(conditionFalls).toBeGreaterThanOrEqual(upkeepShort);
    expect(death).toBeGreaterThan(conditionFalls);
    expect(death).toBeLessThan(Infinity);
    for (const other of slowerKin(species)) expect(death).toBeLessThan(inTheDark[other].death);
  });
});
