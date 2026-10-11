import { describe, it, expect } from 'vitest';
import {
  buyOffshoot,
  droopFactor,
  floraOrganics,
  offshootReady,
  remains,
  scaleFlora,
  shed,
  stepFlora,
  stocked,
  storeFill,
  storeRequest,
  takeUp,
  type FloraBudgetHour,
  type FloraParams,
  type FloraState,
  type FloraStep,
} from './flora-budget.js';
import {
  hourSlices,
  K_SLICE,
  maxReserveDensity,
  NO_STRESS,
  reserveDensity,
  totalBurned,
  wellFed,
  type DebStress,
} from './reserve.js';
import { bloomParams, plantParams } from '../flora/params.js';
import { plantsDefaults } from '../config/plants.js';
import { mapNutrients, NUTRIENTS, ZERO_NUTRIENTS, type Nutrient, type NutrientVector } from '../config/nutrients.js';
import { hourlyDraw, hourlyInflowDraw, monodFactor } from '../core/kinetics.js';
import { HOURS_PER_DAY } from '../core/clock.js';

const sword = plantParams('amazon_sword', plantsDefaults);
const greenWater = bloomParams('greenWater', plantsDefaults);
const film = bloomParams('film', plantsDefaults);
const KINDS = [
  { name: 'a plant', p: sword },
  { name: 'green water', p: greenWater },
  { name: 'film', p: film },
];
const DAY = HOURS_PER_DAY;

const storeMax = (p: FloraParams, n: Nutrient): number => p.qMax[n] - p.qMin[n];

function flora(
  p: FloraParams,
  structure: number,
  e: number,
  fill: number | NutrientVector = 1,
  o: Partial<FloraState> = {}
): FloraState {
  const share = typeof fill === 'number' ? mapNutrients(() => fill) : fill;
  return {
    structure,
    reserve: e * maxReserveDensity(p) * structure,
    offshootBuffer: 0,
    stores: mapNutrients((n) => share[n] * storeMax(p, n) * structure),
    ...o,
  };
}

const nutrientsHeld = (state: FloraState, p: FloraParams): NutrientVector =>
  mapNutrients((n) => state.stores[n] + p.qMin[n] * state.structure);

/** DEB's V1-morph mobilisation per gram of reserve, the turnover the hour starts on. */
const turnover = (state: FloraState, p: FloraParams, tau: number): number =>
  (tau * state.structure * (p.v * p.EG + p.pM)) / (p.EG * state.structure + p.kappa * state.reserve);

type Supply = (state: FloraState, t: number) => FloraBudgetHour;

const lit =
  (p: FloraParams, o: Partial<FloraBudgetHour> = {}): Supply =>
  (state) => ({ offered: p.pAm * state.structure, tau: 1, omega: 1, room: 1, ...o });
const dark = (o: Partial<FloraBudgetHour> = {}): Supply => () => ({ offered: 0, tau: 1, omega: 1, room: 1, ...o });
const photoperiod =
  (p: FloraParams, hours: number, o: Partial<FloraBudgetHour> = {}): Supply =>
  (state, t) => ({ offered: t % DAY < hours ? p.pAm * state.structure : 0, tau: 1, omega: 1, room: 1, ...o });

interface Lived extends FloraStep {
  before: FloraState;
  hour: FloraBudgetHour;
  delivered: NutrientVector;
}

function live(p: FloraParams, from: FloraState, hours: number, supply: Supply, fed = false): Lived[] {
  const lived: Lived[] = [];
  let state = from;
  for (let t = 0; t < hours; t++) {
    const hour = supply(state, t);
    const delivered = fed ? storeRequest(state, p, hour.tau) : ZERO_NUTRIENTS;
    lived.push({ before: state, hour, delivered, ...stepFlora(takeUp(state, delivered), p, hour) });
    state = lived[t].state;
  }
  return lived;
}

/** The same hour stepped `steps` times, each step with its share of the photosynthate, pace and healing. */
function finely(state: FloraState, p: FloraParams, hour: FloraBudgetHour, steps: number): FloraStep[] {
  const slice = { ...hour, offered: hour.offered / steps, tau: hour.tau / steps, healing: (hour.healing ?? 0) / steps };
  const stepped: FloraStep[] = [];
  for (let i = 0; i < steps; i++) stepped.push(stepFlora(i === 0 ? state : stepped[i - 1].state, p, slice));
  return stepped;
}

const slicesOf = (state: FloraState, p: FloraParams, hour: FloraBudgetHour): FloraStep[] =>
  finely(state, p, hour, hourSlices(p, hour.tau));

const last = <T,>(xs: readonly T[]): T => xs[xs.length - 1];
const most = (xs: readonly number[]): number => xs.reduce((a, b) => Math.max(a, b), -Infinity);
const falling = (xs: readonly number[]): boolean => xs.every((x, i) => i === 0 || x < xs[i - 1]);
const flat = ({ burned, ...flows }: FloraStep['fluxes']): number[] => [
  ...Object.values(flows),
  ...Object.values(burned),
];

