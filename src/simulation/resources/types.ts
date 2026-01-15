/**
 * Resource type definitions for the unified resource model.
 */

/**
 * Defines a resource with metadata for formatting, bounds, and display.
 * All resources share this common structure enabling type-safe access
 * and consistent UI display.
 */
export interface ResourceDefinition<TKey extends string = string> {
  /** Unique resource identifier */
  key: TKey;
  /** Display unit (e.g., '°C', 'L', 'g', 'cm²') */
  unit: string;
  /** Physical bounds for clamping */
  bounds: { min: number; max: number };
  /** Initial value when simulation starts */
  defaultValue: number;
  /** Decimal places for display formatting */
  precision: number;
  /** Format value for display with unit. Water param for mass-based resources. */
  format: (value: number, waterLiters?: number) => string;
  /** Optional safe range for livestock/plants */
  safeRange?: { min: number; max: number };
  /** Optional stress range (outside safe but survivable) */
  stressRange?: { min: number; max: number };
}

/**
 * Union type of all valid resource keys.
 */
export type ResourceKey =
  | 'water'
  | 'temperature'
  | 'surface'
  | 'flow'
  | 'light'
  | 'food'
  | 'waste'
  | 'algae'
  | 'ammonia'
  | 'nitrite'
  | 'nitrate'
  | 'aob'
  | 'nob';
