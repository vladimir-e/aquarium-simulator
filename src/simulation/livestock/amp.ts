import type { DebParams } from '../systems/deb.js';
import { arrheniusFactor } from '../core/kinetics.js';

/** The primary parameters an Add-my-Pet Parameters page lists, at T_ref 20 °C. */
interface Primaries {
  /** J/d·cm² */
  p_Am: number;
  /** l/d·cm² */
  F_m: number;
  kap_X: number;
  kap_P: number;
  /** cm/d */
  v: number;
  kap: number;
  kap_R: number;
  /** J/d·cm³ */
  p_M: number;
  /** J/d·cm² */
  p_T: number;
  /** 1/d */
  k_J: number;
  /** J/cm³ */
  E_G: number;
  /** J */
  E_Hb: number;
  /** J */
  E_Hp: number;
  /** 1/d² */
  h_a: number;
  s_G: number;
  /** K */
  T_A: number;
}

/** std, or abj: {p_Am} and v grow with length from birth until maturity reaches E_Hj (J), metamorphosis. */
type Model = { model: 'std' } | { model: 'abj'; E_Hj: number };

interface Body {
  del_M: number;
  /** g/cm³ */
  d_V: number;
  /** g/cm³ */
  d_E: number;
  /** J/mol */
  mu_V: number;
  /** J/mol */
  mu_E: number;
  /** g/mol */
  w_V: number;
  /** g/mol */
  w_E: number;
}

type Unlaid = Primaries & Model & Body;

/** A DEB parameter set as Add-my-Pet states it, and E_0 (J), an egg's initial reserve. */
export type AmpParameters = Unlaid & { E_0: number };

/** What AmP's statistics imply at the entry's typical temperature on abundant food. */
export interface ImpliedTraits {
  /** d */
  a_b: number;
  /** d */
  a_p: number;
  /** g */
  Ww_b: number;
  /** g */
  Ww_i: number;
  s_M?: number;
}

export interface ZeroVariate {
  observed: number;
  predicted: number;
  unit: string;
  description: string;
  reference: string;
  temperatureC?: number;
}

/** One Add-my-Pet entry, transcribed from its four pages; its E_0 is the one its statistics imply. */
export interface AmpEntry {
  entry: string;
  url: string;
  fetched: string;
  complete: number;
  mre: number;
  typicalTemperatureC: number;
  parameters: AmpParameters;
  specific: Readonly<Record<string, number>>;
  implied: ImpliedTraits;
  zeroVariate: Readonly<Partial<Record<string, ZeroVariate>>>;
  citation: readonly string[];
}

/**
 * A budget as the engine runs it, in AmP's units at T_ref: a std budget hatched at L_b (cm, structural), an abj
 * entry's {p_Am} and v read at their adult values, s_M times those at birth.
 */
export type AmpReading = Pick<
  Primaries,
  'p_Am' | 'v' | 'kap' | 'kap_X' | 'kap_R' | 'p_M' | 'k_J' | 'E_G' | 'E_Hb' | 'E_Hp' | 'h_a' | 's_G' | 'T_A'
> &
  Omit<Body, 'd_E'> & { E_0: number; L_b: number; s_M: number };

/** A female in a keeper's terms: her adult size, and her ages from birth at `temperatureC`. */
export interface HobbyFigures {
  adultLengthCm: number;
  adultMassGrams: number;
  maturityAgeDays: number;
  lifespanDays: number;
  temperatureC: number;
}

export const HOURS_PER_DAY = 24;

/** Share of a cohort fed without limit still alive at the species lifespan: the lifespan is a median. */
export const LIFESPAN_SURVIVAL = 0.5;

/** How far an entry's predicted ultimate weight and length may sit from what was observed for it to be trusted. */
export const FIT_FACTOR = 2;

type Rates = Pick<Primaries, 'p_Am' | 'v' | 'kap' | 'p_M' | 'k_J' | 'E_G'>;

const maxStructuralLength = (e: Pick<Rates, 'kap' | 'p_Am' | 'p_M'>): number => (e.kap * e.p_Am) / e.p_M;

