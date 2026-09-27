/**
 * Molecular weights, the mass ratios derived from them, and the protons each
 * nitrogen process moves.
 *
 * These are measurements of the physical world, not tunables: nothing in
 * `config/` may restate one, and a system that converts between two compounds
 * converts through this module so the whole engine agrees on the arithmetic.
 *
 * A ratio named `X_TO_Y_MASS_RATIO` is the mass of Y per unit mass of X in a
 * reaction that carries one mole of X to one mole of Y.
 */

/** Elemental nitrogen (g/mol). */
export const MW_N = 14.01;
/** Ammonia (g/mol). */
export const MW_NH3 = 17.03;
/** Nitrite, NO2⁻ (g/mol). */
export const MW_NO2 = 46.01;
/** Nitrate, NO3⁻ (g/mol). */
export const MW_NO3 = 62.0;
/** Molecular oxygen (g/mol). */
export const MW_O2 = 32.0;
/** Carbon dioxide (g/mol). */
export const MW_CO2 = 44.01;

/** ≈ 1.216. */
export const N_TO_NH3_MASS_RATIO = MW_NH3 / MW_N;
/** ≈ 2.702. */
export const NH3_TO_NO2_MASS_RATIO = MW_NO2 / MW_NH3;
/** ≈ 1.348. */
export const NO2_TO_NO3_MASS_RATIO = MW_NO3 / MW_NO2;
/**
 * ≈ 0.275. The reduction a plant runs on the nitrate it takes before building
 * it into protein, NO3⁻ → NH4⁺: the ammonia that carries a gram of nitrate's
 * nitrogen.
 */
export const NO3_TO_NH3_MASS_RATIO = MW_NH3 / MW_NO3;

/**
 * ≈ 0.727. 6CO2 + 6H2O → C6H12O6 + 6O2 is 1:1 in moles, so a gram of CO2 fixed
 * releases 32/44 of a gram of oxygen. Aerobic respiration and decay run the same
 * reaction backwards at the same ratio.
 */
export const CO2_TO_O2_MASS_RATIO = MW_O2 / MW_CO2;
/** ≈ 1.375 — the same 1:1 reaction read from the oxygen side. */
export const O2_TO_CO2_MASS_RATIO = MW_CO2 / MW_O2;

/**
 * ≈ 2.819. NH4⁺ + 1.5 O2 → NO2⁻ + 2H⁺ + H2O, read per gram of ammonia. Per
 * gram of nitrogen instead it is the 3.43 the wastewater texts quote.
 */
export const O2_PER_NH3_OXIDIZED = (1.5 * MW_O2) / MW_NH3;
/**
 * ≈ 0.348. NO2⁻ + 0.5 O2 → NO3⁻, per gram of nitrite — 1.14 per gram of
 * nitrogen, and 4.57 for both steps together.
 */
export const O2_PER_NO2_OXIDIZED = (0.5 * MW_O2) / MW_NO2;

/** Calcium carbonate (g/mol). */
export const MW_CACO3 = 100.09;
/** Calcium oxide (g/mol). */
export const MW_CAO = 56.08;

/** ≈ 17.848. mg/L of CaCO3 in one German degree of hardness, dKH or dGH alike: 10 mg/L of CaO. */
export const CACO3_PER_DEGREE = (10 * MW_CACO3) / MW_CAO;

/** ≈ 50.05. mg of CaCO3 in a milliequivalent of alkalinity: the bicarbonate one proton spends. */
export const CACO3_PER_EQUIVALENT = MW_CACO3 / 2;

/**
 * Protons the water gives up per nitrogen each process carries, and so
 * equivalents of KH it gains — negative where the process releases them:
 * - mint: ammonia minted from organic nitrogen takes one up, NH3 + H⁺ → NH4⁺
 * - nitrify: NH4⁺ + 1.5 O2 → NO2⁻ + 2H⁺ + H2O releases two, the 7.14 mg of
 *   CaCO3 per mg of nitrogen the wastewater texts quote
 * - ammoniumUptake: a cell pushes one out for each NH4⁺ it takes up
 * - nitrateUptake: and takes one in with each NO3⁻
 */
export const PROTONS_PER_N = {
  mint: 1,
  nitrify: -2,
  ammoniumUptake: -1,
  nitrateUptake: 1,
} as const;
