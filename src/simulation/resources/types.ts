/**
 * Resource type definitions and abstractions.
 *
 * Resources are measurable quantities in the aquarium simulation.
 * Each resource has metadata defining its properties, bounds, and display formatting.
 */

/**
 * Location where the resource value is stored in state.
 */
export type ResourceLocation = 'resources' | 'tank';

/**
 * Resource definition with all metadata.
 */
export interface ResourceDefinition<TKey extends string = string> {
  /** Unique key identifying this resource */
  key: TKey;
  /** Where in state this resource is stored */
  location: ResourceLocation;
  /** Property name in the location object */
  property: string;
  /** Unit of measurement (e.g., '°C', 'g', 'L') */
  unit: string;
  /** Valid value bounds */
  bounds: {
    min: number;
    max: number;
  };
  /** Default/initial value */
  defaultValue: number;
  /** Display precision (decimal places) */
  precision: number;
  /** Format value for display */
  format: (value: number) => string;
  /** Optional safe range for color-coding UI */
  safeRange?: {
    min: number;
    max: number;
  };
  /** Optional stress range (yellow warning) */
  stressRange?: {
    min: number;
    max: number;
  };
}

/**
 * Type-safe resource getter - reads resource value from state.
 */
export function getResourceValue(
  state: { resources: Record<string, number>; tank: Record<string, number> },
  resource: ResourceDefinition
): number {
  const location = state[resource.location];
  return location[resource.property] ?? resource.defaultValue;
}

/**
 * Clamps a value between min and max (inclusive).
 */
export function clampResourceValue(
  value: number,
  resource: ResourceDefinition
): number {
  return Math.max(resource.bounds.min, Math.min(resource.bounds.max, value));
}