const tolerance = (scale: number): number => 1e-12 * Math.max(Math.abs(scale), 1e-12);
const near = (actual: number, expected: number, scale = expected): boolean =>
  Math.abs(actual - expected) <= tolerance(scale);
const expectNear = (actual: number, expected: number, scale = expected): void => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance(scale));
};

const regimes: { name: string; p: FloraParams; from: FloraState; supply: Supply; fed?: boolean }[] = [
  { name: 'a plant lit round the clock and fed', p: sword, from: flora(sword, 2, 0.5), supply: lit(sword), fed: true },
  { name: 'a plant in the dark on full stores', p: sword, from: flora(sword, 2.8, 1), supply: dark() },
  { name: 'a plant lit on empty stores', p: sword, from: flora(sword, 2, 0.3, 0), supply: lit(sword) },
  { name: 'a plant lit by day in lean water', p: sword, from: flora(sword, 1, 0.5), supply: photoperiod(sword, 12) },
  {
    name: 'a plant lit by day after shedding a third of itself',
    p: sword,
    from: shed(flora(sword, 2.4, 1), sword, 0.8).state,
    supply: photoperiod(sword, 12),
    fed: true,
  },
  {
    name: 'a crowded plant, warm, lit by day and fed',
    p: sword,
    from: flora(sword, 2, 0.8),
    supply: photoperiod(sword, 10, { tau: 1.5, omega: 1, room: 0.05 }),
    fed: true,
  },
  {
    name: 'a starving plant on its buffer',
    p: sword,
    from: flora(sword, 2, 0.01, 0.5, { offshootBuffer: 0.01 }),
    supply: dark(),
  },
  {
    name: 'green water hot and lit on near-empty stores, fed',
    p: greenWater,
    from: flora(greenWater, 0.5, 1, 1e-3),
    supply: lit(greenWater, { tau: 3 }),
    fed: true,
  },
  {
    name: 'green water on κ = 1, lit by day and fed',
    p: greenWater,
    from: flora(greenWater, 0.3, 0.5),
    supply: photoperiod(greenWater, 10),
    fed: true,
  },
  {
    name: 'film half stored, paced and healing, by day',
    p: film,
    from: flora(film, 0.05, 0.6, 0.5),
    supply: photoperiod(film, 8, { tau: 1.3, healing: 1e-4 }),
  },
  {
    name: 'green water stressed on every hook, lit by day and fed',
    p: greenWater,
    from: flora(greenWater, 0.3, 0.5),
    supply: photoperiod(greenWater, 10, { stress: { assimilation: 0.3, maintenance: 1.5, growthCost: 1.4, eggCost: 1 } }),
    fed: true,
  },
  {
    name: 'green water at no pace, lit by day and fed',
    p: greenWater,
    from: flora(greenWater, 0.3, 0.5),
    supply: photoperiod(greenWater, 10, { tau: 0 }),
    fed: true,
  },
  {
    name: 'green water owing no upkeep, with no room to grow, lit by day',
    p: { ...greenWater, pM: 0 },
    from: flora(greenWater, 0.3, 0.5),
    supply: photoperiod(greenWater, 10, { room: 0 }),
  },
];

const lives = regimes.map((regime) => ({
  ...regime,
  hours: live(regime.p, regime.from, 30 * DAY, regime.supply, regime.fed),
}));

describe.each(lives)('thirty days of $name', ({ p, hours }) => {
  it('closes the organics ledger every hour', () => {
    const open = hours.findIndex(({ before, state, fluxes }) => {
      const stored = floraOrganics(state) - floraOrganics(before);
      return !near(stored, fluxes.assimilated - totalBurned(fluxes), floraOrganics(before));
    });
    expect(open).toBe(-1);
  });

  it('closes every nutrient’s ledger every hour: what the stores took up, the plant still holds', () => {
    const open = hours.findIndex(({ before, state, delivered }) => {
      const held = nutrientsHeld(before, p);
      const now = nutrientsHeld(state, p);
      return NUTRIENTS.some((n) => !near(now[n] - held[n], delivered[n], held[n]));
    });
    expect(open).toBe(-1);
  });

  it('keeps every stock non-negative and finite, so growth never overdraws a store', () => {
    const sound = (stock: number): boolean => Number.isFinite(stock) && stock >= 0;
    const unsound = hours.findIndex(
      ({ state }) =>
        ![state.structure, state.reserve, state.offshootBuffer, ...Object.values(state.stores)].every(sound)
    );
    expect(unsound).toBe(-1);
  });

  it('takes what it is offered or hands it back, and never fills its reserve past E_m', () => {
    expect(hours.every(({ hour, fluxes }) => near(fluxes.assimilated + fluxes.returned, hour.offered))).toBe(true);
    expect(most(hours.map(({ state }) => reserveDensity(state, p)))).toBeLessThanOrEqual(1 + 1e-12);
  });

  it('grows only in a slice that pays its maintenance in full', () => {
    const unpaid = hours.findIndex(({ before, delivered, hour }) =>
      slicesOf(takeUp(before, delivered), p, hour).some(
        ({ fluxes }) => fluxes.toStructure > 0 && !near(fluxes.burned.maintenance, fluxes.owed)
      )
    );
    expect(unpaid).toBe(-1);
  });

  it('burns nothing negative', () => {
    expect(hours.every(({ fluxes }) => Object.values(fluxes.burned).every((grams) => grams >= 0))).toBe(true);
  });
});

