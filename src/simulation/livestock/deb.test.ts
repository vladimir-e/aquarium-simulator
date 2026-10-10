import { describe, it, expect } from 'vitest';
import {
  arrhenius,
  eggsReady,
  hatchling,
  layEggs,
  maxReserveDensity,
  maxStructuralLength,
  NO_STRESS,
  organics,
  physicalLength,
  reserveDensity,
  stepDeb,
  structuralLength,
  structureOrganics,
  wetMass,
  type DebFluxes,
  type DebHour,
  type DebParams,
  type DebState,
  type DebStep,
  type DebStress,
} from './deb.js';

const GRAMS_PER_JOULE = 23.9 / 550_000;
const HOURS_PER_DAY = 24;

const animal: DebParams = {
  pAm: (22.5 * GRAMS_PER_JOULE) / HOURS_PER_DAY,
  v: 0.02 / HOURS_PER_DAY,
  kappa: 0.8,
  kappaX: 0.8,
  kappaR: 0.95,
  kappaG: 0.8,
  pM: (18 * GRAMS_PER_JOULE) / HOURS_PER_DAY,
  kJ: 0.002 / HOURS_PER_DAY,
  EG: 2800 * GRAMS_PER_JOULE,
  EHb: 0.07 * GRAMS_PER_JOULE,
  EHp: 33 * GRAMS_PER_JOULE,
  ha: 1e-6 / HOURS_PER_DAY ** 2,
  sG: 1e-4,
  TA: 8000,
  TRef: 293.15,
  delM: 0.25,
  dV: 0.1,
};
const Lb = 0.05;
const E0 = 1 * GRAMS_PER_JOULE;
const Lm = maxStructuralLength(animal);
const YEAR = 365 * HOURS_PER_DAY;

const FEAST = 1;
const atRest = (digested: number): DebHour => ({ digested, tau: 1, omega: 1 });

function fish(L: number, e: number, o: Partial<DebState> = {}): DebState {
  const V = L ** 3;
  return { V, E: e * maxReserveDensity(animal) * V, EH: animal.EHp, ER: 0, q: 0, h: 0, ...o };
}

function live(from: DebState, hours: number, hour: DebHour): DebStep[] {
  const steps: DebStep[] = [];
  let state = from;
  for (let t = 0; t < hours; t++) {
    const step = stepDeb(state, animal, hour);
    steps.push(step);
    state = step.state;
  }
  return steps;
}

const burnedOf = (step: DebStep): number => {
  const { maintenance, development, growth, starvation } = step.fluxes.burned;
  return maintenance + development + growth + starvation;
};

function ledgerGap(before: DebState, step: DebStep, digested: number): number {
  const { fluxes } = step;
  const stored = organics(step.state, animal) - organics(before, animal);
  return digested - fluxes.undigested - (stored + burnedOf(step) + fluxes.feces);
}

const expectNear = (actual: number, expected: number): void => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-9 * Math.max(Math.abs(expected), 1e-12));
};

const lifeOnFeast = live(hatchling(animal, Lb), 9 * YEAR, atRest(FEAST));
const stateAt = (hour: number): DebState => lifeOnFeast[hour - 1].state;

