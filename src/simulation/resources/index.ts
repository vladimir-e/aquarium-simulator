/**
 * Resource module - unified resource model with metadata.
 *
 * All resources are accessed via ResourceRegistry for type-safe bounds,
 * formatting, and display. This module centralizes resource definitions
 * previously scattered across state.ts and effects.ts.
 */

export type { ResourceDefinition, ResourceKey } from './types.js';

// Nitrogen compound helpers (mass <-> ppm conversion)
export { getPpm, getMassFromPpm } from './helpers.js';

// Individual resource exports
export { TemperatureResource } from './temperature.js';
export { WaterResource } from './water.js';
export { SurfaceResource } from './surface.js';
export { FlowResource } from './flow.js';
export { LightResource } from './light.js';
export { FoodResource } from './food.js';
export { WasteResource } from './waste.js';
export { AlgaeResource } from './algae.js';
export { AmmoniaResource } from './ammonia.js';
export { NitriteResource } from './nitrite.js';
export { NitrateResource } from './nitrate.js';
export { PhosphateResource } from './phosphate.js';
export { PotassiumResource } from './potassium.js';
export { IronResource } from './iron.js';
export { OxygenResource } from './oxygen.js';
export { Co2Resource } from './co2.js';
export { PhResource } from './ph.js';
export { AobResource } from './aob.js';
export { NobResource } from './nob.js';

// Import for registry
import type { ResourceDefinition, ResourceKey } from './types.js';
import { TemperatureResource } from './temperature.js';
import { WaterResource } from './water.js';
import { SurfaceResource } from './surface.js';
import { FlowResource } from './flow.js';
import { LightResource } from './light.js';
import { FoodResource } from './food.js';
import { WasteResource } from './waste.js';
import { AlgaeResource } from './algae.js';
import { AmmoniaResource } from './ammonia.js';
import { NitriteResource } from './nitrite.js';
import { NitrateResource } from './nitrate.js';
import { PhosphateResource } from './phosphate.js';
import { PotassiumResource } from './potassium.js';
import { IronResource } from './iron.js';
import { OxygenResource } from './oxygen.js';
import { Co2Resource } from './co2.js';
import { PhResource } from './ph.js';
import { AobResource } from './aob.js';
import { NobResource } from './nob.js';

/**
 * Registry of all resources indexed by key.
 * Provides type-safe access to resource metadata.
 */
export const ResourceRegistry: Record<ResourceKey, ResourceDefinition<ResourceKey>> = {
  water: WaterResource,
  temperature: TemperatureResource,
  surface: SurfaceResource,
  flow: FlowResource,
  light: LightResource,
  food: FoodResource,
  waste: WasteResource,
  algae: AlgaeResource,
  ammonia: AmmoniaResource,
  nitrite: NitriteResource,
  nitrate: NitrateResource,
  phosphate: PhosphateResource,
  potassium: PotassiumResource,
  iron: IronResource,
  oxygen: OxygenResource,
  co2: Co2Resource,
  ph: PhResource,
  aob: AobResource,
  nob: NobResource,
};

/**
 * Array of all resources for iteration.
 */
export const AllResources: ResourceDefinition<ResourceKey>[] = Object.values(ResourceRegistry);