describe('the hour', () => {
  it.each([
    { name: 'hot green water at dawn', p: greenWater, from: flora(greenWater, 1, 0.2), offered: greenWater.pAm, tau: 3 },
    { name: 'green water full in light', p: greenWater, from: flora(greenWater, 1, 1), offered: greenWater.pAm, tau: 1 },
    { name: 'film in the dark on lean stores', p: film, from: flora(film, 1, 1, 0.2), offered: 0, tau: 1 },
    { name: 'a warm sword at dawn', p: sword, from: flora(sword, 2, 0.2), offered: 2 * sword.pAm, tau: 3 },
    { name: 'a warm sword, well fed', p: sword, from: flora(sword, 2, 1), offered: 6 * sword.pAm, tau: 3 },
  ])('is integrated: $name grows within 5 % of the same hour stepped a thousand times', ({ p, from, offered, tau }) => {
    const hour = { offered, tau, omega: 1, room: 1 };
    const once = stepFlora(from, p, hour).state.structure - from.structure;
    const fine = last(finely(from, p, hour, 1000)).state.structure - from.structure;
    expect(Math.abs(once / fine - 1)).toBeLessThan(0.05);
  });

  it('runs the hour as its slices, each a step of its own', () => {
    const from = flora(greenWater, 1, 0.4, 0.3);
    const hour = { offered: greenWater.pAm, tau: 3, omega: 1, room: 0.8, healing: 1e-3 };
    const slices = slicesOf(from, greenWater, hour);
    const { state, fluxes } = stepFlora(from, greenWater, hour);
    expect(slices.length).toBeGreaterThan(1);
    expect(state).toEqual(last(slices).state);
    const sliced = slices.map((slice) => flat(slice.fluxes));
    flat(fluxes).forEach((flux, i) => expectNear(flux, sliced.reduce((sum, each) => sum + each[i], 0)));
  });

  it('grows in saturating light from its first hour of the day, a bloom whatever reserve the night left it', () => {
    const grows = (p: FloraParams, e: number): boolean =>
      [1, 3].every((tau) => stepFlora(flora(p, 1, e), p, { offered: p.pAm * tau, tau, omega: 1, room: 1 }).state.structure > 1);
    expect([greenWater, film].every((p) => [0, 0.2, 1].every((e) => grows(p, e)))).toBe(true);
    expect([0.2, 1].every((e) => grows(sword, e))).toBe(true);
  });

  it('turning nothing back, releases hourlyDraw of its reserve and hourlyInflowDraw of the hour’s photosynthate', () => {
    const lean = flora(sword, 2, 0.001);
    const owed = sword.pM * lean.structure * 1.6;
    const offered = owed / 5;
    const { fluxes } = stepFlora(lean, sword, { offered, tau: 1.6, omega: 1, room: 1 });
    const kTau = turnover(lean, sword, 1.6);
    expectNear(fluxes.mobilised, lean.reserve * hourlyDraw(kTau) + offered * hourlyInflowDraw(kTau));
    expect(fluxes.mobilised).toBeLessThan(owed);
  });

  it('fills its reserve to E_m of the structure the hour leaves and hands back the rest', () => {
    const s = flora(sword, 2, 0.6);
    const hour = (offered: number): FloraStep => stepFlora(s, sword, { offered, tau: 1, omega: 1, room: 1 });
    const idle = hour(0).state;
    const headroom = maxReserveDensity(sword) * idle.structure - idle.reserve;

    expect(hour(headroom / 2).fluxes.assimilated).toBe(headroom / 2);
    expect(hour(headroom / 2).fluxes.returned).toBe(0);
    const flooded = hour(3 * headroom);
    expect(flooded.fluxes.assimilated).toBeGreaterThanOrEqual(headroom);
    expectNear(flooded.fluxes.returned, 3 * headroom - flooded.fluxes.assimilated);
    expectNear(reserveDensity(flooded.state, sword), 1);
  });

  it('on a full reserve its stores refuse, takes in only what the hour spends', () => {
    const s = flora(sword, 2, 1, 0);
    const { state, fluxes } = stepFlora(s, sword, { offered: 1, tau: 1, omega: 1, room: 1 });
    expectNear(fluxes.assimilated, fluxes.mobilised);
    expectNear(state.reserve, s.reserve);
    expectNear(fluxes.returned, 1 - fluxes.mobilised);
  });

  it('fills a bloom’s reserve to E_m and hands back the rest even on full stores', () => {
    const hour = { offered: 3 * greenWater.pAm, tau: 3, omega: 1, room: 1 };
    const { state, fluxes } = stepFlora(flora(greenWater, 1, 1), greenWater, hour);
    expect(fluxes.returned).toBeGreaterThan(0);
    expectNear(reserveDensity(state, greenWater), 1);
  });

  it('runs the same budget per gram at any size: doubling the unit doubles every flux', () => {
    const s = flora(sword, 1.3, 0.7, 0.4);
    const twice: FloraState = {
      structure: 2 * s.structure,
      reserve: 2 * s.reserve,
      offshootBuffer: 0,
      stores: mapNutrients((n) => 2 * s.stores[n]),
    };
    const hour = (state: FloraState): FloraBudgetHour => ({
      offered: 0.5 * sword.pAm * state.structure,
      tau: 1.2,
      omega: 1,
      room: 0.6,
    });
    const one = flat(stepFlora(s, sword, hour(s)).fluxes);
    const two = flat(stepFlora(twice, sword, hour(twice)).fluxes);
    expect(one.some((flux) => flux > 0)).toBe(true);
    expect(one.every((flux, i) => Math.abs(two[i] - 2 * flux) <= 1e-9 * Math.max(Math.abs(flux), 1e-9))).toBe(true);
  });

  it('builds a gram of tissue, its own or the next offshoot’s, for [E_G] of reserve, burns the overhead, and takes its Q_min from every store', () => {
    const s = flora(sword, 2, 0.8);
    const { state, fluxes } = stepFlora(s, sword, { offered: 0, tau: 1, omega: 1, room: 1 });
    const grown = state.structure - s.structure;
    expect(grown).toBeGreaterThan(0);
    expectNear(fluxes.burned.maintenance, sword.pM * s.structure);
    expectNear(fluxes.toStructure, grown);
    expectNear(fluxes.burned.growth, (1 - sword.kappaG) * sword.EG * (grown + state.offshootBuffer));
    expect(NUTRIENTS.every((n) => near(s.stores[n] - state.stores[n], sword.qMin[n] * grown, s.stores[n]))).toBe(true);
  });

  it('grows at the Droop limit of the least nutrient alone', () => {
    const p = greenWater;
    const fill = { nitrate: 0.05, phosphate: 0.5, potassium: 0.8, iron: 0.3 };
    const hour = { offered: p.pAm, tau: 2, omega: 1, room: 1 };
    const grown = (stores: Partial<NutrientVector>): number => {
      const s = flora(p, 1, 1, fill);
      return stepFlora({ ...s, stores: { ...s.stores, ...stores } }, p, hour).state.structure - 1;
    };
    const s = flora(p, 1, 1, fill);
    expect(grown({ potassium: 0.9 * s.stores.potassium })).toBe(grown({}));
    expect(grown({ nitrate: 0.9 * s.stores.nitrate })).toBeLessThan(grown({}));
  });

  it.each(KINDS)('reads $name’s Droop limit at ½ where a store holds Q_min, and ρ/(1+ρ) on full stores', ({ p }) => {
    const atQuota = NUTRIENTS.every((n) => {
      const fill = mapNutrients((m) => (m === n ? p.qMin[n] / storeMax(p, n) : 1));
      return near(droopFactor(flora(p, 1, 1, fill), p), 0.5);
    });
    expect(atQuota).toBe(true);

    const rho = mapNutrients((n) => storeMax(p, n) / p.qMin[n]);
    expectNear(droopFactor(flora(p, 1, 1), p), Math.min(...NUTRIENTS.map((n) => rho[n] / (1 + rho[n]))));
    expect(droopFactor(flora(p, 1, 1, 0), p)).toBe(0);
  });

  it('never overdraws a store, however fast it grows on however little', () => {
    const s = flora(greenWater, 1, 1, 1e-4);
    const { state } = stepFlora(s, greenWater, { offered: 5 * greenWater.pAm, tau: 5, omega: 1, room: 1 });
    expect(NUTRIENTS.every((n) => state.stores[n] >= 0)).toBe(true);
    expect(state.structure).toBeGreaterThan(s.structure);
  });

  it('keeps in reserve what its stores refuse: nothing grows on empty stores, and nothing is burned for it', () => {
    const s = flora(sword, 2, 0.8, 0);
    const { state, fluxes } = stepFlora(s, sword, { offered: 0, tau: 1, omega: 1, room: 1 });
    expect(state.structure).toBe(s.structure);
    expect(state.offshootBuffer).toBe(0);
    expectNear(fluxes.mobilised, sword.pM * s.structure);
    expect(fluxes.burned.growth).toBe(0);
    expectNear(s.reserve - state.reserve, fluxes.mobilised);
  });

  it('owes maintenance at τ and runs short of it by what the κ share cannot pay', () => {
    const owed = (s: FloraState, tau: number): FloraStep['fluxes'] =>
      stepFlora(s, sword, { offered: 0, tau, omega: 1, room: 1 }).fluxes;
    const fed = owed(flora(sword, 2, 1), 1.5);
    expectNear(fed.owed, sword.pM * 2 * 1.5);
    expect(fed.shortfall).toBe(0);

    const empty = owed(flora(sword, 2, 0), 1.5);
    expect(empty.shortfall).toBe(empty.owed);

    const lean = flora(sword, 2, 0.01);
    const released = lean.reserve * hourlyDraw(turnover(lean, sword, 1));
    expectNear(owed(lean, 1).shortfall, sword.pM * 2 - sword.kappa * released);
  });

  it('starving, pays from the buffer share, the buffer, then structure, and keeps the shrunk tissue’s nutrients', () => {
    const starving = flora(sword, 2, 0.001, 0.5);
    const hour = { offered: 0, tau: 1, omega: 1, room: 1 };
    const bare = stepFlora(starving, sword, hour);
    const due = bare.fluxes.fromStructure;
    expect(due).toBeGreaterThan(0);
    const released = starving.reserve * hourlyDraw(turnover(starving, sword, 1));
    expectNear(bare.fluxes.burned.starvation, (1 - sword.kappa) * released + due);

    const shrunk = starving.structure - bare.state.structure;
    const returned = mapNutrients((n) => bare.state.stores[n] - starving.stores[n]);
    expect(NUTRIENTS.every((n) => near(returned[n], sword.qMin[n] * shrunk, starving.stores[n]))).toBe(true);

    const halfCovered = stepFlora({ ...starving, offshootBuffer: due / 2 }, sword, hour);
    expectNear(halfCovered.fluxes.fromStructure, due / 2);
    expect(halfCovered.state.offshootBuffer).toBe(0);

    const covered = stepFlora({ ...starving, offshootBuffer: 2 * due }, sword, hour);
    expect(covered.fluxes.fromStructure).toBe(0);
    expectNear(covered.state.offshootBuffer, due);
    expect(covered.state.structure).toBe(starving.structure);
  });

  it('pays healing from reserve, never more than the reserve holds', () => {
    const s = flora(sword, 2, 0.5);
    const hour = { offered: 0, tau: 1, omega: 1, room: 1 };
    const plain = stepFlora(s, sword, hour);
    const healed = stepFlora(s, sword, { ...hour, healing: 1e-3 });
    expect(healed.fluxes.burned.healing).toBe(1e-3);
    expectNear(plain.state.reserve - healed.state.reserve, 1e-3, s.reserve);

    const greedy = stepFlora(s, sword, { ...hour, healing: 10 });
    expectNear(greedy.fluxes.burned.healing, plain.state.reserve);
    expect(greedy.state.reserve).toBe(0);
  });

  it('stays finite at the zero state', () => {
    const zero: FloraState = { structure: 0, reserve: 0, offshootBuffer: 0, stores: { ...ZERO_NUTRIENTS } };
    const { state, fluxes } = stepFlora(zero, sword, { offered: 1, tau: 1, omega: 1, room: 1 });
    const { burned, ...flows } = fluxes;
    const values = [
      state.structure,
      state.reserve,
      state.offshootBuffer,
      ...Object.values(state.stores),
      ...Object.values(burned),
      ...Object.values(flows),
    ];
    expect(values.every(Number.isFinite)).toBe(true);
    expect(fluxes.returned).toBe(1);
    expect(droopFactor(zero, sword)).toBe(0);
    expect(Object.values(storeFill(zero, sword)).every((fill) => fill === 0)).toBe(true);
  });
});

