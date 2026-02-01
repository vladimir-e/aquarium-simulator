/**
 * Zod validation schemas for persisted state.
 * Uses .strict() to reject unknown keys.
 */

import { z } from 'zod';
import { PERSISTENCE_VERSION } from './types.js';

// ============================================================================
// Schedule Schema
// ============================================================================

const DailyScheduleSchema = z
  .object({
    startHour: z.number().int().min(0).max(23),
    duration: z.number().int().min(0).max(24),
  })
  .strict();

// ============================================================================
// Tank Schema
// ============================================================================

const TankSchema = z
  .object({
    capacity: z.number().min(1).max(10000),
    hardscapeSlots: z.number().int().min(0).max(8),
  })
  .strict();

// ============================================================================
// Resources Schema
// ============================================================================

const ResourcesSchema = z
  .object({
    water: z.number().min(0),
    temperature: z.number().min(0).max(50),
    surface: z.number().min(0),
    flow: z.number().min(0),
    light: z.number().min(0),
    aeration: z.boolean(),
    food: z.number().min(0),
    waste: z.number().min(0),
    algae: z.number().min(0).max(100),
    ammonia: z.number().min(0),
    nitrite: z.number().min(0),
    nitrate: z.number().min(0),
    oxygen: z.number().min(0),
    co2: z.number().min(0),
    ph: z.number().min(0).max(14),
    aob: z.number().min(0),
    nob: z.number().min(0),
  })
  .strict();

// ============================================================================
// Environment Schema
// ============================================================================

const EnvironmentSchema = z
  .object({
    roomTemperature: z.number().min(0).max(50),
    tapWaterTemperature: z.number().min(0).max(50),
    tapWaterPH: z.number().min(0).max(14),
  })
  .strict();

// ============================================================================
// Equipment Schemas
// ============================================================================

const HeaterSchema = z
  .object({
    enabled: z.boolean(),
    isOn: z.boolean(),
    targetTemperature: z.number().min(15).max(35),
    wattage: z.number().min(10).max(500),
  })
  .strict();

const LidSchema = z
  .object({
    type: z.enum(['none', 'mesh', 'full', 'sealed']),
  })
  .strict();

const AutoTopOffSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();

const FilterSchema = z
  .object({
    enabled: z.boolean(),
    type: z.enum(['sponge', 'hob', 'canister', 'sump']),
  })
  .strict();

const PowerheadSchema = z
  .object({
    enabled: z.boolean(),
    flowRateGPH: z.union([z.literal(240), z.literal(400), z.literal(600), z.literal(850)]),
  })
  .strict();

const SubstrateSchema = z
  .object({
    type: z.enum(['none', 'sand', 'gravel', 'aqua_soil']),
  })
  .strict();

const HardscapeItemSchema = z
  .object({
    id: z.string(),
    type: z.enum(['neutral_rock', 'calcite_rock', 'driftwood', 'plastic_decoration']),
  })
  .strict();

const HardscapeSchema = z
  .object({
    items: z.array(HardscapeItemSchema),
  })
  .strict();

const LightSchema = z
  .object({
    enabled: z.boolean(),
    wattage: z.number().min(0).max(500),
    schedule: DailyScheduleSchema,
  })
  .strict();

const Co2GeneratorSchema = z
  .object({
    enabled: z.boolean(),
    bubbleRate: z.number().min(0.5).max(5),
    isOn: z.boolean(),
    schedule: DailyScheduleSchema,
  })
  .strict();

const AirPumpSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();

const EquipmentSchema = z
  .object({
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
  })
  .strict();

// ============================================================================
// Plants Schema
// ============================================================================

const PlantSchema = z
  .object({
    id: z.string(),
    species: z.enum(['java_fern', 'anubias', 'amazon_sword', 'dwarf_hairgrass', 'monte_carlo']),
    size: z.number().min(0).max(200),
  })
  .strict();

// ============================================================================
// Alert State Schema
// ============================================================================

const AlertStateSchema = z
  .object({
    waterLevelCritical: z.boolean(),
    highAlgae: z.boolean(),
    highAmmonia: z.boolean(),
    highNitrite: z.boolean(),
    highNitrate: z.boolean(),
    lowOxygen: z.boolean(),
    highCo2: z.boolean(),
  })
  .strict();

// ============================================================================
// Simulation Schema
// ============================================================================

export const PersistedSimulationSchema = z
  .object({
    tick: z.number().int().min(0),
    tank: TankSchema,
    resources: ResourcesSchema,
    environment: EnvironmentSchema,
    equipment: EquipmentSchema,
    plants: z.array(PlantSchema),
    alertState: AlertStateSchema,
  })
  .strict();