const maxReserveDensity = (e: Pick<Rates, 'p_Am' | 'v'>): number => e.p_Am / e.v;

const investmentRatio = (e: Pick<Rates, 'E_G' | 'v' | 'kap' | 'p_Am'>): number => (e.E_G * e.v) / (e.kap * e.p_Am);

/** v_H: maturity scaled by (1 − κ)·g·[E_m]·L_m³, the form AmP's life-stage solvers take. */
const scaledMaturity = (e: Rates, maturity: number): number =>
  maturity / ((1 - e.kap) * investmentRatio(e) * maxReserveDensity(e) * maxStructuralLength(e) ** 3);

type Slope = (t: number, y: number[]) => number[];

function rk4Step(slope: Slope, t: number, y: number[], dt: number): number[] {
  const ahead = (k: number[], h: number): number[] => y.map((yi, j) => yi + h * k[j]);
  const k1 = slope(t, y);
  const k2 = slope(t + dt / 2, ahead(k1, dt / 2));
  const k3 = slope(t + dt / 2, ahead(k2, dt / 2));
  const k4 = slope(t + dt, ahead(k3, dt));
  return y.map((yi, j) => yi + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
}

function integrate(slope: Slope, y0: number[], until: number, steps: number): number[] {
  const dt = until / steps;
  let y = y0;
  for (let i = 0; i < steps; i++) y = rk4Step(slope, i * dt, y, dt);
  return y;
}

/** The x in [lo, hi] where an increasing `f` crosses zero. */
function bisect(f: (x: number) => number, lo: number, hi: number): number {
  while (hi - lo > 1e-12 * hi) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const betaPrimitive = (u: number): number =>
  -3 * u + Math.sqrt(3) * Math.atan((1 + 2 * u) / Math.sqrt(3)) - Math.log(1 - u) + Math.log(1 + u + u * u) / 2;

/** B_x(4/3, 0) = ∫₀ˣ t^⅓ / (1 − t) dt, read at u = x^⅓. */
const incompleteBeta = (u: number): number => betaPrimitive(u) - betaPrimitive(0);

/**
 * L_b and E_0 of a std embryo born at e = 1, as AmP's get_lb finds them (Kooijman 2009, J Math Biol): along
 * u = (g / (g + e))^⅓ the embryo's scaled length is closed-form in l_b, so a bisection on l_b integrates its maturity
 * to E_Hb at birth. An abj embryo is a std one: acceleration starts at birth.
 */
function birth(e: Rates & Pick<Primaries, 'E_Hb'>): { L_b: number; E_0: number } {
  const g = investmentRatio(e);
  const k = (e.k_J * e.E_G) / e.p_M;
  const Lm = maxStructuralLength(e);
  const scale = maxReserveDensity(e) * Lm ** 3;
  const ub = Math.cbrt(g / (1 + g));
  const Bb = incompleteBeta(ub);
  const lengthPerU = (lb: number) => (u: number): number => 1 / (ub / lb - (Bb - incompleteBeta(u)) / (3 * g));
  const maturityAtBirth = (lb: number): number => {
    const perU = lengthPerU(lb);
    const [maturity] = integrate(
      (u, [m]) => {
        const lu = perU(u);
        return [3 * ((1 - e.kap) * u * u * lu ** 3 * (g + u * lu) - (k * m * lu) / (g * (1 - u ** 3)))];
      },
      [0],
      ub,
      200
    );
    return maturity * scale;
  };
  const lb = bisect((lb) => maturityAtBirth(lb) - e.E_Hb, 0, Math.min(1, (3 * g * ub) / Bb));
  return { L_b: lb * Lm, E_0: g * scale * lengthPerU(lb)(0) ** 3 };
}

const withEgg = (e: Unlaid): AmpParameters => ({ ...e, E_0: birth(e).E_0 });

const MAX_ACCELERATION = 500;

/**
 * s_M = L_j / L_b fed without limit, as AmP's get_lj solves it: while {p_Am} and v grow with L / L_b, structure grows
 * exponentially at a constant rate and maturity is closed-form in s_M, so a bisection finds where it reaches E_Hj.
 */
function accelerationFactor(e: Unlaid, L_b: number): number {
  if (e.model === 'std') return 1;
  const g = investmentRatio(e);
  const k = (e.k_J * e.E_G) / e.p_M;
  const lb = L_b / maxStructuralLength(e);
  const rj = (1 / lb - 1) / (1 + 1 / g);
  const [vHb, vHj] = [scaledMaturity(e, e.E_Hb), scaledMaturity(e, e.E_Hj)];
  const decay = -(3 * k) / rj;
  const excess = (sM: number): number =>
    ((lb ** 3 * (1 / lb - rj / g)) / (k + rj)) * (sM ** 3 - sM ** decay) - vHj + vHb * sM ** decay;
  if (!(excess(MAX_ACCELERATION) > 0)) {
    throw new RangeError(`E_Hj ${e.E_Hj} J is beyond a metamorphosis within s_M ${MAX_ACCELERATION}`);
  }
  return bisect(excess, 1, MAX_ACCELERATION);
}

/**
 * The std budget the engine runs on `e`: hatched at the L_b its E_Hb sets, an abj budget's {p_Am} and v at their
 * adult values from birth on.
 */
export function readEntry(e: AmpParameters): AmpReading {
  if (e.p_T !== 0) throw new RangeError(`{p_T} is ${e.p_T}: the engine's budget has no heating cost`);
  if (e.d_E !== e.d_V) {
    throw new RangeError(`d_E ${e.d_E} differs from d_V ${e.d_V}: the engine weighs reserve as structure`);
  }
  const { L_b } = birth(e);
  const s_M = accelerationFactor(e, L_b);
  return {
    p_Am: e.p_Am * s_M,
    v: e.v * s_M,
    kap: e.kap,
    kap_X: e.kap_X,
    kap_R: e.kap_R,
    p_M: e.p_M,
    k_J: e.k_J,
    E_G: e.E_G,
    E_Hb: e.E_Hb,
    E_Hp: e.E_Hp,
    h_a: e.h_a,
    s_G: e.s_G,
    T_A: e.T_A,
    del_M: e.del_M,
    d_V: e.d_V,
    mu_E: e.mu_E,
    w_E: e.w_E,
    mu_V: e.mu_V,
    w_V: e.w_V,
    E_0: e.E_0,
    L_b,
    s_M,
  };
}

export function fromAmP(parameters: AmpParameters): DebParams {
  const e = readEntry(parameters);
  const gramsPerJoule = e.w_E / e.mu_E;
  return {
    pAm: (e.p_Am * gramsPerJoule) / HOURS_PER_DAY,
    v: e.v / HOURS_PER_DAY,
    kappa: e.kap,
    kappaX: e.kap_X,
    kappaR: e.kap_R,
    kappaG: (e.mu_V * e.d_V) / (e.w_V * e.E_G),
    pM: (e.p_M * gramsPerJoule) / HOURS_PER_DAY,
    kJ: e.k_J / HOURS_PER_DAY,
    EG: e.E_G * gramsPerJoule,
    EHb: e.E_Hb * gramsPerJoule,
    EHp: e.E_Hp * gramsPerJoule,
    ha: e.h_a / HOURS_PER_DAY ** 2,
    sG: e.s_G,
    TA: e.T_A,
    dV: e.d_V,
    E0: e.E_0 * gramsPerJoule,
    Lb: e.L_b,
    delM: e.del_M,
  };
}

/** Whether an entry's predicted ultimate weight, and length where observed, sit within FIT_FACTOR of its data. */
export function entryFitsItsData({ zeroVariate: { Wwi, Li } }: AmpEntry): boolean {
  const fits = (data: ZeroVariate | undefined): boolean =>
    data !== undefined && Math.abs(Math.log(data.predicted / data.observed)) <= Math.log(FIT_FACTOR);
  return fits(Wwi) && (Li === undefined || fits(Li));
}

/** Structural length and specific growth rate t days after birth, fed without limit at T_ref. */
function feastGrowth(e: AmpReading): (t: number) => { L: number; r: number } {
  const Lm = maxStructuralLength(e);
  const g = investmentRatio(e);
  const rB = (e.p_M * g) / (3 * e.E_G * (1 + g));
  return (t) => {
    const L = Lm - (Lm - e.L_b) * Math.exp(-rB * t);
    return { L, r: (3 * rB * (Lm - L)) / L };
  };
}

/** Days from birth to puberty, fed without limit at T_ref. */
function pubertyAge(e: AmpReading): number {
  const Lm = maxStructuralLength(e);
  if ((1 - e.kap) * e.p_Am * Lm ** 2 <= e.k_J * e.E_Hp) {
    throw new RangeError(`E_Hp ${e.E_Hp} J is beyond what the 1 − κ share can upkeep: never reaches puberty`);
  }
  const growth = feastGrowth(e);
  const Em = maxReserveDensity(e);
  const slope: Slope = (t, [EH]) => {
    const { L, r } = growth(t);
    return [(1 - e.kap) * Em * L ** 3 * (e.v / L - r) - e.k_J * EH];
  };
  let [t, EH] = [0, e.E_Hb];
  for (;;) {
    const [next] = rk4Step(slope, t, [EH], 1);
    if (next >= e.E_Hp) return t + (e.E_Hp - EH) / (next - EH);
    [t, EH] = [t + 1, next];
  }
}

/**
 * DEB ageing hatched and fed without limit at T_ref, integrated at h_a = 1 along the von Bertalanffy curve at e = 1:
 * wear load and hazard are linear in h_a, so the cumulative hazard at any h_a is h_a times the last component.
 */
function unitAgeing(e: AmpReading): Slope {
  const Lm = maxStructuralLength(e);
  const growth = feastGrowth(e);
  return (t, [q, h]) => {
    const { L, r } = growth(t);
    return [(e.s_G * (L / Lm) ** 3 * q + 1) * (e.v / L - r) - r * q, q - r * h, h];
  };
}

const LIFESPAN_HAZARD = -Math.log(LIFESPAN_SURVIVAL);

/** The h_a that leaves LIFESPAN_SURVIVAL of a cohort alive at the lifespan, hatched and fed without limit at T_ref. */
function ageingAcceleration(e: AmpReading, lifespanDays: number): number {
  const [, , cumulativeHazard] = integrate(unitAgeing(e), [0, 0, 0], lifespanDays, Math.ceil(lifespanDays));
  return LIFESPAN_HAZARD / cumulativeHazard;
}

/** Days from birth until LIFESPAN_SURVIVAL of a cohort fed without limit at T_ref is left. */
function medianLifespan(e: AmpReading): number {
  if (!(e.h_a > 0)) throw new RangeError(`h_a ${e.h_a} never ages a cohort`);
  const slope = unitAgeing(e);
  let [t, y] = [0, [0, 0, 0]];
  for (;;) {
    const next = rk4Step(slope, t, y, 1);
    const [before, after] = [y[2], next[2]].map((hazard) => e.h_a * hazard);
    if (after >= LIFESPAN_HAZARD) return t + (LIFESPAN_HAZARD - before) / (after - before);
    [t, y] = [t + 1, next];
  }
}

/** What a budget makes of a female fed without limit, in a keeper's terms at `temperatureC`; ages count from birth. */
export function impliedFigures(parameters: AmpParameters, temperatureC: number): HobbyFigures {
  const adult = readEntry(parameters);
  const Lm = maxStructuralLength(adult);
  const tau = arrheniusFactor(temperatureC, adult.T_A);
  return {
    adultLengthCm: Lm / adult.del_M,
    adultMassGrams: Lm ** 3 * (1 + (maxReserveDensity(adult) * adult.w_E) / (adult.mu_E * adult.d_V)),
    maturityAgeDays: pubertyAge(adult) / tau,
    lifespanDays: medianLifespan(adult) / tau,
    temperatureC,
  };
}

/** The L with L³ + c·L⁴ = mass, by Newton from above. */
function grownLength(c: number, mass: number): number {
  const newton = (L: number): number => L - (L ** 3 + c * L ** 4 - mass) / (3 * L ** 2 + 4 * c * L ** 3);
  let L = Math.cbrt(mass);
  for (let next = newton(L); next < L; next = newton(L)) L = next;
  return L;
}

function scaleMaturity(e: AmpParameters, factor: number): AmpParameters {
  const scaled = { ...e, E_Hb: e.E_Hb * factor, E_Hp: e.E_Hp * factor };
  return e.model === 'abj' ? { ...scaled, model: 'abj', E_Hj: e.E_Hj * factor } : scaled;
}

const MAX_ZOOM_STEPS = 100;

/**
 * The base zoomed to an adult that weighs `mass` grown at e = 1, and that adult's L_m. Zoom scales {p_Am} by z and
 * every maturity threshold by z³, so [E_m] by z and the adult's L_m to s_M·z times the base's at birth; an abj
 * base's s_M moves with z, so z is iterated from the base's own s_M until the two agree.
 */
function zoomTo(base: AmpParameters, mass: number): { zoomed: AmpParameters; Lm: number } {
  const L0 = maxStructuralLength(base);
  const reserveWeight = (maxReserveDensity(base) * base.w_E) / (base.mu_E * base.d_V);
  let s_M = readEntry(base).s_M;
  for (let step = 0; step < MAX_ZOOM_STEPS; step++) {
    const Lm = grownLength(reserveWeight / (s_M * L0), mass);
    const zoom = Lm / (s_M * L0);
    const zoomed = { ...scaleMaturity(base, zoom ** 3), p_Am: base.p_Am * zoom };
    const next = readEntry(zoomed).s_M;
    if (Math.abs(next - s_M) <= 1e-12 * s_M) return { zoomed, Lm };
    s_M = next;
  }
  throw new RangeError(`no zoom grows the base to ${mass} g: its s_M does not settle`);
}

/**
 * A species without a usable entry: its closest relative's parameters rescaled by the keeper's figures. Adult length
 * and weight fix the zoom and the shape, maturity age a pace that rescales time alone, lifespan h_a; both ages are
 * read at `temperatureC`.
 */
export function proxyEntry(base: AmpParameters, figures: HobbyFigures): AmpParameters {
  for (const [name, value] of Object.entries(figures)) {
    if (!(Number.isFinite(value) && value > 0)) {
      throw new RangeError(`${name} must be finite and positive, not ${value}`);
    }
  }
  const { adultLengthCm, adultMassGrams, maturityAgeDays, lifespanDays, temperatureC } = figures;
  const { zoomed, Lm } = zoomTo(base, adultMassGrams);
  const delM = Lm / adultLengthCm;
  if (!(delM > 0 && delM < 1)) {
    throw new RangeError(`${adultMassGrams} g at ${adultLengthCm} cm makes δ_M ${delM}, outside (0, 1)`);
  }
  const shaped = withEgg({ ...zoomed, del_M: delM });
  const tau = arrheniusFactor(temperatureC, base.T_A);
  const pace = pubertyAge(readEntry(shaped)) / (maturityAgeDays * tau);
  const paced: AmpParameters = {
    ...shaped,
    p_Am: shaped.p_Am * pace,
    v: shaped.v * pace,
    p_M: shaped.p_M * pace,
    k_J: shaped.k_J * pace,
  };
  return { ...paced, h_a: ageingAcceleration(readEntry(paced), lifespanDays * tau) };
}

/**
 * Kooijman's typical values (Dynamic Energy Budget Theory 2010, Table 8.1 at z = 1); δ_M 0.2 arbitrary; chemistry at
 * AmP's defaults.
 */
export const GENERALISED_ANIMAL: AmpParameters = withEgg({
  model: 'std',
  p_Am: 22.5,
  F_m: 6.5,
  kap_X: 0.8,
  kap_P: 0.1,
  v: 0.02,
  kap: 0.8,
  kap_R: 0.95,
  p_M: 18,
  p_T: 0,
  k_J: 0.002,
  E_G: 2800,
  E_Hb: 0.275,
  E_Hp: 166,
  h_a: 1e-6,
  s_G: 1e-4,
  T_A: 8000,
  del_M: 0.2,
  d_V: 0.1,
  d_E: 0.1,
  mu_V: 500_000,
  mu_E: 550_000,
  w_V: 23.9,
  w_E: 23.9,
});
