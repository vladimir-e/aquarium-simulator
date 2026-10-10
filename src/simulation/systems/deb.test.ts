import { describe, it, expect } from 'vitest';
import {
  assimilationCeiling,
  drawBroodBuffer,
  eggsReady,
  hatchling,
  layEggs,
  mature,
  maxReserveDensity,
  maxStructuralLength,
  NO_STRESS,
  organics,
  reserveDensity,
  size,
  stepDeb,
  structuralLength,
  structureOrganics,
  totalBurned,
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
  delM: 0.25,
  dV: 0.1,
  E0: 1 * GRAMS_PER_JOULE,
  Lb: 0.05,
};
const { E0 } = animal;
const Lm = maxStructuralLength(animal);
const YEAR = 365 * HOURS_PER_DAY;

const FEAST = 1;
const atRest = (digested: number): DebHour => ({ digested, tau: 1, omega: 1 });

function fish(L: number, e: number, o: Partial<DebState> = {}): DebState {
  const structure = L ** 3;
  return {
    structure,
    reserve: e * maxReserveDensity(animal) * structure,
    maturity: animal.EHp,
    broodBuffer: 0,
    wearLoad: 0,
    hazard: 0,
    ...o,
  };
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

const last = <T,>(xs: readonly T[]): T => xs[xs.length - 1];
const most = (xs: readonly number[]): number => xs.reduce((a, b) => Math.max(a, b), -Infinity);

const expectNear = (actual: number, expected: number): void => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-9 * Math.max(Math.abs(expected), 1e-12));
};

const lifeOnFeast = live(hatchling(animal), 9 * YEAR, atRest(FEAST));
const stateAt = (hour: number): DebState => lifeOnFeast[hour - 1].state;

const regimes: { name: string; from: DebState; hour: DebHour }[] = [
  { name: 'feasting', from: hatchling(animal), hour: atRest(FEAST) },
  { name: 'fasting', from: stateAt(3 * YEAR), hour: atRest(0) },
  {
    name: 'stressed, paced and healing',
    from: stateAt(YEAR),
    hour: {
      digested: 2e-5,
      tau: 1.7,
      omega: 0.6,
      stress: { assimilation: 0.7, maintenance: 1.4, growthCost: 1.3, eggCost: 1 },
      healing: 1e-7,
    },
  },
  { name: 'fed without oxygen', from: stateAt(YEAR), hour: { digested: FEAST, tau: 1, omega: 0 } },
  { name: 'an adult on an empty buffer at low e', from: fish(0.8 * Lm, 0.05), hour: atRest(2e-6) },
];

describe.each(regimes.map((regime) => ({ ...regime, steps: live(regime.from, 2 * YEAR, regime.hour) })))(
  'two years $name',
  ({ from, hour, steps }) => {
    const hours = steps.map((step, t) => ({ before: t === 0 ? from : steps[t - 1].state, ...step }));

    it('closes the ledger every hour', () => {
      const gaps = hours.map(({ before, state, fluxes }) => {
        const stored = organics(state, animal) - organics(before, animal);
        return hour.digested - fluxes.returned - (stored + totalBurned(fluxes) + fluxes.feces);
      });
      expect(most(gaps.map(Math.abs))).toBeLessThan(1e-12);
    });

    it('keeps every stock non-negative and finite', () => {
      const sound = (stock: number): boolean => Number.isFinite(stock) && stock >= 0;
      expect(hours.findIndex(({ state }) => !Object.values(state).every(sound))).toBe(-1);
    });

    it('never grows while it runs short', () => {
      expect(hours.findIndex(({ fluxes }) => fluxes.toStructure > 0 && fluxes.shortfall > 0)).toBe(-1);
    });
  }
);

