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
  | 'mulm'
  | 'ammonia'
  | 'nitrite'
  | 'nitrate'
  | 'phosphate'
  | 'potassium'
  | 'iron'
  | 'oxygen'
  | 'co2'
  | 'kh'
  | 'gh'
  | 'aob'
  | 'nob';

export const ORGANIC_POOLS = ['food', 'waste', 'mulm'] as const;

/** The organic pools, the bed's mulm among them: they move by organics, so their grams never move without their content. */
export type OrganicResourceKey = (typeof ORGANIC_POOLS)[number];