describe('three days by the hour', () => {
  const PACES = [1, 1.5, 3];
  const setups = [
    { name: 'green water', p: greenWater, from: flora(greenWater, 0.3, 0.5), light: 10 },
    { name: 'film', p: film, from: flora(film, 0.05, 0.6, 0.5), light: 8 },
    { name: 'a sword', p: sword, from: flora(sword, 2, 0.5), light: 12 },
  ];

  it.each(KINDS)(
    'run $name in the fewest slices an hour that each turn over at most K_SLICE of an empty reserve',
    ({ p }) => {
      const fewest = PACES.every((tau) => {
        const slices = hourSlices(p, tau);
        const turned = turnover(flora(p, 1, 0), p, tau);
        return turned / slices <= K_SLICE && K_SLICE < turned / (slices - 1);
      });
      expect(fewest).toBe(true);
    }
  );

  it.each(setups)(
    'grow $name, lit by day and fed, within 3 % of the same days stepped 100 and 200 times an hour, extrapolated',
    ({ p, from, light }) => {
      const grown = (tau: number, steps: number): number => {
        let state = from;
        for (let t = 0; t < 3 * DAY; t++) {
          state = takeUp(state, storeRequest(state, p, tau));
          const hour = { offered: t % DAY < light ? p.pAm * state.structure : 0, tau, omega: 1, room: 1 };
          state = last(finely(state, p, hour, steps)).state;
        }
        return state.structure - from.structure;
      };
      // Richardson off 100 and 200 steps an hour: within 0.09 % of 800 steps, ~160 ms a kind.
      const converged = (tau: number): number => 2 * grown(tau, 200) - grown(tau, 100);
      expect(PACES.every((tau) => Math.abs(grown(tau, 1) / converged(tau) - 1) < 0.03)).toBe(true);
    }
  );
});

