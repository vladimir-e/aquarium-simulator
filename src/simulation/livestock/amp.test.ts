import { describe, it, expect } from 'vitest';
import { fromAmP, GENERALISED_ANIMAL, LIFESPAN_SURVIVAL, proxyEntry, type AmpEntry } from './amp.js';
import {
  hatchling,
  maxReserveDensity,
  maxStructuralLength,
  organics,
  stepDeb,
  structuralLength,
  type DebParams,
  type DebState,
} from '../systems/deb.js';
import { arrheniusFactor } from '../core/kinetics.js';

const HOURS_PER_DAY = 24;
const YEAR_DAYS = 365;

function feastFromHatching(p: DebParams, hours: number): DebState[] {
  const states: DebState[] = [];
  let state = hatchling(p);
  for (let t = 0; t < hours; t++) {
    state = stepDeb(state, p, { fromGut: 1, tau: 1, omega: 1 }).state;
    states.push(state);
  }
  return states;
}

const survival = (life: readonly DebState[]): number => Math.exp(-life.reduce((H, s) => H + s.hazard, 0));

const expectRelative = (actual: number, expected: number, tolerance = 1e-12): void => {
  expect(Math.abs(actual / expected - 1)).toBeLessThanOrEqual(tolerance);
};

const entries: { name: string; entry: AmpEntry }[] = [
  { name: 'the generalised animal', entry: GENERALISED_ANIMAL },
  { name: 'a 2 cm proxy', entry: proxyEntry(GENERALISED_ANIMAL, 2, YEAR_DAYS) },
  { name: 'a 25 cm proxy', entry: proxyEntry(GENERALISED_ANIMAL, 25, 6 * YEAR_DAYS) },
];

describe.each(entries)('fromAmP on $name', ({ entry }) => {
  const p = fromAmP(entry);
  const Li = (entry.kap * entry.p_Am) / entry.p_M;

  it('runs every rate at its source pace at 20 °C', () => {
    expect(arrheniusFactor(20, p.TA)).toBe(1);
  });

  it('puts L_m where the source units do: κ·{p_Am} / [p_M]', () => {
    expectRelative(maxStructuralLength(p), Li);
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
      const predicted = Li - (Li - entry.L_b) * Math.exp(-rB * day);
      expectRelative(structuralLength(life[HOURS_PER_DAY * day - 1]), predicted, 1e-3);
    }
  });

  it('lays an egg that pays for its hatchling', () => {
    expect(organics(hatchling(p), p) + p.EHb).toBeLessThanOrEqual(p.E0);
  });
});

describe('proxyEntry', () => {
  const lengths = [1, 2, 3.5, 7, 15, 30, 60];

  it('grows to δ_M times the adult length', () => {
    for (const length of lengths) {
      const p = fromAmP(proxyEntry(GENERALISED_ANIMAL, length));
      expectRelative(maxStructuralLength(p), GENERALISED_ANIMAL.del_M * length);
    }
  });

  it('keeps the base rates: proxies of two lengths differ only in what the zoom scales', () => {
    const small = proxyEntry(GENERALISED_ANIMAL, 3);
    const large = proxyEntry(GENERALISED_ANIMAL, 12);
    const differing = (Object.keys(small) as (keyof AmpEntry)[]).filter(
      (key) => JSON.stringify(small[key]) !== JSON.stringify(large[key])
    );
    expect(differing.sort()).toEqual(['E_0', 'E_Hb', 'E_Hp', 'L_b', 'p_Am']);
  });

  it('scales {p_Am} and birth length with z and the maturity thresholds with z³', () => {
    const one = proxyEntry(GENERALISED_ANIMAL, 4);
    const twice = proxyEntry(GENERALISED_ANIMAL, 8);
    expectRelative(twice.p_Am, 2 * one.p_Am);
    expectRelative(twice.L_b, 2 * one.L_b);
    expectRelative(twice.E_Hb, 8 * one.E_Hb);
    expectRelative(twice.E_Hp, 8 * one.E_Hp);
  });

  it('marks itself a proxy of its base', () => {
    expect(proxyEntry(GENERALISED_ANIMAL, 5).source).toEqual({ kind: 'proxy', of: GENERALISED_ANIMAL.entry });
  });

  it('lays an egg that pays for its hatchling at every length', () => {
    for (const length of lengths) {
      const p = fromAmP(proxyEntry(GENERALISED_ANIMAL, length));
      expect(organics(hatchling(p), p) + p.EHb).toBeLessThanOrEqual(p.E0);
    }
  });

  it('calibrates h_a so the lifespan is the median of a cohort hatched and fed without limit at 20 °C', () => {
    for (const [length, lifespanDays] of [
      [2, YEAR_DAYS],
      [25, 6 * YEAR_DAYS],
    ]) {
      const p = fromAmP(proxyEntry(GENERALISED_ANIMAL, length, lifespanDays));
      const alive = survival(feastFromHatching(p, HOURS_PER_DAY * lifespanDays));
      expect(Math.abs(alive - LIFESPAN_SURVIVAL)).toBeLessThan(1e-3);
    }
  });
});
