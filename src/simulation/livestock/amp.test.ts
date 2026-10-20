import { describe, it, expect } from 'vitest';
import {
  entryFitsItsData,
  FIT_FACTOR,
  fromAmP,
  GENERALISED_ANIMAL,
  impliedFigures,
  proxyEntry,
  readEntry,
  readShaped,
  type AmpEntry,
  type AmpParameters,
  type AmpReading,
  type HobbyFigures,
  type LifeHistory,
} from './amp.js';
import { Betta_splendens } from './amp/entries/Betta_splendens.js';
import { Corydoras_aeneus } from './amp/entries/Corydoras_aeneus.js';
import { Paracheirodon_innesi } from './amp/entries/Paracheirodon_innesi.js';
import { Poecilia_reticulata } from './amp/entries/Poecilia_reticulata.js';
import { Pterophyllum_scalare } from './amp/entries/Pterophyllum_scalare.js';
import {
  hatchling,
  maxStructuralLength,
  structuralLength,
  wetMass,
  type DebParams,
} from '../systems/deb.js';
import { maxReserveDensity } from '../systems/reserve.js';
import { arrheniusFactor } from '../core/kinetics.js';
import { HOURS_PER_DAY } from '../core/clock.js';
import { expectRelative, feastFromHatching, grown, medianDeathHour, pubertyHour } from '../tests/deb.js';
import { ampFullGrownLifespanDays, ampPubertyDays, incubate } from '../tests/amp.js';

const YEAR_DAYS = 365;

const ENTRIES: AmpEntry[] = [
  Poecilia_reticulata,
  Paracheirodon_innesi,
  Pterophyllum_scalare,
  Corydoras_aeneus,
  Betta_splendens,
];

const bodies: HobbyFigures[] = [
  { adultLengthCm: 1, adultMassGrams: 0.012, maturityAgeDays: 45, lifespanDays: YEAR_DAYS, temperatureC: 26 },
  { adultLengthCm: 3.5, adultMassGrams: 0.5, maturityAgeDays: 150, lifespanDays: 4 * YEAR_DAYS, temperatureC: 24 },
  { adultLengthCm: 15, adultMassGrams: 30, maturityAgeDays: YEAR_DAYS, lifespanDays: 8 * YEAR_DAYS, temperatureC: 27 },
  {
    adultLengthCm: 40,
    adultMassGrams: 900,
    maturityAgeDays: 3 * YEAR_DAYS,
    lifespanDays: 15 * YEAR_DAYS,
    temperatureC: 18,
  },
];

const proxies = bodies.map((body) => ({
  name: `a ${body.adultLengthCm} cm proxy`,
  body,
  parameters: proxyEntry(GENERALISED_ANIMAL, body),
}));

const budgets: { name: string; parameters: AmpParameters }[] = [
  { name: 'the generalised animal', parameters: GENERALISED_ANIMAL },
  ...proxies,
  ...ENTRIES.map(({ entry, parameters }) => ({ name: entry, parameters })),
];

const engine = (parameters: AmpParameters): DebParams => fromAmP(readEntry(parameters));

const figures = (parameters: AmpParameters, temperatureC: number): LifeHistory =>
  impliedFigures(readEntry(parameters), temperatureC);

type Scalable = Omit<DebParams, 'TA' | 'dV' | 'kappaG'>;

const inSourceUnits = (e: AmpReading): Scalable => ({
  pAm: e.p_Am,
  v: e.v,
  kappa: e.kap,
  kappaX: e.kap_X,
  kappaP: e.kap_P,
  kappaR: e.kap_R,
  pM: e.p_M,
  kJ: e.k_J,
  EG: e.E_G,
  EHb: e.E_Hb,
  EHp: e.E_Hp,
  ha: e.h_a,
  sG: e.s_G,
  E0: e.E_0,
  Lb: e.L_b,
  delM: e.del_M,
});