describe('uptake', () => {
  it('asks what each store lacks of full, closing first order at its fill rate, paced by τ', () => {
    const s = flora(sword, 2, 0.5, 0.3);
    const matches = [1, 1.6].every((tau) =>
      NUTRIENTS.every((n) =>
        near(
          storeRequest(s, sword, tau)[n],
          (storeMax(sword, n) * s.structure - s.stores[n]) * hourlyDraw(tau * sword.storeFillRate[n])
        )
      )
    );
    expect(matches).toBe(true);
  });

  it('asks nothing of a full store, nor of one a shed left past full', () => {
    const asks = (s: FloraState): number[] => Object.values(storeRequest(s, sword, 1));
    expect(asks(flora(sword, 2, 0.5)).every((mg) => mg === 0)).toBe(true);
    const shrunk = shed(flora(sword, 2, 0.5), sword, 1).state;
    expect(Object.values(storeFill(shrunk, sword)).every((fill) => fill > 1)).toBe(true);
    expect(asks(shrunk).every((mg) => mg === 0)).toBe(true);
  });

  it.each(KINDS)('fills an empty store of $name 1 − 1/e of the way over its fill time from a saturating pool', ({ p }) => {
    const hours = Math.round(1 / p.storeFillRate.nitrate);
    let s = flora(p, 1, 0.5, 0);
    for (let t = 0; t < hours; t++) s = takeUp(s, storeRequest(s, p, 1));
    expect(NUTRIENTS.every((n) => near(storeFill(s, p)[n], 1 - Math.exp(-1)))).toBe(true);
  });

  it('adds what the pools delivered to the stores', () => {
    const s = flora(sword, 2, 0.5, 0.2);
    const delivered = { nitrate: 3, phosphate: 0.2, potassium: 1, iron: 0.01 };
    const after = takeUp(s, delivered);
    expect(NUTRIENTS.every((n) => near(after.stores[n] - s.stores[n], delivered[n], s.stores[n]))).toBe(true);
    expect({ ...after, stores: s.stores }).toEqual(s);
  });
});

