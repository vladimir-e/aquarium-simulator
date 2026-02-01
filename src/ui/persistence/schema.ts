/**
 * Zod validation schemas for persisted state.
 * Uses strict schemas to reject unknown keys and ensure data integrity.
 */

import { z } from 'zod';
import { PERSISTENCE_SCHEMA_VERSION } from './types.js';

// ============================================================================
// Simulation State Schemas
// ============================================================================

const TankSchema = z.object({
  capacity: z.number().min(1).max(10000),
  hardscapeSlots: z.number().int().min(0).max(8),
}).strict();

const ResourcesSchema = z.object({
  // Physical
  water: z.number().min(0),
  temperature: z.number().min(0).max(50),
  // Passive
  surface: z.number().min(0),
  flow: z.number().min(0),
  light: z.number().min(0),
  aeration: z.boolean(),
  // Biological
  food: z.number().min(0),
  waste: z.number().min(0),
  algae: z.number().min(0).max(100),
  // Chemical (nitrogen cycle)
  ammonia: z.number().min(0),
  nitrite: z.number().min(0),
  nitrate: z.number().min(0),
  // Dissolved gases
  oxygen: z.number().min(0),
  co2: z.number().min(0),
  // Water chemistry
  ph: z.number().min(0).max(14),
  // Bacteria
  aob: z.number().min(0),
  nob: z.number().min(0),
}).strict();

const EnvironmentSchema = z.object({
  roomTemperature: z.number().min(0).max(50),
  tapWaterTemperature: z.number().min(0).max(50),
  tapWaterPH: z.number().min(0).max(14),
}).strict();

const DailyScheduleSchema = z.object({
  startHour: z.number().int().min(0).max(23),
  duration: z.number().int().min(0).max(24),
}).strict();

const HeaterSchema = z.object({
  enabled: z.boolean(),
  isOn: z.boolean(),
  targetTemperature: z.number().min(15).max(35),
  wattage: z.number().min(10).max(500),
}).strict();

const LidSchema = z.object({
  type: z.enum(['none', 'mesh', 'full', 'sealed']),
}).strict();

const AutoTopOffSchema = z.object({
  enabled: z.boolean(),
}).strict();

const FilterSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(['internal', 'hob', 'canister', 'sponge']),
}).strict();

const PowerheadSchema = z.object({
  enabled: z.boolean(),
  flowRateGPH: z.union([z.literal(200), z.literal(400), z.literal(800)]),
}).strict();

const SubstrateSchema = z.object({
  type: z.enum(['none', 'gravel', 'sand', 'aqua_soil']),
}).strict();

const HardscapeItemSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['neutral_rock', 'calcite_rock', 'driftwood', 'plastic_decoration']),
}).strict();

const HardscapeSchema = z.object({
  items: z.array(HardscapeItemSchema),
}).strict();

const LightSchema = z.object({
  enabled: z.boolean(),
  wattage: z.number().min(0).max(500),
  schedule: DailyScheduleSchema,
}).strict();

const Co2GeneratorSchema = z.object({
  enabled: z.boolean(),
  bubbleRate: z.number().min(0.5).max(5),
  isOn: z.boolean(),
  schedule: DailyScheduleSchema,
}).strict();

const AirPumpSchema = z.object({
  enabled: z.boolean(),
}).strict();

const EquipmentSchema = z.object({
  heater: HeaterSchema,
  lid: LidSchema,
  ato: AutoTopOffSchema,
  filter: FilterSchema,
  powerhead: PowerheadSchema,
  substrate: SubstrateSchema,
  hardscape: HardscapeSchema,
  light: LightSchema,
  co2Generator: Co2GeneratorSchema,
  airPump: AirPumpSchema,
}).strict();

const PlantSpeciesSchema = z.enum([
  'java_fern',
  'anubias',
  'amazon_sword',
  'dwarf_hairgrass',
  'monte_carlo',
]);

const PlantSchema = z.object({
  id: z.string().min(1),
  species: PlantSpeciesSchema,
  size: z.number().min(0).max(200),
}).strict();

const AlertStateSchema = z.object({
  waterLevelCritical: z.boolean(),
  highAlgae: z.boolean(),
  highAmmonia: z.boolean(),
  highNitrite: z.boolean(),
  highNitrate: z.boolean(),
  lowOxygen: z.boolean(),
  highCo2: z.boolean(),
}).strict();

export const SimulationSchema = z.object({
  tick: z.number().int().min(0),
  tank: TankSchema,
  resources: ResourcesSchema,
  environment: EnvironmentSchema,
  equipment: EquipmentSchema,
  plants: z.array(PlantSchema),
  alertState: AlertStateSchema,
}).strict();

// ============================================================================
// TunableConfig Schema
// ============================================================================

// Each config section has numeric values only
const ConfigSectionSchema = z.record(z.string(), z.number().finite());

export const TunableConfigSchema = z.object({
  decay: ConfigSectionSchema,
  nitrogenCycle: ConfigSectionSchema,
  gasExchange: ConfigSectionSchema,
  temperature: ConfigSectionSchema,
  evaporation: ConfigSectionSchema,
  algae: ConfigSectionSchema,
  ph: ConfigSectionSchema,
  plants: ConfigSectionSchema,
}).strict();

// ============================================================================
// UI Preferences Schema
// ============================================================================

export const UISchema = z.object({
  units: z.enum(['metric', 'imperial']),
  debugPanelOpen: z.boolean(),
}).strict();

// ============================================================================
// Complete Persisted State Schema
// ============================================================================

export const PersistedStateSchema = z.object({
  version: z.number().int().min(1),
  simulation: SimulationSchema,
  tunableConfig: TunableConfigSchema,
  ui: UISchema,
}).strict();

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate simulation section.
 */
export function validateSimulation(data: unknown): z.infer<typeof SimulationSchema> | null {
  const result = SimulationSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate tunable config section.
 */
export function validateTunableConfig(data: unknown): z.infer<typeof TunableConfigSchema> | null {
  const result = TunableConfigSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate UI preferences section.
 */
export function validateUI(data: unknown): z.infer<typeof UISchema> | null {
  const result = UISchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate complete persisted state.
 */
export function validatePersistedState(data: unknown): z.infer<typeof PersistedStateSchema> | null {
  const result = PersistedStateSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Check if version matches current schema version.
 */
export function isCurrentVersion(version: number): boolean {
  return version === PERSISTENCE_SCHEMA_VERSION;
}