// ============================================================================
// Tunable Config Schemas
// ============================================================================

const DecayConfigSchema = z
  .object({
    q10: z.number(),
    referenceTemp: z.number(),
    baseDecayRate: z.number(),
    wasteConversionRatio: z.number(),
    gasExchangePerGramDecay: z.number(),
    ambientWaste: z.number(),
  })
  .strict();

const NitrogenCycleConfigSchema = z
  .object({
    wasteConversionRate: z.number(),
    wasteToAmmoniaRatio: z.number(),
    bacteriaProcessingRate: z.number(),
    aobSpawnThreshold: z.number(),
    nobSpawnThreshold: z.number(),
    spawnAmount: z.number(),
    aobGrowthRate: z.number(),
    nobGrowthRate: z.number(),
    bacteriaPerCm2: z.number(),
    bacteriaDeathRate: z.number(),
    aobFoodThreshold: z.number(),
    nobFoodThreshold: z.number(),
  })
  .strict();

const GasExchangeConfigSchema = z
  .object({
    atmosphericCo2: z.number(),
    o2SaturationBase: z.number(),
    o2SaturationSlope: z.number(),
    o2ReferenceTemp: z.number(),
    baseExchangeRate: z.number(),
    optimalFlowTurnover: z.number(),
    aerationExchangeMultiplier: z.number(),
    aerationDirectO2: z.number(),
    aerationCo2OffgasMultiplier: z.number(),
  })
  .strict();

const TemperatureConfigSchema = z
  .object({
    coolingCoefficient: z.number(),
    referenceVolume: z.number(),
    volumeExponent: z.number(),
  })
  .strict();

const EvaporationConfigSchema = z
  .object({
    baseRatePerDay: z.number(),
    tempDoublingInterval: z.number(),
  })
  .strict();

const AlgaeConfigSchema = z
  .object({
    maxGrowthRate: z.number(),
    halfSaturation: z.number(),
    algaeCap: z.number(),
  })
  .strict();

const PhConfigSchema = z
  .object({
    calciteTargetPh: z.number(),
    driftwoodTargetPh: z.number(),
    neutralPh: z.number(),
    basePgDriftRate: z.number(),
    co2PhCoefficient: z.number(),
    co2NeutralLevel: z.number(),
    hardscapeDiminishingFactor: z.number(),
  })
  .strict();

const PlantsConfigSchema = z
  .object({
    basePhotosynthesisRate: z.number(),
    optimalCo2: z.number(),
    optimalNitrate: z.number(),
    o2PerPhotosynthesis: z.number(),
    co2PerPhotosynthesis: z.number(),
    nitratePerPhotosynthesis: z.number(),
    biomassPerPhotosynthesis: z.number(),
    baseRespirationRate: z.number(),
    o2PerRespiration: z.number(),
    co2PerRespiration: z.number(),
    respirationQ10: z.number(),
    respirationReferenceTemp: z.number(),
    sizePerBiomass: z.number(),
    overgrowthPenaltyScale: z.number(),
    wastePerExcessSize: z.number(),
    competitionScale: z.number(),
  })
  .strict();

export const TunableConfigSchema = z
  .object({
    decay: DecayConfigSchema,
    nitrogenCycle: NitrogenCycleConfigSchema,
    gasExchange: GasExchangeConfigSchema,
    temperature: TemperatureConfigSchema,
    evaporation: EvaporationConfigSchema,
    algae: AlgaeConfigSchema,
    ph: PhConfigSchema,
    plants: PlantsConfigSchema,
  })
  .strict();

// ============================================================================
// UI Schema
// ============================================================================

export const PersistedUISchema = z
  .object({
    units: z.enum(['metric', 'imperial']),
    debugPanelOpen: z.boolean(),
  })
  .strict();

// ============================================================================
// Complete Persisted State Schema
// ============================================================================

export const PersistedStateSchema = z
  .object({
    version: z.literal(PERSISTENCE_VERSION),
    simulation: PersistedSimulationSchema,
    tunableConfig: TunableConfigSchema,
    ui: PersistedUISchema,
  })
  .strict();

// ============================================================================
// Partial Schemas for Section-Level Recovery
// ============================================================================

/**
 * Partial schema for loading - allows individual sections to fail.
 * Version is still strictly required.
 */
export const PartialPersistedStateSchema = z
  .object({
    version: z.literal(PERSISTENCE_VERSION),
    simulation: PersistedSimulationSchema.optional(),
    tunableConfig: TunableConfigSchema.optional(),
    ui: PersistedUISchema.optional(),
  })
  .strict();
