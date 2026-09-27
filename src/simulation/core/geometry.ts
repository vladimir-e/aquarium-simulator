/**
 * Height in cm of the box a capacity implies, assuming the standard
 * rectangular shape (length:width:height ≈ 2:1:1). A litre is a dm³, so the
 * cube root comes out in dm and ×10 reads it as cm: 20 L stands 21.5 cm,
 * 300 L stands 53.1.
 */
export function calculateTankHeight(capacity: number): number {
  return Math.cbrt(capacity / 2) * 10;
}

/** Floor of the 2:1:1 box a capacity implies, cm². */
export function calculateFloorArea(capacity: number): number {
  const height = calculateTankHeight(capacity);
  return 2 * height * height;
}

/**
 * Calculates tank bacteria surface area in cm² from capacity.
 * Includes 4 walls + bottom (excludes top which is open).
 */
export function calculateTankGlassSurface(capacity: number): number {
  const height = calculateTankHeight(capacity);
  const width = height;
  const length = 2 * height;

  return Math.round(2 * (length * height) + 2 * (width * height) + length * width);
}