describe('offshoots', () => {
  const unit = 0.8;
  const parent = (o: Partial<FloraState> = {}): FloraState => ({
    ...flora(sword, 3, 0.7, 0.5),
    offshootBuffer: unit * (1 + 1e-9),
    ...o,
  });

  it('build their tissue in the buffer at [E_G] as the 1 − κ share flows in, the overhead burned as it lands', () => {
    const s = flora(sword, 2, 0.9, 1);
    const { state, fluxes } = stepFlora(s, sword, { offered: sword.pAm * s.structure, tau: 1, omega: 1, room: 0 });
    expect(fluxes.toStructure).toBe(0);
    expect(state.offshootBuffer).toBeGreaterThan(0);
    expectNear(fluxes.burned.growth, (sword.EG - 1) * state.offshootBuffer);
    expectNear(fluxes.mobilised, fluxes.burned.maintenance + sword.EG * state.offshootBuffer);
  });

  it('are ready once the buffer holds a unit’s tissue and every store its Q_min', () => {
    expect(offshootReady(parent(), sword, unit)).toBe(true);
    expect(offshootReady(parent({ offshootBuffer: unit * (1 - 1e-9) }), sword, unit)).toBe(false);
    const lean = parent();
    expect(
      NUTRIENTS.every(
        (n) =>
          !offshootReady({ ...lean, stores: { ...lean.stores, [n]: sword.qMin[n] * unit * (1 - 1e-9) } }, sword, unit)
      )
    ).toBe(true);
    expect(buyOffshoot(parent({ offshootBuffer: 0 }), sword, unit)).toBeNull();
  });

  it('are cut loose with their share of the reserve and of the stores past their Q_min, parent and offshoot at one density of both, burning nothing', () => {
    const before = parent();
    const bought = buyOffshoot(before, sword, unit);
    expect(bought).not.toBeNull();
    const { parent: after, offshoot } = bought!;

    expect(offshoot.structure).toBe(unit);
    expectNear(reserveDensity(offshoot, sword), reserveDensity(after, sword));
    expectNear(reserveDensity(offshoot, sword), (reserveDensity(before, sword) * before.structure) / (before.structure + unit));
    for (const n of NUTRIENTS) {
      expectNear(storeFill(offshoot, sword)[n], storeFill(after, sword)[n]);
      expectNear(offshoot.stores[n] + after.stores[n], before.stores[n] - sword.qMin[n] * unit);
    }
    expect(droopFactor(offshoot, sword)).toBeGreaterThan(0);
    expect(offshoot.offshootBuffer).toBe(0);
    expect(after.structure).toBe(before.structure);

    expectNear(floraOrganics(before), floraOrganics(after) + floraOrganics(offshoot));
    const held = [before, after, offshoot].map((s) => nutrientsHeld(s, sword));
    expect(NUTRIENTS.every((n) => near(held[0][n], held[1][n] + held[2][n]))).toBe(true);
  });

});