describe('the hour', () => {
  it('reads its assimilation ceiling off its surface, paced by τ·ω and cut by assimilation stress', () => {
    const ceiling = (L: number, hour: Pick<DebHour, 'tau' | 'omega' | 'stress'>): number =>
      assimilationCeiling(fish(L, 1), animal, hour);
    const base = { tau: 1, omega: 1 };
    expectNear(ceiling(0.8, base), 4 * ceiling(0.4, base));
    expectNear(ceiling(0.4, { tau: 1.5, omega: 1 }), 1.5 * ceiling(0.4, base));
    expectNear(ceiling(0.4, { tau: 1, omega: 0.3 }), 0.3 * ceiling(0.4, base));
    expectNear(ceiling(0.4, { ...base, stress: { ...NO_STRESS, assimilation: 0.5 } }), 0.5 * ceiling(0.4, base));
  });

  it('assimilates κ_X of what it digests, up to its ceiling, and hands back the rest', () => {
    const s = fish(0.5, 0.6);
    const hour = { tau: 1.3, omega: 0.8 };
    const ceiling = assimilationCeiling(s, animal, hour);

    const scarce = stepDeb(s, animal, { ...hour, digested: ceiling }).fluxes;
    expectNear(scarce.assimilated, animal.kappaX * ceiling);
    expectNear(scarce.feces, (1 - animal.kappaX) * ceiling);
    expect(scarce.returned).toBe(0);

    const plenty = stepDeb(s, animal, { ...hour, digested: 100 * ceiling }).fluxes;
    expectNear(plenty.assimilated, ceiling);
    expectNear(plenty.returned, 100 * ceiling - ceiling / animal.kappaX);
  });

  it('never mobilises more reserve than it holds', () => {
    const speck = fish(1e-4, 1);
    for (const tau of [1, 5, 20]) {
      const { state, fluxes } = stepDeb(speck, animal, { digested: 0, tau, omega: 1 });
      expect(fluxes.mobilised).toBeLessThanOrEqual(speck.reserve);
      expect(state.reserve).toBeGreaterThanOrEqual(0);
    }
  });

  it('burns the growth overhead: a cm³ of structure costs [E_G] and holds κ_G·[E_G]', () => {
    const s = fish(0.4, 1);
    for (const growthCost of [1, 2]) {
      const { state, fluxes } = stepDeb(s, animal, { ...atRest(FEAST), stress: { ...NO_STRESS, growthCost } });
      const invested = fluxes.toStructure + fluxes.burned.growth;
      expectNear(state.structure - s.structure, invested / (growthCost * animal.EG));
      expectNear(fluxes.toStructure, structureOrganics(animal) * (state.structure - s.structure));
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
      expectNear(fluxes.burned.maintenance + fluxes.shortfall, animal.pM * s.structure * 1.5);
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

  it('burns nothing negative anywhere in the stress domain, so no stress mints mass', () => {
    const s = fish(0.6, 0.9, { broodBuffer: 20 * E0 });
    for (const assimilation of [0, 1])
      for (const maintenance of [1, 3])
        for (const growthCost of [1, 3])
          for (const eggCost of [1, 3]) {
            const hour = { ...atRest(FEAST), stress: { assimilation, maintenance, growthCost, eggCost } };
            const { fluxes } = stepDeb(s, animal, hour);
            for (const burned of Object.values(fluxes.burned)) expect(burned).toBeGreaterThanOrEqual(0);
            expect(layEggs(s, animal, hour, eggsReady(s, animal, hour)).overhead).toBeGreaterThanOrEqual(0);
          }
  });

  it('pays healing from reserve, never more than the reserve holds', () => {
    const s = fish(0.6, 0.5);
    const plain = stepDeb(s, animal, atRest(0));
    const healed = stepDeb(s, animal, { ...atRest(0), healing: 1e-6 });
    expectNear(healed.fluxes.burned.healing, 1e-6);
    expectNear(plain.state.reserve - healed.state.reserve, 1e-6);

    const greedy = stepDeb(s, animal, { ...atRest(0), healing: 1 });
    expectNear(greedy.fluxes.burned.healing, plain.state.reserve);
    expect(greedy.state.reserve).toBe(0);
  });
});

describe('maintenance priority', () => {
  it('starving, draws the buffer first, then structure', () => {
    const grown = stateAt(3 * YEAR);
    const spawned = layEggs(grown, animal, {}, eggsReady(grown, animal, {})).state;
    const fast = live(spawned, 3000, atRest(0));

    expect(fast.findIndex(({ fluxes, state }) => fluxes.fromStructure > 0 && state.broodBuffer > 0)).toBe(-1);

    const bufferPays = fast.findIndex(({ fluxes }) => fluxes.shortfall > 0);
    const shrinks = fast.findIndex(({ fluxes }) => fluxes.fromStructure > 0);
    expect(bufferPays).toBeGreaterThanOrEqual(0);
    expect(fast[bufferPays].fluxes.fromStructure).toBe(0);
    expect(shrinks).toBeGreaterThan(bufferPays);
    expect(last(fast).state.structure).toBeLessThan(spawned.structure);
  });

  it('counts unpaid maturity maintenance in the shortfall', () => {
    const { fluxes } = stepDeb(fish(0.8 * Lm, 0.001), animal, atRest(0));
    expect(fluxes.shortfall).toBeGreaterThan(fluxes.fromStructure);
  });

  it('pays a somatic shortfall from the buffer before maturity maintenance draws on it', () => {
    const starving = fish(0.8 * Lm, 0.001);
    const bare = stepDeb(starving, animal, atRest(0)).fluxes;
    const somaticDue = bare.fromStructure;
    const maturityDue = bare.shortfall - somaticDue;

    const buffered = stepDeb({ ...starving, broodBuffer: somaticDue + maturityDue / 2 }, animal, atRest(0));
    expect(buffered.fluxes.fromStructure).toBe(0);
    expect(buffered.state.broodBuffer).toBe(0);
    expect(buffered.fluxes.burned.development).toBeLessThan(animal.kJ * animal.EHp);
  });

  it('rejuvenates a starving juvenile and holds an adult at puberty', () => {
    const juvenile = fish(0.3 * Lm, 0.001, { maturity: animal.EHp / 2 });
    expect(stepDeb(juvenile, animal, atRest(0)).state.maturity).toBeLessThan(juvenile.maturity);
    expect(stepDeb(fish(0.8 * Lm, 0.001), animal, atRest(0)).state.maturity).toBe(animal.EHp);
  });

  it('holds at L_m on a full reserve only with full oxygen, short [p_M]·V·(1−ω)·τ below it', () => {
    const grown = fish(Lm, 1);
    const owed = (tau: number): number => animal.pM * grown.structure * tau;
    for (const tau of [1, 1.4]) {
      const full = stepDeb(grown, animal, { digested: FEAST, tau, omega: 1 }).fluxes;
      expect(full.toStructure).toBeLessThan(1e-12 * owed(tau));
      expect(full.shortfall).toBeLessThan(1e-12 * owed(tau));
      for (const omega of [0.8, 0.5, 0.2]) {
        const { shortfall } = stepDeb(grown, animal, { digested: FEAST, tau, omega }).fluxes;
        expectNear(shortfall, owed(tau) * (1 - omega));
      }
    }

    const hypoxic = live(stateAt(9 * YEAR), 30 * HOURS_PER_DAY, { digested: FEAST, tau: 1, omega: 0.4 });
    expect(hypoxic.every(({ fluxes }) => fluxes.shortfall > 0)).toBe(true);
  });
});

describe('a life on unlimited food', () => {
  it('fills its reserve toward e = 1 and never past it', () => {
    const lean = live(fish(0.5, 0.3), 2 * YEAR, atRest(FEAST));
    expect(reserveDensity(last(lean).state, animal)).toBeCloseTo(1, 2);
    expect(most([...lifeOnFeast, ...lean].map(({ state }) => reserveDensity(state, animal)))).toBeLessThanOrEqual(
      1 + 1e-9
    );
  });

  it('grows every hour toward L_m and never past it', () => {
    const structures = [hatchling(animal), ...lifeOnFeast.map(({ state }) => state)].map((s) => s.structure);
    expect(structures.findIndex((V, t) => t > 0 && V < structures[t - 1])).toBe(-1);
    expect(Math.cbrt(most(structures))).toBeLessThan(Lm);
    expect(Math.cbrt(last(structures)) / Lm).toBeGreaterThan(0.99);
  });

  it('assimilates less and grows slower under assimilation stress, however much it eats', () => {
    const fry = hatchling(animal);
    const season = 90 * HOURS_PER_DAY;
    const plain = live(fry, season, atRest(FEAST));
    const stressed = live(fry, season, { ...atRest(FEAST), stress: { ...NO_STRESS, assimilation: 0.6 } });
    expectNear(stressed[0].fluxes.assimilated, 0.6 * plain[0].fluxes.assimilated);
    expect(last(stressed).state.structure).toBeLessThan(last(plain).state.structure);
  });

  it('reaches puberty once, one way, and fills no buffer before it', () => {
    const puberty = lifeOnFeast.findIndex(({ state }) => mature(state, animal));
    expect(puberty).toBeGreaterThan(0);
    expect(lifeOnFeast.slice(0, puberty).every(({ state }) => state.broodBuffer === 0)).toBe(true);
    expect(lifeOnFeast.slice(puberty).every(({ state }) => state.maturity === animal.EHp)).toBe(true);
    expect(stateAt(2 * YEAR).broodBuffer).toBeGreaterThan(0);

    const fasting = live(stateAt(3 * YEAR), YEAR, atRest(0));
    expect(fasting.every(({ state }) => state.maturity === animal.EHp)).toBe(true);
  });
});

describe('ageing', () => {
  it('accrues wear per gram mobilised at τ², whatever the oxygen', () => {
    const s = fish(0.6, 0.8);
    const wearPerGram = (tau: number, omega: number): number => {
      const { state, fluxes } = stepDeb(s, animal, { digested: 0, tau, omega });
      return state.wearLoad / fluxes.mobilised;
    };
    expectNear(wearPerGram(1, 0.4), wearPerGram(1, 1));
    expectNear(wearPerGram(2, 1), 4 * wearPerGram(1, 1));
  });

  it('ages faster warm: the hazard a season after hatching rises with τ', () => {
    const hazards = [0.8, 1, 1.3, 1.7].map(
      (tau) => last(live(hatchling(animal), 90 * HOURS_PER_DAY, { digested: FEAST, tau, omega: 1 })).state.hazard
    );
    for (let i = 1; i < hazards.length; i++) expect(hazards[i]).toBeGreaterThan(hazards[i - 1]);
  });

  it('wears faster with age: the hazard rises year on year', () => {
    const yearly = Array.from({ length: 9 }, (_, i) => stateAt((i + 1) * YEAR).hazard);
    for (let i = 1; i < yearly.length; i++) expect(yearly[i]).toBeGreaterThan(yearly[i - 1]);
  });
});

describe('brood', () => {
  it('readies fewer eggs as egg cost rises', () => {
    const s = fish(0.8, 1, { broodBuffer: 40 * E0 });
    const ready = [1, 1.3, 2, 5].map((eggCost) => eggsReady(s, animal, { stress: { ...NO_STRESS, eggCost } }));
    for (let i = 1; i < ready.length; i++) expect(ready[i]).toBeLessThanOrEqual(ready[i - 1]);
    expect(last(ready)).toBeLessThan(ready[0]);
  });

  it('laying every egg ready leaves less than one egg’s cost and never a negative buffer', () => {
    for (const broodBuffer of [0, 0.5 * E0, 7.5 * E0, 40.3 * E0]) {
      for (const eggCost of [1, 1.5]) {
        const s = fish(0.8, 1, { broodBuffer });
        const hour = { stress: { ...NO_STRESS, eggCost } };
        const spawn = layEggs(s, animal, hour, eggsReady(s, animal, hour));
        expect(spawn.state.broodBuffer).toBeGreaterThanOrEqual(0);
        expect(spawn.state.broodBuffer).toBeLessThan((E0 * eggCost) / animal.kappaR);
        expect(spawn.overhead).toBeGreaterThanOrEqual(0);
        expectNear(s.broodBuffer - spawn.state.broodBuffer, spawn.laid + spawn.overhead);
      }
    }
  });

  it('lays no more eggs than are ready', () => {
    const s = fish(0.8, 1, { broodBuffer: 7.5 * E0 });
    const spawn = layEggs(s, animal, {}, 1000);
    expect(spawn.eggs).toBe(eggsReady(s, animal, {}));
    expect(spawn.state.broodBuffer).toBeGreaterThanOrEqual(0);
  });

  it('draws a father’s share from the buffer, never more than it holds', () => {
    const s = fish(0.8, 1, { broodBuffer: 3 * E0 });
    const share = drawBroodBuffer(s, E0);
    expect(share.drawn).toBe(E0);
    expectNear(share.state.broodBuffer, 2 * E0);

    const all = drawBroodBuffer(s, 10 * E0);
    expect(all.drawn).toBe(s.broodBuffer);
    expect(all.state.broodBuffer).toBe(0);
  });

  it('hatches at L_b on a full reserve with E_Hb', () => {
    const fry = hatchling(animal);
    expect(structuralLength(fry)).toBeCloseTo(animal.Lb, 12);
    expect(reserveDensity(fry, animal)).toBeCloseTo(1, 12);
    expect(fry).toMatchObject({ maturity: animal.EHb, broodBuffer: 0, wearLoad: 0, hazard: 0 });
    expect(mature(fry, animal)).toBe(false);
  });
});

describe('readings', () => {
  it('weighs structure alone with nothing stored, and more with reserve or buffer', () => {
    const bare = fish(0.7, 0);
    expect(wetMass(bare, animal)).toBe(bare.structure);
    expect(wetMass(fish(0.7, 0.5), animal)).toBeGreaterThan(wetMass(bare, animal));
    expect(wetMass(fish(0.7, 0, { broodBuffer: 0.001 }), animal)).toBeGreaterThan(wetMass(bare, animal));
  });

  it('reads size 0–100 against L_m, rising as the fish grows', () => {
    expect(size(fish(Lm, 1), animal)).toBeCloseTo(100, 12);
    const yearly = Array.from({ length: 9 }, (_, i) => size(stateAt((i + 1) * YEAR), animal));
    for (let i = 1; i < yearly.length; i++) expect(yearly[i]).toBeGreaterThan(yearly[i - 1]);
    expect(last(yearly)).toBeLessThan(100);
  });

  it('stays finite at the zero state', () => {
    const zero: DebState = { structure: 0, reserve: 0, maturity: 0, broodBuffer: 0, wearLoad: 0, hazard: 0 };
    for (const digested of [0, FEAST]) {
      const { state, fluxes } = stepDeb(zero, animal, atRest(digested));
      const { burned, ...flows } = fluxes;
      for (const x of [...Object.values(state), ...Object.values(burned), ...Object.values(flows)]) {
        expect(Number.isFinite(x)).toBe(true);
      }
    }
    expect(reserveDensity(zero, animal)).toBe(0);
    expect(wetMass(zero, animal)).toBe(0);
    expect(size(zero, animal)).toBe(0);
  });
});
