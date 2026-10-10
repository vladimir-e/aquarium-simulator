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
  wellFed,
  wetMass,
  type DebFluxes,
  type DebHour,
  type DebParams,
  type DebState,
  type DebStep,
  type DebStress,
} from './deb.js';
import { fromAmP, GENERALISED_ANIMAL, HOURS_PER_DAY } from '../livestock/amp.js';

const animal: DebParams = fromAmP(GENERALISED_ANIMAL);
const { E0 } = animal;
const Lm = maxStructuralLength(animal);
const YEAR = 365 * HOURS_PER_DAY;
const SEASON = 90 * HOURS_PER_DAY;

const FEAST = 1;
const atReference = (fromGut: number): DebHour => ({ fromGut, tau: 1, omega: 1 });

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

const spawned = (s: DebState): DebState => layEggs(s, animal, eggsReady(s, animal)).state;

const last = <T,>(xs: readonly T[]): T => xs[xs.length - 1];
const most = (xs: readonly number[]): number => xs.reduce((a, b) => Math.max(a, b), -Infinity);
const rising = (xs: readonly number[]): boolean => xs.every((x, i) => i === 0 || x > xs[i - 1]);
const product = (...axes: readonly number[][]): number[][] =>
  axes.reduce<number[][]>((rows, axis) => rows.flatMap((row) => axis.map((x) => [...row, x])), [[]]);

const tolerance = (expected: number): number => 1e-9 * Math.max(Math.abs(expected), 1e-12);
const near = (actual: number, expected: number): boolean => Math.abs(actual - expected) <= tolerance(expected);
const expectNear = (actual: number, expected: number): void => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance(expected));
};

const lifeOnFeast = live(hatchling(animal), 9 * YEAR, atReference(FEAST));
const stateAt = (hour: number): DebState => lifeOnFeast[hour - 1].state;
const starvingJuvenile = fish(0.3 * Lm, 0.5, { maturity: animal.EHp / 2 });

const regimes: { name: string; from: DebState; hour: DebHour }[] = [
  { name: 'feasting', from: hatchling(animal), hour: atReference(FEAST) },
  { name: 'fasting', from: stateAt(3 * YEAR), hour: atReference(0) },
  {
    name: 'stressed, paced and healing',
    from: stateAt(YEAR),
    hour: {
      fromGut: 2e-5,
      tau: 1.7,
      omega: 0.6,
      stress: { assimilation: 0.7, maintenance: 1.4, growthCost: 1.3, eggCost: 1 },
      healing: 1e-7,
    },
  },
  {
    name: 'fed at ω = 0.4 on a spent buffer',
    from: spawned(stateAt(9 * YEAR)),
    hour: { fromGut: FEAST, tau: 1, omega: 0.4 },
  },
  { name: 'fed without oxygen', from: stateAt(YEAR), hour: { fromGut: FEAST, tau: 1, omega: 0 } },
  { name: 'an adult on an empty buffer at low e', from: fish(0.8 * Lm, 0.05), hour: atReference(2e-6) },
  { name: 'a starving juvenile', from: starvingJuvenile, hour: atReference(0) },
  { name: 'a starving juvenile without oxygen', from: starvingJuvenile, hour: { fromGut: 0, tau: 1, omega: 0 } },
];

const lives = regimes.map((regime) => ({ ...regime, steps: live(regime.from, 2 * YEAR, regime.hour) }));