describe('tissue as organics', () => {
  it('sheds structure as waste at Q_min with its reserve at the unit’s density, and keeps its store', () => {
    const s = flora(sword, 2, 0.6, 0.7, { offshootBuffer: 0.1 });
    const { state, waste } = shed(s, sword, 0.3);
    expectNear(state.structure, 1.7);
    expectNear(reserveDensity(state, sword), reserveDensity(s, sword));
    expect(state.stores).toEqual(s.stores);
    expect(state.offshootBuffer).toBe(s.offshootBuffer);
    expect(NUTRIENTS.every((n) => near(waste.nutrients[n], sword.qMin[n] * 0.3))).toBe(true);
    expectNear(floraOrganics(s), floraOrganics(state) + waste.grams);
  });

  it('takes photosynthate in on the first lit hour after a shed', () => {
    const { state } = shed(flora(sword, 2, 1), sword, 0.6);
    expect(stepFlora(state, sword, { offered: 2 * sword.pAm, tau: 1, omega: 1, room: 1 }).fluxes.assimilated).toBeGreaterThan(0);
  });

  it.each(KINDS)('leaves everything $name held when it dies: its tissue as waste, its stores to the water', ({ p }) => {
    const s = flora(p, 1.5, 0.6, 0.4, { offshootBuffer: 0.2 });
    const { waste, leachate } = remains(s, p);
    expectNear(waste.grams, floraOrganics(s));
    expect(NUTRIENTS.every((n) => near(waste.nutrients[n], p.qMin[n] * s.structure))).toBe(true);
    expect(leachate).toEqual(s.stores);
  });
});

describe('readings', () => {
  it('reads reserve density and well-fed as the fish does', () => {
    expectNear(reserveDensity(flora(sword, 2, 0.4), sword), 0.4);
    expect(wellFed(flora(sword, 2, 1.5), sword)).toBe(1);
  });

  it('reads each store’s fill against its headroom over Q_min', () => {
    const fill = { nitrate: 0.1, phosphate: 0.5, potassium: 1, iron: 0 };
    const read = storeFill(flora(film, 0.02, 0.5, fill), film);
    expect(NUTRIENTS.every((n) => near(read[n], fill[n], 1))).toBe(true);
  });
});

describe('a plant in the dark', () => {
  const hours = live(sword, flora(sword, 2.8, 1), 40 * DAY, dark());
  const firstShort = hours.findIndex(({ fluxes }) => fluxes.shortfall > 0);
  const firstShrink = hours.findIndex(({ fluxes }) => fluxes.fromStructure > 0);
  const peak = most(hours.map(({ state }) => state.structure));

  it('lives on its reserve, growing on it, for longer than the reserve takes to turn over before it runs short', () => {
    expect(firstShort).toBeGreaterThan(1 / sword.v);
    expect(falling(hours.map(({ state }) => state.reserve))).toBe(true);
    expect(hours[firstShort].before.structure).toBeGreaterThan(hours[0].before.structure);
  });

  it('then draws its buffer before its structure, and melts no faster than its maintenance', () => {
    expect(firstShrink).toBeGreaterThan(firstShort);
    expect(hours.findIndex(({ state, fluxes }) => fluxes.fromStructure > 0 && state.offshootBuffer > 0)).toBe(-1);
    expect(last(hours).state.structure).toBeLessThan(peak);
    const melting = hours
      .slice(firstShrink)
      .every(({ before, state }) => before.structure - state.structure <= sword.pM * before.structure * (1 + 1e-12));
    expect(melting).toBe(true);
  });
});

describe('a plant in lean water on full stores', () => {
  const days = 20;
  const hours = live(sword, flora(sword, 1, 0.5), days * DAY, photoperiod(sword, 12));
  const daily = Array.from(
    { length: days },
    (_, d) => hours[(d + 1) * DAY - 1].state.structure / hours[d * DAY].before.structure - 1
  );
  const headroom = (n: Nutrient): number => storeMax(sword, n) / sword.qMin[n];
  const ruling = NUTRIENTS.reduce((a, b) => (headroom(a) <= headroom(b) ? a : b));

  it('grows every day, by a smaller share of itself each day as its Droop limit bites once its reserve has filled', () => {
    expect(daily.every((grown) => grown > 0)).toBe(true);
    expect(falling(daily.slice(daily.indexOf(Math.max(...daily))))).toBe(true);
    const growing = hours.filter(({ before, state }) => state.structure > before.structure);
    expect(falling(growing.map(({ state }) => droopFactor(state, sword)))).toBe(true);
  });

  it('bites hardest on the nutrient it stores least of against its need', () => {
    const rules = hours.every(({ state }) =>
      near(droopFactor(state, sword), monodFactor(state.stores[ruling] / state.structure, sword.qMin[ruling]), 1)
    );
    expect(rules).toBe(true);
    const fill = storeFill(last(hours).state, sword);
    expect(NUTRIENTS.every((n) => n === ruling || fill[n] > fill[ruling])).toBe(true);
  });

  it('fills its reserve with the carbon it cannot spend', () => {
    expect(wellFed(last(hours).state, sword)).toBeGreaterThan(wellFed(hours[DAY].state, sword));
  });
});

