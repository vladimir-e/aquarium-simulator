/**
 * Blending calculations for water changes and additions.
 *
 * These formulas handle mixing of water with different properties
 * (temperature, pH, etc.) using physically correct weighted averages.
 */

/**
 * Blend temperature when mixing water volumes.
 * Uses heat capacity weighted average (assumes equal specific heat).
 *
 * Formula: newTemp = (existingTemp * existingVolume + addedTemp * addedVolume) / totalVolume
 *
 * @param existingTemp - Temperature of existing water (°C)
 * @param existingVolume - Volume of existing water (L)
 * @param addedTemp - Temperature of water being added (°C)
 * @param addedVolume - Volume of water being added (L)
 * @returns Blended temperature (°C), rounded to 2 decimal places
 */
export function blendTemperature(
  existingTemp: number,
  existingVolume: number,
  addedTemp: number,
  addedVolume: number
): number {
  const totalVolume = existingVolume + addedVolume;

  if (totalVolume <= 0) {
    return existingTemp;
  }

  const blended =
    (existingTemp * existingVolume + addedTemp * addedVolume) / totalVolume;

  return +blended.toFixed(2);
}

/**
 * Blend concentration when mixing water volumes.
 * Simple weighted average for concentration-based resources (mg/L).
 *
 * Formula: newConc = (existingConc * existingVolume + addedConc * addedVolume) / totalVolume
 *
 * @param existingConc - Concentration in existing water (mg/L)
 * @param existingVolume - Volume of existing water (L)
 * @param addedConc - Concentration of water being added (mg/L)
 * @param addedVolume - Volume of water being added (L)
 * @returns Blended concentration (mg/L), rounded to 2 decimal places
 */
export function blendConcentration(
  existingConc: number,
  existingVolume: number,
  addedConc: number,
  addedVolume: number
): number {
  const totalVolume = existingVolume + addedVolume;

  if (totalVolume <= 0) {
    return existingConc;
  }

  const blended =
    (existingConc * existingVolume + addedConc * addedVolume) / totalVolume;

  return +blended.toFixed(2);
}

/**
 * Convert pH to hydrogen ion concentration [H+].
 * pH is logarithmic: pH = -log10([H+])
 */
export function phToHydrogen(ph: number): number {
  return Math.pow(10, -ph);
}

/**
 * Convert hydrogen ion concentration back to pH.
 */
export function hydrogenToPh(hydrogen: number): number {
  if (hydrogen <= 0) return 7.0; // Neutral fallback
  return -Math.log10(hydrogen);
}

/**
 * Blend pH when mixing water volumes.
 * Uses chemically accurate H+ concentration blending.
 *
 * Note: Simple averaging would be wrong. pH 6 + pH 8 averaged = pH 7, but
 * chemically the H+ concentrations are 10^-6 + 10^-8 = ~1.01x10^-6, giving
 * pH ~5.996. The acidic water dominates because it has 100x more H+ ions.
 *
 * @param existingPH - pH of existing water
 * @param existingVolume - Volume of existing water (L)
 * @param addedPH - pH of water being added
 * @param addedVolume - Volume of water being added (L)
 * @returns Blended pH, rounded to 2 decimal places
 */
export function blendPH(
  existingPH: number,
  existingVolume: number,
  addedPH: number,
  addedVolume: number
): number {
  const totalVolume = existingVolume + addedVolume;
  if (totalVolume <= 0) return existingPH;

  // Convert to H+ concentrations
  const existingH = phToHydrogen(existingPH);
  const addedH = phToHydrogen(addedPH);

  // Volume-weighted average of H+ concentration
  const blendedH = (existingH * existingVolume + addedH * addedVolume) / totalVolume;

  // Convert back to pH
  return +hydrogenToPh(blendedH).toFixed(2);
}
