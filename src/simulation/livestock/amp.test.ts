import { describe, it, expect } from 'vitest';
import { fromAmP, GENERALISED_ANIMAL, LIFESPAN_SURVIVAL, proxyEntry, type AmpEntry } from './amp.js';
import {
  hatchling,
  maxReserveDensity,
  maxStructuralLength,
  organics,
  stepDeb,
  structuralLength,
  wetMass,
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

function grown(p: DebParams): DebState {
  const structure = maxStructuralLength(p) ** 3;
  const reserve = maxReserveDensity(p) * structure;
  return { structure, reserve, maturity: p.EHp, broodBuffer: 0, wearLoad: 0, hazard: 0 };
}

const survival = (life: readonly DebState[]): number => Math.exp(-life.reduce((H, s) => H + s.hazard, 0));

const expectRelative = (actual: number, expected: number, tolerance = 1e-12): void => {
  expect(Math.abs(actual / expected - 1)).toBeLessThanOrEqual(tolerance);
};

const entries: { name: string; entry: AmpEntry }[] = [
  { name: 'the generalised animal', entry: GENERALISED_ANIMAL },
  { name: 'a 2 cm proxy', entry: proxyEntry(GENERALISED_ANIMAL, 2, 0.1, YEAR_DAYS) },
  { name: 'a 25 cm proxy', entry: proxyEntry(GENERALISED_ANIMAL, 25, 200, 6 * YEAR_DAYS) },
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
  const bodies = [
    [1, 0.012],
    [2, 0.1],
    [3.5, 0.5],
    [7, 4],
    [15, 15],
    [30, 300],
    [60, 2500],
  ];
  const proxies = bodies.map(([length, mass]) => ({
    length,
    mass,
    entry: proxyEntry(GENERALISED_ANIMAL, length, mass),
  }));

  it('grows to its adult length and weight', () => {
    for (const { length, mass, entry } of proxies) {
      const p = fromAmP(entry);
      expectRelative(maxStructuralLength(p) / entry.del_M, length);
      expectRelative(wetMass(grown(p), p), mass);
    }
  });

  it('reads a heavier fish of one length as a fuller shape', () => {
    const shapes = [1, 2, 4, 8].map((mass) => proxyEntry(GENERALISED_ANIMAL, 5, mass).del_M);
    expect(shapes.every((delM, i) => i === 0 || delM > shapes[i - 1])).toBe(true);
  });

  it('keeps the base rates: proxies of two bodies differ only in zoom and shape', () => {
    const small = proxyEntry(GENERALISED_ANIMAL, 3, 0.3);
    const large = proxyEntry(GENERALISED_ANIMAL, 12, 20);
    const differing = (Object.keys(small) as (keyof AmpEntry)[]).filter(
      (key) => JSON.stringify(small[key]) !== JSON.stringify(large[key])
    );
    expect(differing.sort()).toEqual(['E_0', 'E_Hb', 'E_Hp', 'L_b', 'del_M', 'p_Am']);
  });

  it('scales birth length with {p_Am} and the maturity thresholds with its cube', () => {
    for (const { entry } of proxies) {
      const zoom = entry.p_Am / GENERALISED_ANIMAL.p_Am;
      expectRelative(entry.L_b, zoom * GENERALISED_ANIMAL.L_b);
      expectRelative(entry.E_Hb, zoom ** 3 * GENERALISED_ANIMAL.E_Hb);
      expectRelative(entry.E_Hp, zoom ** 3 * GENERALISED_ANIMAL.E_Hp);
    }
  });

  it('marks itself a proxy of its base', () => {
    expect(proxyEntry(GENERALISED_ANIMAL, 5, 1).source).toEqual({ kind: 'proxy', of: GENERALISED_ANIMAL.entry });
  });

  it('lays an egg that pays for its hatchling at every size', () => {
    for (const { entry } of proxies) {
      const p = fromAmP(entry);
      expect(organics(hatchling(p), p) + p.EHb).toBeLessThanOrEqual(p.E0);
    }
  });

  it('calibrates h_a so the lifespan is the median of a cohort hatched and fed without limit at 20 °C', () => {
    for (const [length, mass, lifespanDays] of [
      [2, 0.1, YEAR_DAYS],
      [25, 200, 6 * YEAR_DAYS],
    ]) {
      const p = fromAmP(proxyEntry(GENERALISED_ANIMAL, length, mass, lifespanDays));
      const alive = survival(feastFromHatching(p, HOURS_PER_DAY * lifespanDays));
      expect(Math.abs(alive - LIFESPAN_SURVIVAL)).toBeLessThan(1e-3);
    }
  });
});