function dimensionless(p: Scalable): Record<string, number> {
  const Em = p.pAm / p.v;
  const Lm = (p.kappa * p.pAm) / p.pM;
  const kM = p.pM / p.EG;
  const g = p.EG / (p.kappa * Em);
  const scaledMaturity = (EH: number): number => EH / ((1 - p.kappa) * g * Em * Lm ** 3);
  return {
    g,
    k: p.kJ / kM,
    lb: p.Lb / Lm,
    uE0: p.E0 / (Em * Lm ** 3),
    vHb: scaledMaturity(p.EHb),
    vHp: scaledMaturity(p.EHp),
    hA: p.ha / kM ** 2,
    sG: p.sG,
    kappa: p.kappa,
    kappaX: p.kappaX,
    kappaP: p.kappaP,
    kappaR: p.kappaR,
    delM: p.delM,
  };
}

const numbers = (p: AmpParameters): [string, number][] =>
  Object.entries(p).filter((field): field is [string, number] => typeof field[1] === 'number');

describe.each(budgets)('fromAmP on $name', ({ parameters }) => {
  const reading = readEntry(parameters);
  const p = fromAmP(reading);
  const Lm = (reading.kap * reading.p_Am) / reading.p_M;

  it('leaves every dimensionless group of its reading unchanged', () => {
    const before = dimensionless(inSourceUnits(reading));
    const after = dimensionless(p);
    for (const [group, value] of Object.entries(before)) expectRelative(after[group], value);
  });

  it('puts L_m where the source units do: κ·{p_Am} / [p_M]', () => {
    expectRelative(maxStructuralLength(p), Lm);
  });

  it('keeps [E_m] = {p_Am} / v once joules become grams', () => {
    expectRelative(maxReserveDensity(p), ((reading.p_Am / reading.v) * reading.w_E) / reading.mu_E);
  });

  it('round-trips its ultimate structural length along the von Bertalanffy curve of its source units', () => {
    const g = (reading.E_G * reading.v) / (reading.kap * reading.p_Am);
    const rB = ((reading.p_M / reading.E_G) * g) / (3 * (1 + g));
    const days = [1, 3, 6].map((n) => Math.round(n / rB));
    const life = feastFromHatching(p, HOURS_PER_DAY * Math.max(...days));
    for (const day of days) {
      const predicted = Lm - (Lm - reading.L_b) * Math.exp(-rB * day);
      expectRelative(structuralLength(life[HOURS_PER_DAY * day - 1]), predicted, 1e-3);
    }
  });

  it('lays an egg whose embryo reaches L_b on a full reserve', () => {
    const born = incubate(parameters);
    expectRelative(born.L, reading.L_b, 1e-4);
    expectRelative(born.e, 1, 1e-3);
  });
});

describe('readEntry', () => {
  const accelerating = ENTRIES.filter(({ parameters }) => parameters.model === 'abj');

  it('solves an abj entry’s s_M as AmP implies it', () => {
    expect(accelerating.length).toBeGreaterThan(0);
    for (const { parameters, implied } of accelerating) expectRelative(readEntry(parameters).s_M, implied.s_M!, 1e-4);
  });

  it('reads {p_Am} and v at s_M times their values at birth, every other rate as stated', () => {
    for (const { parameters } of ENTRIES) {
      const { s_M, p_Am, v, p_M, k_J, E_G, kap } = readEntry(parameters);
      if (parameters.model === 'std') expect(s_M).toBe(1);
      else expect(s_M).toBeGreaterThan(1);
      expectRelative(p_Am, s_M * parameters.p_Am);
      expectRelative(v, s_M * parameters.v);
      expect([p_M, k_J, E_G, kap]).toEqual([parameters.p_M, parameters.k_J, parameters.E_G, parameters.kap]);
    }
  });

  it('hatches every entry at the weight AmP implies', () => {
    for (const { parameters, implied } of ENTRIES) {
      const p = engine(parameters);
      expectRelative(wetMass(hatchling(p), p), implied.Ww_b, 1e-3);
    }
  });

  it('refuses a heating cost, a reserve weighed apart from structure, and a birth beyond L_m', () => {
    const { parameters } = Poecilia_reticulata;
    expect(() => readEntry({ ...parameters, p_T: 1 })).toThrow(RangeError);
    expect(() => readEntry({ ...parameters, d_E: 0.3 })).toThrow(RangeError);
    expect(() => readEntry({ ...parameters, E_Hb: 1000 * parameters.E_Hb })).toThrow(/E_Hb/);
  });
});

