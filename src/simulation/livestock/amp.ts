import type { DebParams } from '../systems/deb.js';

/** A species' DEB parameters as its Add-my-Pet Parameters page lists them, in AmP's units at T_ref 20 °C. */
export interface AmpEntry {
  entry: string;
  model: 'std';
  source: { kind: 'amp'; citation: string } | { kind: 'proxy'; of: string };
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
  /** J */
  E_0: number;
  /** cm, structural */
  L_b: number;
}

const HOURS_PER_DAY = 24;
const MU_V = 500_000;
const W_V = 23.9;

/** Share of a cohort on unlimited food at 20 °C still alive at the species lifespan: the lifespan is a median. */
export const LIFESPAN_SURVIVAL = 0.5;

const ultimateLength = (e: Pick<AmpEntry, 'kap' | 'p_Am' | 'p_M'>): number => (e.kap * e.p_Am) / e.p_M;

const investmentRatio = (e: Pick<AmpEntry, 'E_G' | 'v' | 'kap' | 'p_Am'>): number => (e.E_G * e.v) / (e.kap * e.p_Am);

export function fromAmP(entry: AmpEntry): DebParams {
  const gramsPerJoule = entry.w_E / entry.mu_E;
  return {
    pAm: (entry.p_Am * gramsPerJoule) / HOURS_PER_DAY,
    v: entry.v / HOURS_PER_DAY,
    kappa: entry.kap,
    kappaX: entry.kap_X,
    kappaR: entry.kap_R,
    kappaG: (MU_V * entry.d_V) / (W_V * entry.E_G),
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
  };
}

const betaPrimitive = (u: number): number =>
  -3 * u + Math.sqrt(3) * Math.atan((1 + 2 * u) / Math.sqrt(3)) - Math.log(1 - u) + Math.log(1 + u + u * u) / 2;

/** B_x(4/3, 0) = ∫₀ˣ t^⅓ / (1 − t) dt. */
const incompleteBeta = (x: number): number => betaPrimitive(Math.cbrt(x)) - betaPrimitive(0);

/** The reserve an egg needs to hatch at L_b with e = 1: the std embryo's closed form (Kooijman 2009, J Math Biol). */
function eggReserve(e: Pick<AmpEntry, 'p_Am' | 'v' | 'kap' | 'p_M' | 'E_G' | 'L_b'>): number {
  const g = investmentRatio(e);
  const xb = g / (1 + g);
  const lb = e.L_b / ultimateLength(e);
  return (e.E_G / e.kap) * ((3 * g * e.L_b) / (3 * g * Math.cbrt(xb) - lb * incompleteBeta(xb))) ** 3;
}

function integrate(slope: (t: number, y: number[]) => number[], y0: number[], until: number, steps: number): number[] {
  const dt = until / steps;
  const ahead = (y: number[], k: number[], h: number): number[] => y.map((yi, j) => yi + h * k[j]);
  let y = y0;
  for (let i = 0; i < steps; i++) {
    const t = i * dt;
    const k1 = slope(t, y);
    const k2 = slope(t + dt / 2, ahead(y, k1, dt / 2));
    const k3 = slope(t + dt / 2, ahead(y, k2, dt / 2));
    const k4 = slope(t + dt, ahead(y, k3, dt));
    y = y.map((yi, j) => yi + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
  }
  return y;
}

/**
 * The h_a that leaves LIFESPAN_SURVIVAL of a cohort alive at the lifespan, hatched and fed without limit at T_ref.
 * Wear load and hazard are linear in h_a, so DEB ageing integrated once at h_a = 1 along the von Bertalanffy
 * curve at e = 1 scales to it.
 */
function ageingAcceleration(e: AmpEntry, lifespanDays: number): number {
  const Lm = ultimateLength(e);
  const g = investmentRatio(e);
  const rB = (e.p_M * g) / (3 * e.E_G * (1 + g));
  const [, , cumulativeHazard] = integrate(
    (t, [q, h]) => {
      const L = Lm - (Lm - e.L_b) * Math.exp(-rB * t);
      const r = (3 * rB * (Lm - L)) / L;
      return [(e.s_G * (L / Lm) ** 3 * q + 1) * (e.v / L - r) - r * q, q - r * h, h];
    },
    [0, 0, 0],
    lifespanDays,
    Math.ceil(lifespanDays)
  );
  return -Math.log(LIFESPAN_SURVIVAL) / cumulativeHazard;
}

/**
 * A species without an entry: the base's zoom factor rescaled to the adult length, rates kept.
 * {p_Am} and L_b scale with z, the maturity thresholds with z³, and E_0 is the egg the zoomed hatchling implies.
 */
export function proxyEntry(base: AmpEntry, adultLengthCm: number, lifespanDays?: number): AmpEntry {
  const zoom = (base.del_M * adultLengthCm) / ultimateLength(base);
  const zoomed: AmpEntry = {
    ...base,
    source: { kind: 'proxy', of: base.entry },
    p_Am: base.p_Am * zoom,
    E_Hb: base.E_Hb * zoom ** 3,
    E_Hp: base.E_Hp * zoom ** 3,
    L_b: base.L_b * zoom,
  };
  const proxy: AmpEntry = { ...zoomed, E_0: eggReserve(zoomed) };
  return lifespanDays === undefined ? proxy : { ...proxy, h_a: ageingAcceleration(proxy, lifespanDays) };
}

const generalisedAnimal: Omit<AmpEntry, 'E_0'> = {
  entry: 'generalised animal',
  model: 'std',
  source: { kind: 'amp', citation: 'Kooijman 2010, Dynamic Energy Budget Theory, Table 8.1, z = 1' },
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
  L_b: 0.0726,
};

export const GENERALISED_ANIMAL: AmpEntry = { ...generalisedAnimal, E_0: eggReserve(generalisedAnimal) };
