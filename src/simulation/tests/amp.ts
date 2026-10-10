import { readEntry, type AmpEntry, type AmpParameters } from '../livestock/amp.js';
import { arrheniusFactor } from '../core/kinetics.js';

/** An embryo grown from E_0 on the budget as stated until maturity reaches E_Hb, at T_ref. */
export function incubate(p: AmpParameters): { days: number; L: number; e: number } {
  const { L_b } = readEntry(p);
  const dt = (3 * L_b) / p.v / 1e5;
  let [L, E, EH, days] = [1e-6 * L_b, p.E_0, 0, 0];
  while (EH < p.E_Hb) {
    const V = L ** 3;
    const density = E / V;
    const mobilised = (density * (p.E_G * p.v * L * L + p.p_M * V)) / (p.E_G + p.kap * density);
    [L, E, EH, days] = [
      L + ((p.kap * mobilised - p.p_M * V) / (3 * p.E_G * L * L)) * dt,
      E - mobilised * dt,
      EH + ((1 - p.kap) * mobilised - p.k_J * EH) * dt,
      days + dt,
    ];
  }
  return { days, L, e: E / ((p.p_Am / p.v) * L ** 3) };
}

interface Scaled {
  g: number;
  k: number;
  lb: number;
  sM: number;
  vHj: number;
  vHp: number;
  ha: number;
  sG: number;
  days: (t: number) => number;
}

/** AmP's dimensionless life-history groups for an entry fed without limit, time in units of 1 / k_M. */
function scaled({ parameters: p, typicalTemperatureC }: AmpEntry): Scaled {
  const g = (p.E_G * p.v) / (p.kap * p.p_Am);
  const kM = p.p_M / p.E_G;
  const Lm = (p.kap * p.p_Am) / p.p_M;
  const vH = (EH: number): number => EH / ((1 - p.kap) * g * (p.p_Am / p.v) * Lm ** 3);
  const { L_b, s_M } = readEntry(p);
  return {
    g,
    k: p.k_J / kM,
    lb: L_b / Lm,
    sM: s_M,
    vHj: vH(p.model === 'abj' ? p.E_Hj : p.E_Hb),
    vHp: vH(p.E_Hp),
    ha: p.h_a / kM ** 2,
    sG: p.s_G,
    days: (t: number): number => t / kM / arrheniusFactor(typicalTemperatureC, p.T_A),
  };
}

function rising(f: (x: number) => number, target: number): number {
  let hi = 1;
  while (f(hi) < target) {
    hi *= 2;
    if (hi === Infinity) throw new RangeError(`never rises to ${target}`);
  }
  let lo = 0;
  while (hi - lo > 1e-12 * hi) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Days from birth to puberty at the entry's typical temperature, as DEBtool's get_tj solves it: exponential growth
 * to metamorphosis, then maturity closed-form along the von Bertalanffy curve. AmP's pages predate get_tj's fix of
 * 2026-06-26 (commit 1e44ee1), which had read that closed form at the age at puberty rather than the time since
 * metamorphosis, so an accelerating entry's pages put puberty early.
 */
export function ampPubertyDays(entry: AmpEntry): number {
  const { g, k, lb, sM, vHj, vHp, days } = scaled(entry);
  const [lj, li] = [sM * lb, sM];
  const ld = li - lj;
  const rhoJ = (1 / lb - 1) / (1 + 1 / g);
  const rhoB = 1 / (3 * (1 + 1 / g));
  const b3 = 1 / (1 + g);
  const b2 = sM - b3 * li;
  const a = [
    (-(b2 + b3 * li) * li ** 2) / k,
    (-(2 * b2 + 3 * b3 * li) * li * ld) / (rhoB - k),
    ((b2 + 3 * b3 * li) * ld ** 2) / (2 * rhoB - k),
    (-b3 * ld ** 3) / (3 * rhoB - k),
  ];
  const sumA = a.reduce((total, ai) => total + ai, 0);
  const maturity = (t: number): number =>
    (vHj + sumA) * Math.exp(-k * t) - a.reduce((total, ai, i) => total + ai * Math.exp(-i * rhoB * t), 0);
  return days((3 * Math.log(sM)) / rhoJ + rising(maturity, vHp));
}

/**
 * Mean age at death fed without limit at the entry's typical temperature, along the engine's path: adult rates from
 * L_b, wear and hazard integrated as get_tm_mod's std branch does; the embryo's age added.
 */
export function ampMeanLifespanDays(entry: AmpEntry): number {
  const { g, ha, sG, sM, lb, days } = scaled(entry);
  const lbAdult = lb / sM;
  const rhoB = 1 / (3 * (1 + 1 / g));
  const slope = (t: number, [q, h, H]: number[]): number[] => {
    const l = 1 - (1 - lbAdult) * Math.exp(-rhoB * t);
    const r = 3 * rhoB * (1 / l - 1);
    return [(q * l ** 3 * sG + ha) * (g / l - r) - r * q, q - r * h, h, Math.exp(-H)];
  };
  const dt = 1e-2;
  let [t, y] = [0, [0, 0, 0, 0]];
  while (Math.exp(-y[2]) > 1e-12) {
    const ahead = (k: number[], h: number): number[] => y.map((yi, j) => yi + h * k[j]);
    const k1 = slope(t, y);
    const k2 = slope(t + dt / 2, ahead(k1, dt / 2));
    const k3 = slope(t + dt / 2, ahead(k2, dt / 2));
    const k4 = slope(t + dt, ahead(k3, dt));
    y = y.map((yi, j) => yi + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    t += dt;
  }
  return entry.implied.a_b + days(y[3]);
}

/**
 * Mean age at death as AmP's predict files compute a_m, by DEBtool's get_tm_s: the fish held at its ultimate size
 * from birth, Weibull ageing bent by Gompertz stress.
 */
export function ampFullGrownLifespanDays(entry: AmpEntry): number {
  const { g, ha, sG, days } = scaled(entry);
  const hW = Math.cbrt((ha * g) / 6);
  const tG = (sG * g) / hW;
  const survival = (t: number): number => {
    const x = tG * t;
    if (tG < 0) return Math.exp(((1 + x + x * x / 2 - Math.exp(x)) * 6) / tG ** 3);
    let [term, total] = [1, 1];
    for (let n = 4; term > 1e-17 * total; n++) total += term *= x / n;
    return Math.exp(-total * t ** 3);
  };
  const dt = 1e-4;
  let mean = 0;
  for (let t = dt / 2; survival(t) > 1e-14; t += dt) mean += survival(t) * dt;
  return days(mean / hW);
}
