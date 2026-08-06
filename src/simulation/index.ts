/**
 * Simulation module - core simulation engine exports.
 */

export type {
  SimulationState,
  SimulationConfig,
  Tank,
  Resources,
  Environment,
  Heater,
  LidType,
  Lid,
  AutoTopOff,
  Equipment,
  AlertState,
  Plant,
  Fish,
  Clutch,
  AlgaeState,
} from './state.js';
export {
  createSimulation,
  calculateTankHeight,
  calculateTankGlassSurface,
  calculateHardscapeSlots,
  DEFAULT_HEATER,
  DEFAULT_LID,
  DEFAULT_ATO,
  DEFAULT_LIGHT,
} from './state.js';

// Logging
export type { LogEntry, LogSeverity, LogEvent } from './core/logging.js';

// Randomness — the stream is the state's to advance, so only its shape is public.
export type { RngState } from './core/rng.js';

// Species
export type { PlantSpecies, PlantSpeciesData, NutrientDemand } from './plants/species.js';
export { PLANT_SPECIES_DATA } from './plants/species.js';
export type {
  FishSpecies,
  FishSpeciesData,
  FishSex,
  FishLifeStage,
  BreedingMode,
  FishBreedingData,
} from './livestock/species.js';
export { FISH_SPECIES_DATA } from './livestock/species.js';

// Seeding — starting a tank at a state
export type {
  PresetSeed,
  SeedBacteria,
  SeedColony,
  SeedSubstrate,
  SeedResources,
  SeedFishGroup,
  SeedPlantGroup,
} from './seed.js';
export { cycledColony, cycledNitrate, cycledReserve } from './seed.js';

// Presets
export type { PresetId, PresetDefinition } from './presets.js';
export {
  PRESETS,
  DEFAULT_PRESET_ID,
  createPresetSimulation,
  getPresetById,
  presetName,
} from './presets.js';

// Configuration
export type { TunableConfig } from './config/index.js';
export { DEFAULT_CONFIG } from './config/index.js';

// Resources
export type { ResourceDefinition, ResourceKey } from './resources/index.js';
export {
  getMassFromPpm,
  ResourceRegistry,
  AllResources,
  TemperatureResource,
  WaterResource,
  SurfaceResource,
  FlowResource,
  LightResource,
  FoodResource,
  WasteResource,
  PhResource,
  PhosphateResource,
  PotassiumResource,
  IronResource,
} from './resources/index.js';

// Schedule
export type { DailySchedule } from './core/schedule.js';
export { isScheduleActive, isValidSchedule, formatSchedule } from './core/schedule.js';

// Logging
export { createLog } from './core/logging.js';

// Blending
export {
  blendTemperature,
  blendConcentration,
  blendPH,
  phToHydrogen,
  hydrogenToPh,
} from './core/blending.js';

export type { Effect, EffectTier } from './core/effects.js';
export { applyEffects } from './core/effects.js';

export { tick, getHourOfDay, getDayNumber } from './tick.js';

// Systems
export type { System } from './systems/index.js';
export {
  coreSystems,
  temperatureDriftSystem,
  evaporationSystem,
  decaySystem,
  calculateTemperatureDrift,
  calculateEvaporation,
  calculateEvaporationRatePerDay,
  getTemperatureFactor,
  decayFraction,
  calculateDecay,
  LID_MULTIPLIERS,
  getLidMultiplier,
  phDriftSystem,
  calculateHardscapeTargetPH,
  calculateCO2PHEffect,
} from './systems/index.js';

// Equipment
export {
  processEquipment,
  calculatePassiveResources,
  calculateSurface,
  biofilmKept,
  rescape,
  heaterUpdate,
  applyHeaterStateChange,
  calculateHeatingRate,
  HEATER_WATTAGE_OPTIONS,
  atoUpdate,
  getFilterSurface,
  getFilterFlow,
  isFilterAirDriven,
  type FilterType,
  type Filter,
  type FilterSpec,
  DEFAULT_FILTER,
  FILTER_TYPES,
  FILTER_SURFACE,
  FILTER_SPECS,
  FILTER_AIR_DRIVEN,
  getPowerheadFlow,
  type PowerheadFlowRate,
  type Powerhead,
  DEFAULT_POWERHEAD,
  POWERHEAD_FLOW_LPH,
  POWERHEAD_FLOW_RATES,
  getSubstrateSurface,
  getSubstrateOrganicReserve,
  replaceSubstrate,
  calculateSubstrateLeach,
  substrateUpdate,
  type SubstrateType,
  type Substrate,
  DEFAULT_SUBSTRATE,
  SUBSTRATE_SURFACE_PER_LITER,
  SUBSTRATE_ORGANIC_PER_LITER,
  BUBBLE_RATE_OPTIONS,
  type BubbleRate,
  getAirPumpOutput,
  getAirPumpFlow,
  isAirPumpUndersized,
  type AirPump,
  DEFAULT_AIR_PUMP,
  AIR_PUMP_SPEC,
  autoDoserUpdate,
  applyAutoDoserSettings,
  shouldDose,
  DEFAULT_AUTO_DOSER,
  DOSE_AMOUNT_OPTIONS,
  type DoseAmount,
  type AutoDoser,
  getLightOutput,
  calculateParAtDepth,
  LIGHT_PAR_OPTIONS,
  MAX_LIGHT_PAR,
  type Light,
  type LightPar,
} from './equipment/index.js';