describe.each(lives)(
  'two years $name',
  ({ from, hour, steps }) => {
    const hours = steps.map((step, t) => ({ before: t === 0 ? from : steps[t - 1].state, ...step }));

    it('closes the ledger every hour', () => {
      const open = hours.findIndex(({ before, state, fluxes }) => {
        const stored = organics(state, animal) - organics(before, animal);
        const gap = hour.fromGut - fluxes.returned - (stored + totalBurned(fluxes) + fluxes.feces);
        return Math.abs(gap) > Math.max(1e-15, 1e-12 * (fluxes.assimilated + fluxes.mobilised));
      });
      expect(open).toBe(-1);
    });

    it('keeps every stock non-negative and finite', () => {
      const sound = (stock: number): boolean => Number.isFinite(stock) && stock >= 0;
      expect(hours.findIndex(({ state }) => !Object.values(state).every(sound))).toBe(-1);
    });

    it('grows only once somatic maintenance is paid in full', () => {
      const { tau, stress = NO_STRESS } = hour;
      const somaticUpkeep = (V: number): number => animal.pM * stress.maintenance * V * tau;
      const unpaid = hours.findIndex(
        ({ before, fluxes }) =>
          fluxes.toStructure > 0 && !near(fluxes.burned.maintenance, somaticUpkeep(before.structure))
      );
      expect(unpaid).toBe(-1);
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

  it('assimilates κ_X of what it takes from the gut, up to its ceiling, and returns the rest', () => {
    const s = fish(0.5, 0.6);
    const hour = { tau: 1.3, omega: 0.8 };
    const ceiling = assimilationCeiling(s, animal, hour);

    const scarce = stepDeb(s, animal, { ...hour, fromGut: ceiling }).fluxes;
    expectNear(scarce.assimilated, animal.kappaX * ceiling);
    expectNear(scarce.feces, (1 - animal.kappaX) * ceiling);
    expect(scarce.returned).toBe(0);

    const plenty = stepDeb(s, animal, { ...hour, fromGut: 100 * ceiling }).fluxes;
    expectNear(plenty.assimilated, ceiling);
    expectNear(plenty.returned, 100 * ceiling - ceiling / animal.kappaX);
  });

  it('never mobilises more reserve than it holds', () => {
    const speck = fish(1e-4, 1);
    const hours = [1, 5, 20].map((tau) => stepDeb(speck, animal, { fromGut: 0, tau, omega: 1 }));
    expect(hours.every(({ state, fluxes }) => fluxes.mobilised <= speck.reserve && state.reserve >= 0)).toBe(true);
  });

  it('burns the growth overhead: a cm³ of structure costs [E_G] and holds κ_G·[E_G]', () => {
    const s = fish(0.4, 1);
    const priced = [1, 2].every((growthCost) => {
      const { state, fluxes } = stepDeb(s, animal, { ...atReference(FEAST), stress: { ...NO_STRESS, growthCost } });
      const grown = state.structure - s.structure;
      return (
        near(grown, (fluxes.toStructure + fluxes.burned.growth) / (growthCost * animal.EG)) &&
        near(fluxes.toStructure, structureOrganics(animal) * grown)
      );
    });
    expect(priced).toBe(true);
  });

  it('paces every rate by τ', () => {
    const s = fish(0.6, 0.8);
    const slow = stepDeb(s, animal, { fromGut: 0, tau: 1, omega: 0.5 }).fluxes;
    const fast = stepDeb(s, animal, { fromGut: 0, tau: 2, omega: 0.5 }).fluxes;
    expectNear(fast.mobilised, 2 * slow.mobilised);
    expectNear(fast.burned.maintenance, 2 * slow.burned.maintenance);
    expectNear(fast.burned.development, 2 * slow.burned.development);
  });

  it('moves the flux each stress names', () => {
    const s = fish(0.6, 0.9);
    const hour = atReference(FEAST);
    const plain = stepDeb(s, animal, hour).fluxes;
    const stressed = (o: Partial<DebStress>): DebFluxes =>
      stepDeb(s, animal, { ...hour, stress: { ...NO_STRESS, ...o } }).fluxes;

    expectNear(stressed({ assimilation: 0.5 }).assimilated, plain.assimilated / 2);
    expect(stressed({ maintenance: 1.5 }).burned.maintenance).toBeGreaterThan(plain.burned.maintenance);
    expect(stressed({ growthCost: 1.5 }).toStructure).toBeLessThan(plain.toStructure);
  });

  it('burns nothing negative anywhere in the domain, so no input mints mass', () => {
    const s = fish(0.6, 0.9, { broodBuffer: 20 * E0 });
    const domain = product([0, 1], [1, 3], [1, 3], [1, 3], [0, 1], [0, 1e-6]).map(
      ([assimilation, maintenance, growthCost, eggCost, omega, healing]): DebHour => ({
        fromGut: FEAST,
        tau: 1,
        omega,
        healing,
        stress: { assimilation, maintenance, growthCost, eggCost },
      })
    );
    const minting = domain.findIndex(({ stress, ...hour }) => {
      const { burned } = stepDeb(s, animal, { ...hour, stress }).fluxes;
      const { overhead } = layEggs(s, animal, eggsReady(s, animal, stress), stress);
      return Object.values(burned).some((grams) => grams < 0) || overhead < 0;
    });
    expect(minting).toBe(-1);
  });

  it('pays healing from reserve at the hour’s oxygen, never more than the reserve holds', () => {
    const s = fish(0.6, 0.5);
    const plain = stepDeb(s, animal, atReference(0));
    const healed = stepDeb(s, animal, { ...atReference(0), healing: 1e-6 });
    expectNear(healed.fluxes.burned.healing, 1e-6);
    expectNear(plain.state.reserve - healed.state.reserve, 1e-6);
    expectNear(stepDeb(s, animal, { fromGut: 0, tau: 1, omega: 0.5, healing: 1e-6 }).fluxes.burned.healing, 5e-7);

    const greedy = stepDeb(s, animal, { ...atReference(0), healing: 1 });
    expectNear(greedy.fluxes.burned.healing, plain.state.reserve);
    expect(greedy.state.reserve).toBe(0);
  });
});

describe('oxygen', () => {
  it('holds reserve density at or below 1 for two years in every regime at full oxygen', () => {
    const densities = lives
      .filter(({ hour }) => hour.omega === 1)
      .flatMap(({ steps }) => steps.map(({ state }) => reserveDensity(state, animal)));
    expect(most(densities)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('scales {p_Am} and v by ω and leaves maintenance owed at τ', () => {
    const s = fish(0.8, 0.8);
    const tau = 1.5;
    const [none, thin, full] = [0, 0.5, 1].map((omega) => stepDeb(s, animal, { fromGut: FEAST, tau, omega }).fluxes);
    expect(none.assimilated).toBe(0);
    expectNear(thin.assimilated, full.assimilated / 2);
    expect(none.mobilised).toBeGreaterThan(0);
    expectNear(thin.mobilised - none.mobilised, (full.mobilised - none.mobilised) / 2);
    const owed = [none, thin, full].every(
      ({ burned, shortfall }) =>
        near(burned.maintenance + shortfall, animal.pM * s.structure * tau) &&
        near(burned.development, animal.kJ * animal.EHp * tau)
    );
    expect(owed).toBe(true);
  });

  it('holds at L_m on a full reserve only at full oxygen, short [p_M]·V·τ·(1 − ω)·g/(1 + g) below it', () => {
    const grown = fish(Lm, 1);
    const g = animal.EG / (animal.kappa * maxReserveDensity(animal));
    const owed = (tau: number): number => animal.pM * grown.structure * tau;
    const at = (tau: number, omega: number): DebFluxes =>
      stepDeb(grown, animal, { fromGut: FEAST, tau, omega }).fluxes;
    const taus = [1, 1.4];

    const holds = taus.every((tau) => {
      const { toStructure, shortfall } = at(tau, 1);
      return toStructure < 1e-12 * owed(tau) && shortfall < 1e-12 * owed(tau);
    });
    expect(holds).toBe(true);

    const short = taus.every((tau) =>
      [0.8, 0.5, 0.2].every((omega) => near(at(tau, omega).shortfall, (owed(tau) * (1 - omega) * g) / (1 + g)))
    );
    expect(short).toBe(true);
  });

  it('runs short every hour of a fed season at ω = 0.4 near L_m', () => {
    const hypoxic = live(stateAt(9 * YEAR), SEASON, { fromGut: FEAST, tau: 1, omega: 0.4 });
    expect(hypoxic.every(({ fluxes }) => fluxes.shortfall > 0)).toBe(true);
  });
});

describe('maintenance priority', () => {
  it('starving, draws the buffer first, then structure', () => {
    const before = spawned(stateAt(3 * YEAR));
    const fast = live(before, 3000, atReference(0));

    expect(fast.findIndex(({ fluxes, state }) => fluxes.fromStructure > 0 && state.broodBuffer > 0)).toBe(-1);

    const bufferPays = fast.findIndex(({ fluxes }) => fluxes.shortfall > 0);
    const shrinks = fast.findIndex(({ fluxes }) => fluxes.fromStructure > 0);
    expect(bufferPays).toBeGreaterThanOrEqual(0);
    expect(fast[bufferPays].fluxes.fromStructure).toBe(0);
    expect(shrinks).toBeGreaterThan(bufferPays);
    expect(last(fast).state.structure).toBeLessThan(before.structure);
  });

  it('counts unpaid maturity maintenance in the shortfall', () => {
    const { fluxes } = stepDeb(fish(0.8 * Lm, 0.001), animal, atReference(0));
    expect(fluxes.shortfall).toBeGreaterThan(fluxes.fromStructure);
  });

  it('pays a somatic shortfall from the buffer before maturity maintenance, both as starvation', () => {
    const starving = fish(0.8 * Lm, 0.001);
    const bare = stepDeb(starving, animal, atReference(0)).fluxes;
    const somaticDue = bare.fromStructure;
    const maturityDue = bare.shortfall - somaticDue;

    const broodBuffer = somaticDue + maturityDue / 2;
    const buffered = stepDeb({ ...starving, broodBuffer }, animal, atReference(0));
    expect(buffered.fluxes.fromStructure).toBe(0);
    expect(buffered.state.broodBuffer).toBe(0);
    expectNear(buffered.fluxes.burned.starvation, broodBuffer);
  });

  it('pays a juvenile’s somatic shortfall from its surplus before maturity takes the rest', () => {
    const juvenile = fish(0.5 * Lm, 0.4, { maturity: animal.EHp / 10 });
    const { state, fluxes } = stepDeb(juvenile, animal, atReference(0));
    expect(fluxes.shortfall).toBeGreaterThan(0);
    expect(fluxes.fromStructure).toBe(0);
    expectNear(fluxes.burned.starvation, fluxes.shortfall);
    expect(state.maturity).toBeGreaterThan(juvenile.maturity);
  });

  it('rejuvenates a starving juvenile with or without oxygen, and holds an adult at puberty', () => {
    const matured = (omega: number): number =>
      last(live(starvingJuvenile, 2 * YEAR, { fromGut: 0, tau: 1, omega })).state.maturity;
    expect([1, 0].every((omega) => matured(omega) < starvingJuvenile.maturity)).toBe(true);
    expect(stepDeb(fish(0.8 * Lm, 0.001), animal, atReference(0)).state.maturity).toBe(animal.EHp);
  });
});

describe('a life on unlimited food', () => {
  it('fills its reserve toward e = 1 and never past it', () => {
    const lean = live(fish(0.5, 0.3), 2 * YEAR, atReference(FEAST));
    expect(reserveDensity(last(lean).state, animal)).toBeCloseTo(1, 2);
    expect(most([...lifeOnFeast, ...lean].map(({ state }) => reserveDensity(state, animal)))).toBeLessThanOrEqual(
      1 + 1e-9
    );
  });

  it('never shrinks on its way to L_m and never passes it', () => {
    const structures = [hatchling(animal), ...lifeOnFeast.map(({ state }) => state)].map((s) => s.structure);
    expect(structures.findIndex((V, t) => t > 0 && V < structures[t - 1])).toBe(-1);
    expect(Math.cbrt(most(structures))).toBeLessThan(Lm);
    expect(Math.cbrt(last(structures)) / Lm).toBeGreaterThan(0.99);
  });

  it('assimilates less and grows slower under assimilation stress, however much it eats', () => {
    const fry = hatchling(animal);
    const plain = live(fry, SEASON, atReference(FEAST));
    const stressed = live(fry, SEASON, { ...atReference(FEAST), stress: { ...NO_STRESS, assimilation: 0.6 } });
    expectNear(stressed[0].fluxes.assimilated, 0.6 * plain[0].fluxes.assimilated);
    expect(last(stressed).state.structure).toBeLessThan(last(plain).state.structure);
  });

  it('reaches puberty once, one way, and fills no buffer before it', () => {
    const puberty = lifeOnFeast.findIndex(({ state }) => mature(state, animal));
    expect(puberty).toBeGreaterThan(0);
    expect(lifeOnFeast.slice(0, puberty).every(({ state }) => state.broodBuffer === 0)).toBe(true);
    expect(lifeOnFeast.slice(puberty).every(({ state }) => state.maturity === animal.EHp)).toBe(true);
    expect(stateAt(2 * YEAR).broodBuffer).toBeGreaterThan(0);

    const fasting = live(stateAt(3 * YEAR), YEAR, atReference(0));
    expect(fasting.every(({ state }) => state.maturity === animal.EHp)).toBe(true);
  });
});

describe('ageing', () => {
  it('accrues wear per gram mobilised at τ², whatever the oxygen', () => {
    const s = fish(0.6, 0.8);
    const wearPerGram = (tau: number, omega: number): number => {
      const { state, fluxes } = stepDeb(s, animal, { fromGut: 0, tau, omega });
      return (state.wearLoad * state.structure) / (s.structure * fluxes.mobilised);
    };
    expectNear(wearPerGram(1, 0.4), wearPerGram(1, 1));
    expectNear(wearPerGram(2, 1), 4 * wearPerGram(1, 1));
  });

  it('dilutes wear and hazard by the volume ratio, growing or shrinking', () => {
    const worn = { wearLoad: 1e-9, hazard: 1e-5 };
    const hours = [
      { s: fish(0.3, 1, worn), hour: atReference(FEAST) },
      { s: fish(0.8 * Lm, 0.001, worn), hour: atReference(0) },
      { s: fish(0.8 * Lm, 0, worn), hour: atReference(0) },
    ].map(({ s, hour }) => ({ s, ...stepDeb(s, animal, hour) }));
    expect(hours.every(({ s, state }) => state.structure !== s.structure)).toBe(true);
    expect(
      hours.every(({ s, state }) => near(state.hazard * state.structure, (s.hazard + s.wearLoad) * s.structure))
    ).toBe(true);

    const starved = last(hours);
    expect(starved.fluxes.mobilised).toBe(0);
    expectNear(starved.state.wearLoad, (starved.s.wearLoad * starved.s.structure) / starved.state.structure);
  });

  it('ages faster warm: the hazard a season after hatching rises with τ', () => {
    const hazards = [0.8, 1, 1.3, 1.7].map(
      (tau) => last(live(hatchling(animal), SEASON, { fromGut: FEAST, tau, omega: 1 })).state.hazard
    );
    expect(rising(hazards)).toBe(true);
  });

  it('wears faster with age: the hazard rises year on year', () => {
    expect(rising(Array.from({ length: 9 }, (_, i) => stateAt((i + 1) * YEAR).hazard))).toBe(true);
  });
});

describe('brood', () => {
  it('readies fewer eggs as egg cost rises', () => {
    const s = fish(0.8, 1, { broodBuffer: 40 * E0 });
    const ready = [1, 1.3, 2, 5].map((eggCost) => eggsReady(s, animal, { ...NO_STRESS, eggCost }));
    expect(ready.every((n, i) => i === 0 || n <= ready[i - 1])).toBe(true);
    expect(last(ready)).toBeLessThan(ready[0]);
  });

  it('laying every egg ready leaves less than one egg’s cost and never a negative buffer', () => {
    const unsound = product([0, 0.5 * E0, 7.5 * E0, 40.3 * E0], [1, 1.5]).findIndex(([broodBuffer, eggCost]) => {
      const s = fish(0.8, 1, { broodBuffer });
      const stress = { ...NO_STRESS, eggCost };
      const spawn = layEggs(s, animal, eggsReady(s, animal, stress), stress);
      const left = spawn.state.broodBuffer;
      return (
        left < 0 ||
        left >= (E0 * eggCost) / animal.kappaR ||
        spawn.overhead < 0 ||
        !near(s.broodBuffer - left, spawn.laid + spawn.overhead)
      );
    });
    expect(unsound).toBe(-1);
  });

  it('lays a whole, non-negative number of eggs, never more than are ready', () => {
    const s = fish(0.8, 1, { broodBuffer: 7.5 * E0 });
    expect(layEggs(s, animal, 1000).eggs).toBe(eggsReady(s, animal));
    expect(layEggs(s, animal, 2.7).eggs).toBe(2);
    const none = layEggs(s, animal, -3);
    expect(none.eggs).toBe(0);
    expect(none.state.broodBuffer).toBe(s.broodBuffer);
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

  it('pays for its hatchling out of an egg: E_0 covers the hatchling’s organics and E_Hb', () => {
    expect(organics(hatchling(animal), animal) + animal.EHb).toBeLessThanOrEqual(animal.E0);
  });
});

describe('readings', () => {
  it('weighs structure alone with nothing stored, and more with reserve or buffer', () => {
    const bare = fish(0.7, 0);
    expect(wetMass(bare, animal)).toBe(bare.structure);
    expect(wetMass(fish(0.7, 0.5), animal)).toBeGreaterThan(wetMass(bare, animal));
    expect(wetMass(fish(0.7, 0, { broodBuffer: 0.001 }), animal)).toBeGreaterThan(wetMass(bare, animal));
  });

  it('reads well-fed as reserve density on a feast, capped at 1 where hypoxic structure burns', () => {
    expect(lifeOnFeast.every(({ state }) => near(wellFed(state, animal), reserveDensity(state, animal)))).toBe(true);
    const { state } = last(live(fish(Lm, 1), SEASON, { fromGut: FEAST, tau: 1, omega: 0 }));
    expect(reserveDensity(state, animal)).toBeGreaterThan(1);
    expect(wellFed(state, animal)).toBe(1);
  });

  it('reads size 0–100 against L_m, rising as the fish grows', () => {
    expect(size(fish(Lm, 1), animal)).toBeCloseTo(100, 12);
    const yearly = Array.from({ length: 9 }, (_, i) => size(stateAt((i + 1) * YEAR), animal));
    expect(rising(yearly)).toBe(true);
    expect(last(yearly)).toBeLessThan(100);
  });

  it('stays finite at the zero state', () => {
    const zero: DebState = { structure: 0, reserve: 0, maturity: 0, broodBuffer: 0, wearLoad: 0, hazard: 0 };
    const finite = [0, FEAST].every((fromGut) => {
      const { state, fluxes } = stepDeb(zero, animal, atReference(fromGut));
      const { burned, ...flows } = fluxes;
      return [...Object.values(state), ...Object.values(burned), ...Object.values(flows)].every(Number.isFinite);
    });
    expect(finite).toBe(true);
    expect(reserveDensity(zero, animal)).toBe(0);
    expect(wetMass(zero, animal)).toBe(0);
    expect(size(zero, animal)).toBe(0);
  });
});
