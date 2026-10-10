import type { DebParams } from '../systems/deb.js';
import { arrheniusFactor } from '../core/kinetics.js';

/**
 * A species' DEB parameters in AmP's units at T_ref 20 °C: the primaries its Add-my-Pet Parameters page lists,
 * and E_0 and L_b, which they imply.
 */
export interface AmpEntry {
  entry: string;
  model: 'std';
  source: { kind: 'amp'; citation: string } | { kind: 'typical'; citation: string } | { kind: 'proxy'; of: string };
  /** J/d·cm² */
  p_Am: number;
  /** cm/d */
  v: number;
  kap: number;
  kap_X: number;
  kap_R: number;
  /** J/d·cm³ */
  p_M: number;
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
  del_M: number;
  /** g/cm³ */
  d_V: number;
  /** J/mol */
  mu_E: number;
  /** g/mol */
  w_E: number;
  /** J/mol */
  mu_V: number;
  /** g/mol */
  w_V: number;
  /** J */
  E_0: number;
  /** cm, structural */
  L_b: number;
}

/** What a keeper knows of a species: its name, the female's adult size, and her ages in mid-range water. */
export interface HobbyFigures {
  entry: string;
  adultLengthCm: number;
  adultMassGrams: number;
  maturityAgeDays: number;
  lifespanDays: number;
  temperatureC: number;
}

type Primaries = Omit<AmpEntry, 'E_0' | 'L_b'>;

export const HOURS_PER_DAY = 24;

/** Share of a cohort fed without limit still alive at the species lifespan: the lifespan is a median. */
export const LIFESPAN_SURVIVAL = 0.5;

const maxStructuralLength = (e: Pick<AmpEntry, 'kap' | 'p_Am' | 'p_M'>): number => (e.kap * e.p_Am) / e.p_M;

const maxReserveDensity = (e: Pick<AmpEntry, 'p_Am' | 'v'>): number => e.p_Am / e.v;

const investmentRatio = (e: Pick<AmpEntry, 'E_G' | 'v' | 'kap' | 'p_Am'>): number => (e.E_G * e.v) / (e.kap * e.p_Am);

export function fromAmP(entry: AmpEntry): DebParams {
  const gramsPerJoule = entry.w_E / entry.mu_E;
  return {
    pAm: (entry.p_Am * gramsPerJoule) / HOURS_PER_DAY,
    v: entry.v / HOURS_PER_DAY,
    kappa: entry.kap,
    kappaX: entry.kap_X,
    kappaR: entry.kap_R,
    kappaG: (entry.mu_V * entry.d_V) / (entry.w_V * entry.E_G),
    pM: (entry.p_M * gramsPerJoule) / HOURS_PER_DAY,
    kJ: entry.k_J / HOURS_PER_DAY,
    EG: entry.E_G * gramsPerJoule,
    EHb: entry.E_Hb * gramsPerJoule,
    EHp: entry.E_Hp * gramsPerJoule,
    ha: entry.h_a / HOURS_PER_DAY ** 2,
    sG: entry.s_G,
    TA: entry.T_A,
    dV: entry.d_V,
    E0: entry.E_0 * gramsPerJoule,
    Lb: entry.L_b,
    delM: entry.del_M,
  };
}

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

const betaPrimitive = (u: number): number =>
  -3 * u + Math.sqrt(3) * Math.atan((1 + 2 * u) / Math.sqrt(3)) - Math.log(1 - u) + Math.log(1 + u + u * u) / 2;

/** B_x(4/3, 0) = ∫₀ˣ t^⅓ / (1 − t) dt, read at u = x^⅓. */
const incompleteBeta = (u: number): number => betaPrimitive(u) - betaPrimitive(0);

/**
 * L_b and E_0 of a std embryo born at e = 1, as AmP's get_lb finds them (Kooijman 2009, J Math Biol): along
 * u = (g / (g + e))^⅓ the embryo's scaled length is closed-form in l_b, so a bisection on l_b integrates its maturity
 * to E_Hb at birth.
 */
function withEgg(e: Primaries): AmpEntry {
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
  let [lo, hi] = [0, Math.min(1, (3 * g * ub) / Bb)];
  while (hi - lo > 1e-12 * hi) {
    const mid = (lo + hi) / 2;
    if (maturityAtBirth(mid) < e.E_Hb) lo = mid;
    else hi = mid;
  }
  const lb = (lo + hi) / 2;
  return { ...e, L_b: lb * Lm, E_0: g * scale * lengthPerU(lb)(0) ** 3 };
}

/** Structural length and specific growth rate t days after birth, fed without limit at T_ref. */
function feastGrowth(e: AmpEntry): (t: number) => { L: number; r: number } {
  const Lm = maxStructuralLength(e);
  const g = investmentRatio(e);
  const rB = (e.p_M * g) / (3 * e.E_G * (1 + g));
  return (t) => {
    const L = Lm - (Lm - e.L_b) * Math.exp(-rB * t);
    return { L, r: (3 * rB * (Lm - L)) / L };
  };
}

