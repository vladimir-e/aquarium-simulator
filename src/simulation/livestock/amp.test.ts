import { describe, it, expect } from 'vitest';
import { fromAmP, GENERALISED_ANIMAL, HOURS_PER_DAY, proxyEntry, type AmpEntry, type HobbyFigures } from './amp.js';
import { maxReserveDensity, maxStructuralLength, structuralLength, wetMass, type DebParams } from '../systems/deb.js';
import { arrheniusFactor } from '../core/kinetics.js';
import { expectRelative, feastFromHatching, grown, medianDeathHour, pubertyHour } from '../tests/deb.js';

const YEAR_DAYS = 365;

const bodies: HobbyFigures[] = [
  {
    entry: 'a 1 cm proxy',
    adultLengthCm: 1,
    adultMassGrams: 0.012,
    maturityAgeDays: 45,
    lifespanDays: YEAR_DAYS,
    temperatureC: 26,
  },
  {
    entry: 'a 3.5 cm proxy',
    adultLengthCm: 3.5,
    adultMassGrams: 0.5,
    maturityAgeDays: 150,
    lifespanDays: 4 * YEAR_DAYS,
    temperatureC: 24,
  },
  {
    entry: 'a 15 cm proxy',
    adultLengthCm: 15,
    adultMassGrams: 30,
    maturityAgeDays: YEAR_DAYS,
    lifespanDays: 8 * YEAR_DAYS,
    temperatureC: 27,
  },
  {
    entry: 'a 40 cm proxy',
    adultLengthCm: 40,
    adultMassGrams: 900,
    maturityAgeDays: 3 * YEAR_DAYS,
    lifespanDays: 15 * YEAR_DAYS,
    temperatureC: 18,
  },
];

const proxies = bodies.map((body) => ({ body, entry: proxyEntry(GENERALISED_ANIMAL, body) }));

type Scalable = Omit<DebParams, 'TA' | 'dV'>;

const inSourceUnits = (e: AmpEntry): Scalable => ({
  pAm: e.p_Am,
  v: e.v,
  kappa: e.kap,
  kappaX: e.kap_X,
  kappaR: e.kap_R,
  kappaG: (e.mu_V * e.d_V) / (e.w_V * e.E_G),
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
    kappaR: p.kappaR,
    kappaG: p.kappaG,
    delM: p.delM,
  };
}

function hatch(e: AmpEntry): { L: number; e: number } {
  const dt = (3 * e.L_b) / e.v / 1e5;
  let [L, E, EH] = [1e-6 * e.L_b, e.E_0, 0];
  while (EH < e.E_Hb) {
    const V = L ** 3;
    const density = E / V;
    const mobilised = (density * (e.E_G * e.v * L * L + e.p_M * V)) / (e.E_G + e.kap * density);
    [L, E, EH] = [
      L + ((e.kap * mobilised - e.p_M * V) / (3 * e.E_G * L * L)) * dt,
      E - mobilised * dt,
      EH + ((1 - e.kap) * mobilised - e.k_J * EH) * dt,
    ];
  }
  return { L, e: E / ((e.p_Am / e.v) * L ** 3) };
}

it('runs every rate at its source pace at 20 °C', () => {
  expect(arrheniusFactor(20, GENERALISED_ANIMAL.T_A)).toBe(1);
});

describe.each([{ entry: GENERALISED_ANIMAL }, ...proxies])('fromAmP on $entry.entry', ({ entry }) => {
  const p = fromAmP(entry);
  const Lm = (entry.kap * entry.p_Am) / entry.p_M;

  it('leaves every dimensionless group unchanged', () => {
    const before = dimensionless(inSourceUnits(entry));
    const after = dimensionless(p);
    for (const [group, value] of Object.entries(before)) expectRelative(after[group], value);
  });

  it('puts L_m where the source units do: κ·{p_Am} / [p_M]', () => {
    expectRelative(maxStructuralLength(p), Lm);
  });

  it('keeps [E_m] = {p_Am} / v once joules become grams', () => {
    expectRelative(maxReserveDensity(p), ((entry.p_Am / entry.v) * entry.w_E) / entry.mu_E);
  });

  it('round-trips its ultimate structural length along the von Bertalanffy curve of its source units', () => {
    const g = (entry.E_G * entry.v) / (entry.kap * entry.p_Am);
    const rB = ((entry.p_M / entry.E_G) * g) / (3 * (1 + g));
    const days = [1, 3, 6].map((n) => Math.round(n / rB));
    const life = feastFromHatching(p, HOURS_PER_DAY * Math.max(...days));
    for (const day of days) {
      const predicted = Lm - (Lm - entry.L_b) * Math.exp(-rB * day);
      expectRelative(structuralLength(life[HOURS_PER_DAY * day - 1]), predicted, 1e-3);
    }
  });

  it('lays an egg whose embryo reaches L_b on a full reserve', () => {
    const born = hatch(entry);
    expectRelative(born.L, entry.L_b, 1e-4);
    expectRelative(born.e, 1, 1e-4);
  });
});

describe('proxyEntry', () => {
  it('grows to its adult length and weight', () => {
    for (const { body, entry } of proxies) {
      const p = fromAmP(entry);
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
    const differing = (Object.keys(early) as (keyof AmpEntry)[]).filter(
      (key) => JSON.stringify(early[key]) !== JSON.stringify(late[key])
    );
    expect(differing.sort()).toEqual(['h_a', 'k_J', 'p_Am', 'p_M', 'v']);
    for (const rate of ['p_Am', 'v', 'p_M', 'k_J'] as const) expectRelative(late[rate] / early[rate], 1 / 2);
  });

  it('breeds at its maturity age and dies around its lifespan, fed freely at its own temperature', () => {
    for (const { body, entry } of proxies) {
      const p = fromAmP(entry);
      const lifespan = HOURS_PER_DAY * body.lifespanDays;
      const life = feastFromHatching(p, 1.1 * lifespan, arrheniusFactor(body.temperatureC, p.TA));
      expectRelative(pubertyHour(life, p), HOURS_PER_DAY * body.maturityAgeDays, 0.02);
      expectRelative(medianDeathHour(life), lifespan, 0.02);
    }
  });

  it('names itself and marks itself a proxy of its base', () => {
    const { body, entry } = proxies[0];
    expect(entry.entry).toBe(body.entry);
    expect(entry.source).toEqual({ kind: 'proxy', of: GENERALISED_ANIMAL.entry });
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