describe('readShaped', () => {
  const angelfish = Pterophyllum_scalare;

  it('sets δ_M from a keeper’s adult length where the entry was fitted without length data, moving nothing else', () => {
    const entry = readEntry(angelfish.parameters);
    const shaped = readShaped(angelfish, { adultLengthCm: 15 });
    expect({ ...shaped, del_M: entry.del_M }).toEqual(entry);
    expectRelative(impliedFigures(shaped, angelfish.typicalTemperatureC).adultLengthCm, 15);
  });

  it('refuses an entry fitted to an observed length, ultimate or at puberty', () => {
    const lengths = ENTRIES.filter(({ zeroVariate: { Li, Lp } }) => Li !== undefined || Lp !== undefined);
    expect(lengths.length).toBeGreaterThan(0);
    for (const entry of lengths) expect(() => readShaped(entry, { adultLengthCm: 5 })).toThrow(RangeError);
    const { Wwi } = angelfish.zeroVariate;
    const fittedToPuberty: AmpEntry = { ...angelfish, zeroVariate: { ...angelfish.zeroVariate, Lp: Wwi } };
    expect(() => readShaped(fittedToPuberty, { adultLengthCm: 15 })).toThrow(/Lp/);
  });

  it('refuses a length that makes δ_M 1 or more', () => {
    expect(() => readShaped(angelfish, { adultLengthCm: 1 })).toThrow(RangeError);
  });
});

describe('entryFitsItsData', () => {
  it('trusts the entries whose ultimate weight and length sit within FIT_FACTOR of their data', () => {
    expect(ENTRIES.filter(entryFitsItsData).map(({ entry }) => entry)).toEqual([
      'Poecilia_reticulata',
      'Paracheirodon_innesi',
      'Pterophyllum_scalare',
      'Corydoras_aeneus',
    ]);
  });

  it('judges weight always and length only where it was observed', () => {
    const entry = Poecilia_reticulata;
    const { Wwi, Li } = entry.zeroVariate;
    const withData = (data: AmpEntry['zeroVariate']): boolean => entryFitsItsData({ ...entry, zeroVariate: data });
    const beyond = 1.05 * FIT_FACTOR;
    expect(withData({ Wwi })).toBe(true);
    expect(withData({ Li })).toBe(false);
    expect(withData({ Wwi, Li: { ...Li!, predicted: beyond * Li!.observed } })).toBe(false);
    expect(withData({ Wwi: { ...Wwi!, predicted: Wwi!.observed / beyond }, Li })).toBe(false);
  });
});

describe('AmP’s own formulas against its pages', () => {
  it.each(ENTRIES)('get_tm_s gives the life span $entry predicts', (entry) => {
    expectRelative(ampFullGrownLifespanDays(entry), entry.zeroVariate.am!.predicted, 2e-3);
  });

  it.each([Poecilia_reticulata, Pterophyllum_scalare, Corydoras_aeneus])(
    'get_tj gives the puberty $entry implies',
    (entry) => {
      expectRelative(ampPubertyDays(entry), entry.implied.a_p - entry.implied.a_b, 2e-3);
    }
  );
});

describe('impliedFigures', () => {
  it('reads an entry grown to the weight AmP implies', () => {
    for (const { parameters, implied, typicalTemperatureC } of ENTRIES) {
      expectRelative(figures(parameters, typicalTemperatureC).adultMassGrams, implied.Ww_i, 1e-4);
    }
  });

  it('reads a proxy back to the figures it was built on', () => {
    for (const { body, parameters } of proxies) {
      const read = figures(parameters, body.temperatureC);
      expectRelative(read.adultLengthCm, body.adultLengthCm, 1e-12);
      expectRelative(read.adultMassGrams, body.adultMassGrams, 1e-12);
      expectRelative(read.maturityAgeDays, body.maturityAgeDays, 1e-4);
      expectRelative(read.lifespanDays, body.lifespanDays, 1e-4);
    }
  });

  it('runs its ages slower in colder water by the Arrhenius factor alone', () => {
    const warm = figures(GENERALISED_ANIMAL, 28);
    const cold = figures(GENERALISED_ANIMAL, 18);
    const ratio = arrheniusFactor(28, GENERALISED_ANIMAL.T_A) / arrheniusFactor(18, GENERALISED_ANIMAL.T_A);
    expectRelative(cold.maturityAgeDays / warm.maturityAgeDays, ratio);
    expectRelative(cold.lifespanDays / warm.lifespanDays, ratio);
    expect(cold.adultMassGrams).toBe(warm.adultMassGrams);
  });
});

