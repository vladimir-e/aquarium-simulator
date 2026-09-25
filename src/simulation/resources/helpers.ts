/**
 * Helper functions for mass-stored solutes.
 *
 * Nitrogen compounds, nutrients and alkalinity are stored as mass in mg.
 * These helpers convert between mass and concentration (ppm).
 *
 * Rationale: Storing mass as the conserved quantity makes concentration
 * changes implicit in the math - evaporation concentrates automatically
 * (same mass, less volume = higher ppm).
 */

import { CACO3_PER_DKH } from '../core/chemistry.js';

/**
 * Derives concentration (ppm) from mass and water volume.
 *
 * @param massInMg - Mass of the compound in milligrams
 * @param waterLiters - Current water volume in liters
 * @returns Concentration in parts per million (ppm = mg/L)
 */
export function getPpm(massInMg: number, waterLiters: number): number {
  if (waterLiters <= 0) return 0;
  return massInMg / waterLiters;
}

/**
 * Converts concentration (ppm) to mass in mg.
 *
 * @param ppm - Concentration in parts per million
 * @param waterLiters - Current water volume in liters
 * @returns Mass in milligrams
 */
export function getMassFromPpm(ppm: number, waterLiters: number): number {
  if (waterLiters <= 0) return 0;
  return ppm * waterLiters;
}

/** Carbonate hardness in dKH, from alkalinity stored as mg of CaCO3. */
export function getDkh(massInMg: number, waterLiters: number): number {
  return getPpm(massInMg, waterLiters) / CACO3_PER_DKH;
}

/** mg of CaCO3 that holds `dkh` in `waterLiters`. */
export function getKhMass(dkh: number, waterLiters: number): number {
  return getMassFromPpm(dkh * CACO3_PER_DKH, waterLiters);
}
