/**
 * Molecular weights and the mass ratios derived from them.
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
