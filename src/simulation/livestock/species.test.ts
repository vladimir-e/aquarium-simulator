import { describe, it, expect } from 'vitest';
import {
  budgetParameters,
  debParams,
  FISH_SPECIES_DATA,
  grownLength,
  grownMass,
  lifespan,
  maturityAge,
  type FishSpecies,
  type SpeciesBudget,
} from './species.js';
import { entryFitsItsData, fromAmP, HOURS_PER_DAY } from './amp.js';
import { Betta_splendens } from './amp/entries/Betta_splendens.js';
import { hatchling, maxStructuralLength, wetMass } from '../systems/deb.js';
import { arrheniusFactor } from '../core/kinetics.js';
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

describe.each(roster)('%s on its energy budget', (species) => {
  const { budget, temperatureRange } = FISH_SPECIES_DATA[species];
  const p = debParams(species);

  it('runs on the parameters its budget names', () => {
    expect(p).toEqual(fromAmP(budgetParameters(budget)));
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

  it('fits its own data', () => {
    expect(entryFitsItsData(entry)).toBe(true);
  });

  it('grows to the ultimate wet weight AmP implies', () => {
    expectRelative(wetMass(grown(p), p), entry.implied.Ww_i, 0.03);
  });

  it('hatches an egg laid on E_0 at L_b, weighing what AmP implies, after a_b', () => {
    const egg = incubate(entry.parameters);
    expectRelative(egg.days / tau, entry.implied.a_b, 0.03);
    expectRelative(egg.L, p.Lb, 0.03);
    expectRelative(wetMass(hatchling(p), p), entry.implied.Ww_b, 0.03);
  });

  it('breeds at the age AmP’s get_tj gives', () => {
    expectRelative(pubertyHour(life, p) / HOURS_PER_DAY, amp.puberty, 0.03);
  });

  it('dies at the mean age AmP’s get_tm_mod gives, counting the embryo’s days', () => {
    expectRelative(entry.implied.a_b + meanDeathHour(life) / HOURS_PER_DAY, amp.death, 0.03);
  });
});

describe('the betta', () => {
  const { budget } = FISH_SPECIES_DATA.betta;

  it('runs on its entry’s rates sized by the keeper, the entry missing its own weight', () => {
    expect(entryFitsItsData(Betta_splendens)).toBe(false);
    expect(budget).toMatchObject({ kind: 'proxy', base: Betta_splendens.parameters });
  });

  it('grows to its hobby length and weight, breeds at its maturity age, dies around its lifespan', () => {
    if (budget.kind !== 'proxy') throw new Error('the betta is a proxy');
    const { figures } = budget;
    const p = debParams('betta');
    const life = feastFromHatching(
      p,
      1.1 * HOURS_PER_DAY * figures.lifespanDays,
      arrheniusFactor(figures.temperatureC, p.TA)
    );
    expectRelative(wetMass(grown(p), p), figures.adultMassGrams, 1e-9);
    expectRelative(maxStructuralLength(p) / p.delM, figures.adultLengthCm, 1e-9);
    expectRelative(pubertyHour(life, p), HOURS_PER_DAY * figures.maturityAgeDays, 0.02);
    expectRelative(medianDeathHour(life), HOURS_PER_DAY * figures.lifespanDays, 0.02);
  });
});
