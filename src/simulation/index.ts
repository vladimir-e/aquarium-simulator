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
  HardscapeType,
  HardscapeItem,
  Hardscape,
  Light,
  Equipment,
  LogEntry,
  LogSeverity,
  AlertState,
  Plant,
  PlantSpecies,
  PlantSpeciesData,
  NutrientDemand,
  AutoDoser,
} from './state.js';
export {
  createSimulation,
  calculateTankGlassSurface,
  calculateHardscapeSlots,
  DEFAULT_HEATER,
  DEFAULT_LID,
  DEFAULT_ATO,
  DEFAULT_HARDSCAPE,
  DEFAULT_LIGHT,
  HARDSCAPE_SURFACE,
  PLANT_SPECIES_DATA,
} from './state.js';

// Resources
export type { ResourceDefinition, ResourceKey } from './resources/index.js';
export {
  ResourceRegistry,
  AllResources,
  TemperatureResource,
  WaterResource,
  SurfaceResource,
  FlowResource,
  LightResource,
  FoodResource,
  WasteResource,
  AlgaeResource,
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
  algaeSystem,
  calculateTemperatureDrift,
  calculateEvaporation,
  calculateEvaporationRatePerDay,
  getTemperatureFactor,
  calculateDecay,
  calculateAlgaeGrowth,
  getWattsPerGallon,
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
  heaterUpdate,
  applyHeaterStateChange,
  calculateHeatingRate,
  atoUpdate,
  getFilterSurface,
  getFilterFlow,
  isFilterAirDriven,
  type FilterType,
  type Filter,
  type FilterSpec,
  DEFAULT_FILTER,
  FILTER_SURFACE,
  FILTER_SPECS,
  FILTER_AIR_DRIVEN,
  getPowerheadFlow,
  type PowerheadFlowRate,
  type Powerhead,
  DEFAULT_POWERHEAD,
  POWERHEAD_FLOW_LPH,
  getSubstrateSurface,
  type SubstrateType,
  type Substrate,
  DEFAULT_SUBSTRATE,
  SUBSTRATE_SURFACE_PER_LITER,
  getAirPumpOutput,
  getAirPumpFlow,
  isAirPumpUndersized,
  type AirPump,
  DEFAULT_AIR_PUMP,
  AIR_PUMP_SPEC,
  autoDoserUpdate,
  applyAutoDoserSettings,
  formatDosePreview,
  shouldDose,
  DEFAULT_AUTO_DOSER,
  DOSE_AMOUNT_OPTIONS,
  type DoseAmount,
} from './equipment/index.js';

// Hardscape
export {
  getHardscapeSurface,
  calculateHardscapeTotalSurface,
  getHardscapeName,
  getHardscapePHEffect,
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
} from './actions/index.js';
export type { WaterChangeAmount, TrimTargetSize } from './actions/index.js';

// Plants
export {
  processPlants,
  calculatePhotosynthesis,
  getTotalPlantSize,
  calculateCo2Factor,
  calculateNitrateFactor,
  calculateRespiration,
  getRespirationTemperatureFactor,
  distributeBiomass,
  getMaxPlantSize,
  calculateOvergrowthPenalty,
  getSpeciesGrowthRate,
} from './plants/index.js';
