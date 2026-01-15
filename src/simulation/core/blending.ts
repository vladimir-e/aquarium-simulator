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

// Future: blendPH will use logarithmic blending since pH is logarithmic
// export function blendPH(existingPH: number, existingVolume: number, addedPH: number, addedVolume: number): number
