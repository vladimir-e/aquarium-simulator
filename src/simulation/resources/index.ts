/**
 * Resource registry - central export point for all resources.
 */

export type { ResourceDefinition, ResourceLocation } from './types.js';
export { getResourceValue, clampResourceValue } from './types.js';

export { TemperatureResource } from './temperature.js';
export { WaterLevelResource } from './water-level.js';
export { FoodResource } from './food.js';
export { WasteResource } from './waste.js';
export { AlgaeResource } from './algae.js';

import type { ResourceDefinition } from './types.js';
import { TemperatureResource } from './temperature.js';
import { WaterLevelResource } from './water-level.js';
import { FoodResource } from './food.js';
import { WasteResource } from './waste.js';
import { AlgaeResource } from './algae.js';

/**
 * Registry of all resources indexed by key.
 */
export const ResourceRegistry = {
  temperature: TemperatureResource,
  waterLevel: WaterLevelResource,
  food: FoodResource,
  waste: WasteResource,
  algae: AlgaeResource,
} as const;

/**
 * Type-safe union of all resource keys.
 * Automatically derived from registry.
 */
export type ResourceKey = keyof typeof ResourceRegistry;

/**
 * Get resource definition by key.
 */
export function getResource(key: ResourceKey): ResourceDefinition {
  return ResourceRegistry[key];
}