/** Days from birth to puberty, fed without limit at T_ref. */
function pubertyAge(e: AmpEntry): number {
  const Lm = maxStructuralLength(e);
  if ((1 - e.kap) * e.p_Am * Lm ** 2 <= e.k_J * e.E_Hp) {
    throw new RangeError(`${e.entry} never reaches puberty: E_Hp is beyond what its 1 − κ share can upkeep`);
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
 * The h_a that leaves LIFESPAN_SURVIVAL of a cohort alive at the lifespan, hatched and fed without limit at T_ref.
 * Wear load and hazard are linear in h_a, so DEB ageing integrated once at h_a = 1 along the von Bertalanffy
 * curve at e = 1 scales to it.
 */
function ageingAcceleration(e: AmpEntry, lifespanDays: number): number {
  const Lm = maxStructuralLength(e);
  const growth = feastGrowth(e);
  const [, , cumulativeHazard] = integrate(
    (t, [q, h]) => {
      const { L, r } = growth(t);
      return [(e.s_G * (L / Lm) ** 3 * q + 1) * (e.v / L - r) - r * q, q - r * h, h];
    },
    [0, 0, 0],
    lifespanDays,
    Math.ceil(lifespanDays)
  );
  return -Math.log(LIFESPAN_SURVIVAL) / cumulativeHazard;
}

/** The L_m at which the zoomed base weighs `mass` grown at e = 1: L³ + c·L⁴ = mass, by Newton from above. */
function grownLength(base: AmpEntry, mass: number): number {
  const c = (maxReserveDensity(base) * (base.w_E / base.mu_E)) / (base.d_V * maxStructuralLength(base));
  const newton = (L: number): number => L - (L ** 3 + c * L ** 4 - mass) / (3 * L ** 2 + 4 * c * L ** 3);
  let L = Math.cbrt(mass);
  for (let next = newton(L); next < L; next = newton(L)) L = next;
  return L;
}

/**
 * A species without an entry: its closest relative's parameters rescaled by the keeper's figures. Adult length and
 * weight fix the zoom and the shape, maturity age a pace that rescales time alone, lifespan h_a; both ages are read
 * at `temperatureC`.
 */
export function proxyEntry(base: AmpEntry, figures: HobbyFigures): AmpEntry {
  const { entry, ...numbers } = figures;
  for (const [name, value] of Object.entries(numbers)) {
    if (!(Number.isFinite(value) && value > 0)) {
      throw new RangeError(`${entry}: ${name} must be finite and positive, not ${value}`);
    }
  }
  const { adultLengthCm, adultMassGrams, maturityAgeDays, lifespanDays, temperatureC } = numbers;
  const Lm = grownLength(base, adultMassGrams);
  const delM = Lm / adultLengthCm;
  if (!(delM > 0 && delM < 1)) {
    throw new RangeError(`${entry}: ${adultMassGrams} g at ${adultLengthCm} cm makes δ_M ${delM}, outside (0, 1)`);
  }
  const zoom = Lm / maxStructuralLength(base);
  const zoomed = withEgg({
    ...base,
    entry,
    source: { kind: 'proxy', of: base.entry },
    p_Am: base.p_Am * zoom,
    E_Hb: base.E_Hb * zoom ** 3,
    E_Hp: base.E_Hp * zoom ** 3,
    del_M: delM,
  });
  const tau = arrheniusFactor(temperatureC, base.T_A);
  const pace = pubertyAge(zoomed) / (maturityAgeDays * tau);
  const paced: AmpEntry = {
    ...zoomed,
    p_Am: zoomed.p_Am * pace,
    v: zoomed.v * pace,
    p_M: zoomed.p_M * pace,
    k_J: zoomed.k_J * pace,
  };
  return { ...paced, h_a: ageingAcceleration(paced, lifespanDays * tau) };
}

export const GENERALISED_ANIMAL: AmpEntry = withEgg({
  entry: 'generalised animal',
  model: 'std',
  source: {
    kind: 'typical',
    citation:
      'Kooijman 2010, Dynamic Energy Budget Theory, Table 8.1 at z = 1; δ_M 0.2 arbitrary; chemistry at AmP defaults',
  },
  p_Am: 22.5,
  v: 0.02,
  kap: 0.8,
  kap_X: 0.8,
  kap_R: 0.95,
  p_M: 18,
  k_J: 0.002,
  E_G: 2800,
  E_Hb: 0.275,
  E_Hp: 166,
  h_a: 1e-6,
  s_G: 1e-4,
  T_A: 8000,
  del_M: 0.2,
  d_V: 0.1,
  mu_E: 550_000,
  w_E: 23.9,
  mu_V: 500_000,
  w_V: 23.9,
});