describe('the hour', () => {
  it('closes the ledger every hour, feasting, fasting, stressed or paced', () => {
    const fed = hatchling(animal, Lb);
    const regimes: { from: DebState; hour: DebHour }[] = [
      { from: fed, hour: atRest(FEAST) },
      { from: stateAt(3 * YEAR), hour: atRest(0) },
      {
        from: stateAt(YEAR),
        hour: {
          digested: 2e-5,
          tau: 1.7,
          omega: 0.6,
          stress: { assimilation: 0.7, maintenance: 1.4, growthCost: 1.3, eggCost: 1 },
        },
      },
    ];
    for (const { from, hour } of regimes) {
      let state = from;
      for (let t = 0; t < 2 * YEAR; t++) {
        const step = stepDeb(state, animal, hour);
        expect(Math.abs(ledgerGap(state, step, hour.digested))).toBeLessThan(1e-10);
        state = step.state;
      }
    }
  });

  it('assimilates κ_X of what it digests, up to {p_Am}·L²·τ·ω, and hands back the rest', () => {
    const s = fish(0.5, 0.6);
    const hour = { digested: 0, tau: 1.3, omega: 0.8 };
    const ceiling = animal.pAm * structuralLength(s) ** 2 * 1.3 * 0.8;

    const scarce = stepDeb(s, animal, { ...hour, digested: 1e-6 }).fluxes;
    expectNear(scarce.assimilated, animal.kappaX * 1e-6);
    expectNear(scarce.feces, (1 - animal.kappaX) * 1e-6);
    expect(scarce.undigested).toBe(0);

    const plenty = stepDeb(s, animal, { ...hour, digested: 1e-3 }).fluxes;
    expectNear(plenty.assimilated, ceiling);
    expectNear(plenty.undigested, 1e-3 - ceiling / animal.kappaX);
  });

  it('pays maintenance before growth', () => {
    for (const e of [0.1, 0.3, 0.6, 0.9, 1]) {
      const s = fish(0.6, e);
      const { fluxes } = stepDeb(s, animal, atRest(0));
      const soma = animal.kappa * fluxes.mobilised;
      const maintenance = animal.pM * s.V;

      expectNear(fluxes.burned.maintenance, Math.min(soma, maintenance));
      expectNear(fluxes.toStructure + fluxes.burned.growth, Math.max(0, soma - maintenance));
      expectNear(fluxes.shortfall, Math.max(0, maintenance - soma));
    }
  });

  it('burns the growth overhead: a cm³ of structure costs [E_G] and holds κ_G·[E_G]', () => {
    const s = fish(0.4, 1);
    for (const growthCost of [1, 2]) {
      const { state, fluxes } = stepDeb(s, animal, { ...atRest(FEAST), stress: { ...NO_STRESS, growthCost } });
      const invested = fluxes.toStructure + fluxes.burned.growth;
      expectNear(state.V - s.V, invested / (growthCost * animal.EG));
      expectNear(fluxes.toStructure, structureOrganics(animal) * (state.V - s.V));
    }
  });

  it('paces every rate by τ', () => {
    const s = fish(0.6, 0.8);
    const slow = stepDeb(s, animal, { digested: 0, tau: 1, omega: 0.5 }).fluxes;
    const fast = stepDeb(s, animal, { digested: 0, tau: 2, omega: 0.5 }).fluxes;
    expectNear(fast.mobilised, 2 * slow.mobilised);
    expectNear(fast.burned.maintenance, 2 * slow.burned.maintenance);
    expectNear(fast.burned.development, 2 * slow.burned.development);
  });

  it('throttles the supply by ω and leaves maintenance at τ', () => {
    const s = fish(0.6, 0.8);
    const full = stepDeb(s, animal, { digested: FEAST, tau: 1.5, omega: 1 }).fluxes;
    const thin = stepDeb(s, animal, { digested: FEAST, tau: 1.5, omega: 0.5 }).fluxes;
    expectNear(thin.assimilated, full.assimilated / 2);
    expectNear(thin.mobilised, full.mobilised / 2);
    for (const fluxes of [full, thin]) {
      expectNear(fluxes.burned.maintenance + fluxes.shortfall, animal.pM * s.V * 1.5);
      expectNear(fluxes.burned.development, animal.kJ * animal.EHp * 1.5);
    }
  });

  it('moves the flux each stress names', () => {
    const s = fish(0.6, 0.9);
    const hour = atRest(FEAST);
    const plain = stepDeb(s, animal, hour).fluxes;
    const stressed = (o: Partial<DebStress>): DebFluxes =>
      stepDeb(s, animal, { ...hour, stress: { ...NO_STRESS, ...o } }).fluxes;

    expectNear(stressed({ assimilation: 0.5 }).assimilated, plain.assimilated / 2);
    expect(stressed({ maintenance: 1.5 }).burned.maintenance).toBeGreaterThan(plain.burned.maintenance);
    expect(stressed({ growthCost: 1.5 }).toStructure).toBeLessThan(plain.toStructure);
  });
});