describe('proxyEntry', () => {
  it('grows to its adult length and weight', () => {
    for (const { body, parameters } of proxies) {
      const p = engine(parameters);
      expectRelative(maxStructuralLength(p) / p.delM, body.adultLengthCm);
      expectRelative(wetMass(grown(p), p), body.adultMassGrams);
    }
  });

  it('reads a heavier fish of one length as a fuller shape', () => {
    const shapes = [1, 2, 4, 8].map(
      (adultMassGrams) => proxyEntry(GENERALISED_ANIMAL, { ...bodies[1], adultLengthCm: 5, adultMassGrams }).del_M
    );
    expect(shapes.every((delM, i) => i === 0 || delM > shapes[i - 1])).toBe(true);
  });

  it('paces by one factor on {p_Am}, v, [p_M] and k_J, leaving every size intact', () => {
    const body = bodies[1];
    const early = proxyEntry(GENERALISED_ANIMAL, body);
    const late = proxyEntry(GENERALISED_ANIMAL, { ...body, maturityAgeDays: 2 * body.maturityAgeDays });
    const differing = (Object.keys(early) as (keyof AmpParameters)[]).filter(
      (key) => JSON.stringify(early[key]) !== JSON.stringify(late[key])
    );
    expect(differing.sort()).toEqual(['h_a', 'k_J', 'p_Am', 'p_M', 'v']);
    for (const rate of ['p_Am', 'v', 'p_M', 'k_J'] as const) expectRelative(late[rate] / early[rate], 1 / 2);
  });

  it('breeds at its maturity age and dies around its lifespan, fed freely at its own temperature', () => {
    for (const { body, parameters } of proxies) {
      const p = engine(parameters);
      const lifespan = HOURS_PER_DAY * body.lifespanDays;
      const life = feastFromHatching(p, 1.1 * lifespan, arrheniusFactor(body.temperatureC, p.TA));
      expectRelative(pubertyHour(life, p), HOURS_PER_DAY * body.maturityAgeDays, 0.02);
      expectRelative(medianDeathHour(life), lifespan, 0.02);
    }
  });

  it.each(ENTRIES)('rebuilds $entry from the figures it implies, its E_0 derived as AmP derives it', (entry) => {
    const temperatureC = entry.typicalTemperatureC;
    const rebuilt = proxyEntry(entry.parameters, { ...figures(entry.parameters, temperatureC), temperatureC });
    expect(rebuilt.model).toBe(entry.parameters.model);
    for (const [field, value] of numbers(entry.parameters)) {
      const got = rebuilt[field as keyof AmpParameters] as number;
      if (value === 0) expect(got).toBe(0);
      else expectRelative(got, value, 1e-4);
    }
  });

  it('grows a proxy of an abj base to its adult size, its s_M moved by the zoom and not by the pace', () => {
    for (const body of bodies) {
      const proxy = proxyEntry(Betta_splendens.parameters, body);
      const p = engine(proxy);
      expectRelative(maxStructuralLength(p) / p.delM, body.adultLengthCm, 1e-9);
      expectRelative(wetMass(grown(p), p), body.adultMassGrams, 1e-9);
      const slower = proxyEntry(Betta_splendens.parameters, { ...body, maturityAgeDays: 2 * body.maturityAgeDays });
      expectRelative(readEntry(slower).s_M, readEntry(proxy).s_M, 1e-9);
    }
  });

  it('refuses a figure not finite and positive, a body too heavy for its length, a base that never matures', () => {
    const body = bodies[1];
    const figures = ['adultLengthCm', 'adultMassGrams', 'maturityAgeDays', 'lifespanDays', 'temperatureC'] as const;
    for (const figure of figures) {
      for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => proxyEntry(GENERALISED_ANIMAL, { ...body, [figure]: value })).toThrow(RangeError);
      }
    }
    expect(() => proxyEntry(GENERALISED_ANIMAL, { ...body, adultLengthCm: 1, adultMassGrams: 50 })).toThrow(RangeError);
    expect(() => proxyEntry({ ...GENERALISED_ANIMAL, E_Hp: 1e6 }, body)).toThrow(RangeError);
  });
});
