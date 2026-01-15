/**
 * Helper functions for nitrogen compound conversions.
 *
 * Nitrogen compounds (ammonia, nitrite, nitrate) are stored as mass in mg.
 * These helpers convert between mass and concentration (ppm).
 *
 * Rationale: Storing mass as the conserved quantity makes concentration
 * changes implicit in the math - evaporation concentrates automatically
 * (same mass, less volume = higher ppm).
 */

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