describe('a life on unlimited food', () => {
  it('fills its reserve to e = 1 and grows toward L_m, never past it', () => {
    const lean = live(fish(0.5, 0.3), 2 * YEAR, atRest(FEAST));
    expect(reserveDensity(lean[lean.length - 1].state, animal)).toBeCloseTo(1, 2);

    for (const { state } of lifeOnFeast) expect(structuralLength(state)).toBeLessThan(Lm);
    const last = lifeOnFeast[lifeOnFeast.length - 1];
    expect(structuralLength(last.state) / Lm).toBeGreaterThan(0.99);
    expect(last.fluxes.toStructure / structureOrganics(animal) / last.state.V).toBeLessThan(1e-6);
  });

  it('assimilates less and grows slower under assimilation stress, however much it eats', () => {
    const fry = hatchling(animal, Lb);
    const season = 90 * HOURS_PER_DAY;
    const plain = live(fry, season, atRest(FEAST));
    const stressed = live(fry, season, { ...atRest(FEAST), stress: { ...NO_STRESS, assimilation: 0.6 } });
    expectNear(stressed[0].fluxes.assimilated, 0.6 * plain[0].fluxes.assimilated);
    expect(stressed[season - 1].state.V).toBeLessThan(plain[season - 1].state.V);
  });

  it('stops growing at L_m on a full reserve: the soma share there pays maintenance exactly', () => {
    const { fluxes } = stepDeb(fish(Lm, 1), animal, atRest(0));
    expectNear(animal.kappa * fluxes.mobilised, animal.pM * Lm ** 3);
  });

  it('reaches puberty once, one way, and fills no buffer before it', () => {
    const puberty = lifeOnFeast.findIndex(({ state }) => state.EH >= animal.EHp);
    expect(puberty).toBeGreaterThan(0);
    for (const { state } of lifeOnFeast.slice(0, puberty)) {
      expect(state.EH).toBeLessThan(animal.EHp);
      expect(state.ER).toBe(0);
    }
    for (const { state } of lifeOnFeast.slice(puberty)) expect(state.EH).toBe(animal.EHp);
    expect(stateAt(2 * YEAR).ER).toBeGreaterThan(0);

    const fasting = live(stateAt(3 * YEAR), YEAR, atRest(0));
    for (const { state } of fasting) expect(state.EH).toBe(animal.EHp);
  });

  it('wears faster with age: the hazard rises year on year', () => {
    const yearly = Array.from({ length: 9 }, (_, i) => stateAt((i + 1) * YEAR).h);
    for (let i = 1; i < yearly.length; i++) expect(yearly[i]).toBeGreaterThan(yearly[i - 1]);
  });
});

describe('starvation', () => {
  it('draws the buffer first, then structure, and reports the shortfall', () => {
    const grown = stateAt(3 * YEAR);
    const spawned = layEggs(grown, animal, eggsReady(grown, animal, E0), E0).state;
    const fast = live(spawned, 3000, atRest(0));

    let before = spawned;
    for (const step of fast) {
      const { fluxes, state } = step;
      expectNear(fluxes.shortfall, Math.max(0, animal.pM * before.V - animal.kappa * fluxes.mobilised));
      if (fluxes.fromStructure > 0) expect(state.ER).toBe(0);
      before = state;
    }

    const bufferPays = fast.findIndex(({ fluxes }) => fluxes.shortfall > 0);
    const shrinks = fast.findIndex(({ fluxes }) => fluxes.fromStructure > 0);
    expect(bufferPays).toBeGreaterThanOrEqual(0);
    expect(fast[bufferPays].fluxes.fromStructure).toBe(0);
    expect(shrinks).toBeGreaterThan(bufferPays);
    expect(fast[fast.length - 1].state.V).toBeLessThan(spawned.V);
  });

  it('starves a fed fish on low oxygen alone', () => {
    const steady = fish(Lm, 1);
    expect(stepDeb(steady, animal, atRest(FEAST)).fluxes.shortfall).toBeLessThan(1e-12 * animal.pM * steady.V);
    for (const omega of [0.8, 0.5, 0.2]) {
      const { shortfall } = stepDeb(steady, animal, { digested: FEAST, tau: 1, omega }).fluxes;
      expectNear(shortfall, animal.pM * steady.V * (1 - omega));
    }

    const hypoxic = live(stateAt(9 * YEAR), 30 * HOURS_PER_DAY, { digested: FEAST, tau: 1, omega: 0.4 });
    for (const { fluxes } of hypoxic) expect(fluxes.shortfall).toBeGreaterThan(0);
  });
});

