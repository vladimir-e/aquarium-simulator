import { describe, it, expect } from 'vitest';
import {
  debParams,
  FISH_SPECIES_DATA,
  grownLength,
  grownMass,
  incubation,
  lifespan,
  maturityAge,
  type FishSpecies,
  type SpeciesBudget,
} from './species.js';
import { entryFitsItsData, type LifeHistory } from './amp.js';
import { hatchling, maxStructuralLength, wetMass } from '../systems/deb.js';
import { arrheniusFactor } from '../core/kinetics.js';
import { HOURS_PER_DAY } from '../core/clock.js';
import {
  expectRelative,
  feastFromHatching,
  grown,
  meanDeathHour,
  medianDeathHour,
  pubertyHour,
} from '../tests/deb.js';
import { ampMeanLifespanDays, ampPubertyDays, incubate } from '../tests/amp.js';

const roster = Object.keys(FISH_SPECIES_DATA) as FishSpecies[];

type EntryBudget = Extract<SpeciesBudget, { kind: 'entry' }>;

const entryBudget = (species: FishSpecies): EntryBudget | undefined => {
  const { budget } = FISH_SPECIES_DATA[species];
  return budget.kind === 'entry' ? budget : undefined;
};

const entrySpecies = roster.filter((species) => entryBudget(species) !== undefined);

const keeperFigures = (budget: SpeciesBudget): Partial<LifeHistory> =>
  budget.kind === 'proxy' ? budget.figures : (budget.shape ?? {});

describe.each(roster)('%s on its energy budget', (species) => {
  const { budget, temperatureRange } = FISH_SPECIES_DATA[species];
  const p = debParams(species);

  it('runs on its entry where the entry fits its own data, on a proxy of it where it does not', () => {
    const entry = budget.kind === 'entry' ? budget.entry : budget.base;
    expect(entryFitsItsData(entry)).toBe(budget.kind === 'entry');
  });

  it('reads back every figure the keeper gave it', () => {
    const read: LifeHistory = {
      adultLengthCm: grownLength(species),
      adultMassGrams: grownMass(species),
      maturityAgeDays: maturityAge(species) / HOURS_PER_DAY,
      lifespanDays: lifespan(species) / HOURS_PER_DAY,
    };
    for (const [figure, value] of Object.entries(keeperFigures(budget))) {
      expectRelative(read[figure as keyof LifeHistory], value, 1e-4);
    }
  });

  it('grows to its grown size, breeds at its maturity age, dies around its lifespan, fed freely in mid-range water', () => {
    const [low, high] = temperatureRange;
    const life = feastFromHatching(p, 1.1 * lifespan(species), arrheniusFactor((low + high) / 2, p.TA));
    expectRelative(wetMass(grown(p), p), grownMass(species), 1e-12);
    expectRelative(maxStructuralLength(p) / p.delM, grownLength(species), 1e-12);
    expectRelative(pubertyHour(life, p), maturityAge(species), 0.02);
    expectRelative(medianDeathHour(life), lifespan(species), 0.02);
  });
});

describe.each(entrySpecies)('%s against its Add-my-Pet entry, fed freely at its typical temperature', (species) => {
  const { entry } = entryBudget(species)!;
  const p = debParams(species);
  const tau = arrheniusFactor(entry.typicalTemperatureC, p.TA);
  const amp = { puberty: ampPubertyDays(entry), death: ampMeanLifespanDays(entry) };
  const life = feastFromHatching(p, 2.5 * HOURS_PER_DAY * amp.death, tau);

  it('grows to the ultimate wet weight AmP implies', () => {
    expectRelative(wetMass(grown(p), p), entry.implied.Ww_i, 0.03);
  });

  it('hatches an egg laid on E_0 at L_b, weighing what AmP implies, after a_b', () => {
    const egg = incubate(entry.parameters);
    expectRelative(egg.days / tau, entry.implied.a_b, 0.03);
    expectRelative(incubation(species) / HOURS_PER_DAY / tau, entry.implied.a_b, 0.001);
    expectRelative(egg.L, p.Lb, 0.03);
    expectRelative(wetMass(hatchling(p), p), entry.implied.Ww_b, 0.03);
  });

  it('breeds at the age AmP’s get_tj gives', () => {
    expectRelative(pubertyHour(life, p) / HOURS_PER_DAY, amp.puberty, 0.03);
  });

  it('dies at the mean age wear and hazard give along its adult growth curve, counting the embryo’s days', () => {
    expectRelative(entry.implied.a_b + meanDeathHour(life) / HOURS_PER_DAY, amp.death, 0.03);
  });
});