describe('a bloom on κ = 1', () => {
  const hours = live(greenWater, flora(greenWater, 0.3, 0.5), 3 * DAY, photoperiod(greenWater, 10), true);

  it('fills no buffer: everything it spends past maintenance buys structure', () => {
    expect(hours.every(({ state }) => state.offshootBuffer === 0)).toBe(true);
    const spent = hours.every(({ fluxes }) =>
      near(fluxes.mobilised, fluxes.burned.maintenance + fluxes.toStructure + fluxes.burned.growth)
    );
    expect(spent).toBe(true);
    expect(last(hours).state.structure).toBeGreaterThan(hours[0].before.structure);
  });
});

describe('oxygen', () => {
  const s = flora(sword, 2, 0.8, 0.8);
  const hour = { offered: 0, tau: 1, room: 1 };

  it('slows mobilisation and growth as ω falls, the upkeep owed in full', () => {
    const full = stepFlora(s, sword, { ...hour, omega: 1 });
    const half = stepFlora(s, sword, { ...hour, omega: 0.5 });
    const none = stepFlora(s, sword, { ...hour, omega: 0 });
    expect(half.fluxes.mobilised).toBeLessThan(full.fluxes.mobilised);
    expect(none.fluxes.toStructure).toBe(0);
    for (const step of [full, half, none]) expect(step.fluxes.owed).toBeCloseTo(sword.pM * s.structure, 15);
  });

  it('heals at ω the repair asked of it', () => {
    const asked = 1e-4;
    const lit = { offered: sword.pAm * s.structure, tau: 1, room: 1, healing: asked };
    expect(stepFlora(s, sword, { ...lit, omega: 1 }).fluxes.burned.healing).toBeCloseTo(asked, 12);
    expect(stepFlora(s, sword, { ...lit, omega: 0.5 }).fluxes.burned.healing).toBeCloseTo(asked / 2, 12);
  });
});

describe('stress', () => {
  const s = flora(sword, 2, 0.6, 0.9);
  const hour = { offered: sword.pAm * s.structure, tau: 1, omega: 1, room: 1 };
  const stressed = (o: Partial<DebStress>): FloraStep => stepFlora(s, sword, { ...hour, stress: { ...NO_STRESS, ...o } });

  it('is none by default', () => {
    expect(stepFlora(s, sword, hour)).toEqual(stressed({}));
  });

  it('moves the flux each stress names, and leaves the assimilation ceiling to what offers the photosynthate', () => {
    const plain = stressed({}).fluxes;
    expectNear(stressed({ maintenance: 1.5 }).fluxes.owed, 1.5 * plain.owed);
    expect(stressed({ maintenance: 1.5 }).fluxes.burned.maintenance).toBeGreaterThan(plain.burned.maintenance);
    expect(stressed({ growthCost: 1.5 }).fluxes.toStructure).toBeLessThan(plain.toStructure);
    expect(stressed({ assimilation: 0.5 })).toEqual(stressed({}));
  });
});

describe('a share of a budget', () => {
  it('stocks a new unit fed and full: its reserve at E_m, every store at Q_max, nothing in the buffer', () => {
    const fresh = stocked(2, sword);
    expect(wellFed(fresh, sword)).toBeCloseTo(1, 15);
    expect(NUTRIENTS.every((n) => near(storeFill(fresh, sword)[n], 1))).toBe(true);
    expect(fresh.offshootBuffer).toBe(0);
  });

  it('scales every pool pro rata, so two shares make the whole', () => {
    const s = flora(sword, 3, 0.6, 0.4, { offshootBuffer: 0.2 });
    const [a, b] = [scaleFlora(s, 0.3), scaleFlora(s, 0.7)];
    expect(a.structure + b.structure).toBeCloseTo(s.structure, 15);
    expect(a.reserve + b.reserve).toBeCloseTo(s.reserve, 15);
    expect(a.offshootBuffer + b.offshootBuffer).toBeCloseTo(s.offshootBuffer, 15);
    expect(NUTRIENTS.every((n) => near(a.stores[n] + b.stores[n], s.stores[n]))).toBe(true);
    expect(reserveDensity(a, sword)).toBeCloseTo(reserveDensity(s, sword), 15);
  });
});