describe('temperature', () => {
  it('is 1 at T_ref and rises with T', () => {
    expect(arrhenius(animal.TRef, animal.TA, animal.TRef)).toBe(1);
    let previous = 0;
    for (let T = 273.15; T <= 313.15; T += 1) {
      const tau = arrhenius(T, animal.TA, animal.TRef);
      expect(tau).toBeGreaterThan(previous);
      previous = tau;
    }
  });
});

describe('brood', () => {
  it('readies ⌊κ_R·E_R / E_0⌋ eggs, fewer as egg cost rises', () => {
    const s = fish(0.8, 1, { ER: 7.5 * E0 });
    expect(eggsReady(s, animal, E0)).toBe(Math.floor((animal.kappaR * 7.5 * E0) / E0));
    expect(eggsReady(s, animal, E0, { ...NO_STRESS, eggCost: 2 })).toBe(
      Math.floor((animal.kappaR * 7.5 * E0) / (2 * E0))
    );
  });

  it('draws the eggs and their overhead from the buffer, the overhead burned', () => {
    const s = fish(0.8, 1, { ER: 7.5 * E0 });
    for (const stress of [NO_STRESS, { ...NO_STRESS, eggCost: 1.5 }]) {
      const eggs = eggsReady(s, animal, E0, stress);
      const brood = layEggs(s, animal, eggs, E0, stress);
      expectNear(brood.laid, eggs * E0);
      expectNear(s.ER - brood.state.ER, brood.laid + brood.overhead);
      expectNear(brood.overhead, (eggs * E0 * stress.eggCost) / animal.kappaR - eggs * E0);
      expect(brood.state.ER).toBeGreaterThanOrEqual(0);
    }
  });

  it('hatches at L_b on a full reserve with E_Hb', () => {
    const fry = hatchling(animal, Lb);
    expect(structuralLength(fry)).toBeCloseTo(Lb, 12);
    expect(reserveDensity(fry, animal)).toBeCloseTo(1, 12);
    expect(fry).toMatchObject({ EH: animal.EHb, ER: 0, q: 0, h: 0 });
  });
});

describe('readings', () => {
  it('weighs structure as water and reserve at its dry-to-wet ratio', () => {
    const s = fish(0.7, 0.6, { ER: 0.002 });
    expectNear(wetMass(s, animal), s.V + (s.E + s.ER) / animal.dV);
    expect(wetMass(fish(0.7, 1), animal)).toBeGreaterThan(wetMass(fish(0.7, 0.2), animal));
    expectNear(physicalLength(s, animal), structuralLength(s) / animal.delM);
  });

  it('stays finite at the zero state', () => {
    const zero: DebState = { V: 0, E: 0, EH: 0, ER: 0, q: 0, h: 0 };
    for (const digested of [0, FEAST]) {
      const { state, fluxes } = stepDeb(zero, animal, atRest(digested));
      const numbers = [...Object.values(state), ...Object.values(fluxes.burned), ...Object.values(fluxes)].filter(
        (x): x is number => typeof x === 'number'
      );
      for (const x of numbers) expect(Number.isFinite(x)).toBe(true);
    }
    expect(reserveDensity(zero, animal)).toBe(0);
    expect(wetMass(zero, animal)).toBe(0);
  });
});