// Hardscape
export {
  getHardscapeSurface,
  calculateHardscapeTotalSurface,
  getHardscapeName,
  getHardscapePHEffect,
  DEFAULT_HARDSCAPE,
  HARDSCAPE_SURFACE,
  type HardscapeType,
  type HardscapeItem,
  type Hardscape,
} from './equipment/hardscape.js';

// Alerts
export type { Alert, AlertResult, CheckAlertsResult } from './alerts/index.js';
export {
  alerts,
  checkAlerts,
  waterLevelAlert,
  highAlgaeAlert,
  WATER_LEVEL_CRITICAL_THRESHOLD,
  HIGH_ALGAE_THRESHOLD,
} from './alerts/index.js';

// Actions
export type {
  ActionType,
  Action,
  BaseAction,
  TopOffAction,
  FeedAction,
  ScrubAlgaeAction,
  WaterChangeAction,
  TrimPlantsAction,
  AddPlantAction,
  RemovePlantAction,
  DoseAction,
  AddFishAction,
  RemoveFishAction,
  SellFryAction,
  ActionResult,
} from './actions/index.js';
export {
  applyAction,
  topOff,
  feed,
  scrubAlgae,
  canScrubAlgae,
  MIN_SCRUB_PERCENT,
  MAX_SCRUB_PERCENT,
  MIN_ALGAE_TO_SCRUB,
  waterChange,
  WATER_CHANGE_AMOUNTS,
  trimPlants,
  canTrimPlants,
  getPlantsToTrimCount,
  addPlant,
  removePlant,
  isSubstrateCompatible,
  getSubstrateIncompatibilityReason,
  getMaxPlants,
  canAddPlant,
  dose,
  canDose,
  getDosePreview,
  calculateDoseNutrients,
  MAX_DOSE_ML,
  addFish,
  removeFish,
  sellFry,
  canAddFish,
  checkFishCapacity,
  getMaxFishMass,
  totalFishMass,
} from './actions/index.js';
export type { WaterChangeAmount, TrimTargetSize } from './actions/index.js';

// Algae
export {
  processAlgae,
  spendAlgaeSurplus,
  computeAlgaePopulation,
  buildAlgaeStressors,
  buildAlgaeBenefits,
} from './algae/index.js';
export type {
  AlgaeVitalityContext,
  AlgaePopulationResult,
  AlgaePopulationBreakdown,
} from './algae/index.js';

// Plants
export {
  processPlants,
  calculatePhotosynthesis,
  calculateNutrientSufficiency,
  getTotalPlantSize,
  calculateCo2Factor,
  calculateRespiration,
  getRespirationTemperatureFactor,
  spendSurplusOnGrowth,
  getSpeciesGrowthRate,
  computePlantVitality,
  buildPlantStressors,
  buildPlantBenefits,
} from './plants/index.js';

// Livestock
export {
  processLivestock,
  processMetabolism,
  processHealth,
  computeFishVitality,
  processBreeding,
  createFish,
  fishMassForAge,
} from './livestock/index.js';
export {
  satiationContribution,
  classifySatiationBand,
  classifySatiationBandPosition,
  SATIATION_BAND_LABEL,
  type SatiationBand,
  type SatiationContribution,
  type SatiationBandPosition,
} from './systems/satiation.js';

// Vitality
export {
  computeVitality,
  bankSurplus,
  type VitalityFactor,
  type VitalityInput,
  type VitalityResult,
  type VitalityBreakdown,
  type SurplusBankTick,
} from './systems/index.js';
