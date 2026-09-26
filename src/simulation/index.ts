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
  relight,
  scheduledLightHistory,
  calculateTankHeight,
  calculateFloorArea,
  calculateTankGlassSurface,
  calculateHardscapeSlots,
  DEFAULT_HEATER,
  DEFAULT_LID,
  DEFAULT_ATO,
  DEFAULT_LIGHT,
} from './state.js';

// Logging
export type { LogEntry, LogSeverity, LogEvent, LogQuantity, LogText, QuantityFormat } from './core/logging.js';

// Randomness — the stream is the state's to advance, so only its shape is public.
export type { RngState } from './core/rng.js';

// Species
export type {
  PlantSpecies,
  PlantSpeciesData,
  NutrientDemand,
  GrowthForm,
  GrowthFormData,
} from './plants/species.js';
export {
  PLANT_SPECIES_DATA,
  GROWTH_FORMS,
  growthFormOf,
  getSaturationIrradiance,
  dailyLightEdge,
} from './plants/species.js';
export type {
  FishSpecies,
  FishSpeciesData,
  FishSex,
  FishLifeStage,
  BreedingMode,
  FishBreedingData,
} from './livestock/species.js';
export { FISH_SPECIES_DATA } from './livestock/species.js';
export {
  FREE_AMMONIA_EDGE,
  NITRITE_EDGE,
  NITRATE_EDGE,
  OXYGEN_EDGE,
  OXYGEN_COMFORT,
  toleranceFactor,
} from './livestock/tolerance.js';

// Seeding — starting a tank at a state
export type {
  PresetSeed,
  TankSeed,
  SeedBacteria,
  SeedColony,
  SeedSubstrate,
  SeedResources,
  SeedFishGroup,
  SeedPlantGroup,
} from './seed.js';
export {
  cycledColony,
  cycledHardness,
  cycledKhReserve,
  cycledNitrate,
  cycledReserve,
  startingHardness,
} from './seed.js';

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
export type { TunableConfig, FertilizerFormula } from './config/index.js';
export { DEFAULT_CONFIG } from './config/index.js';

// Resources
export type { ResourceDefinition, ResourceKey } from './resources/index.js';
export {
  getMassFromPpm,
  getDkh,
  getKhMass,
  getDgh,
  getGhMass,
  ResourceRegistry,
  AllResources,
  TemperatureResource,
  WaterResource,
  SurfaceResource,
  FlowResource,
  LightResource,
  FoodResource,
  WasteResource,
  KhResource,
  GhResource,
  PhosphateResource,
  PotassiumResource,
  IronResource,
} from './resources/index.js';

// Schedule
export type { DailySchedule } from './core/schedule.js';
export { isScheduleActive, isValidSchedule, formatSchedule } from './core/schedule.js';

// Logging
export { celsius, createLog, liters, logText, measured, metricQuantity } from './core/logging.js';

// Blending
export { blendTemperature, blendConcentration } from './core/blending.js';

// Carbonate chemistry
export { carbonatePh, getPh } from './core/carbonate.js';

export type { Effect, EffectTier } from './core/effects.js';
export { applyEffects } from './core/effects.js';

export { tick } from './tick.js';
export { getHourOfDay, getDayNumber } from './core/clock.js';

// Systems
export type { System } from './systems/index.js';
export {
  coreSystems,
  temperatureDriftSystem,
  evaporationSystem,
  decaySystem,
  calculateTemperatureDrift,
  ambientTemperature,
  calculateEvaporation,
  calculateEvaporationRatePerDay,
  getTemperatureFactor,
  decayFraction,
  calculateDecay,
  LID_MULTIPLIERS,
  getLidMultiplier,
} from './systems/index.js';

// Equipment
export {
  processEquipment,
  calculatePassiveResources,
  calculateSurface,
  biofilmKept,
  rescape,
  disturbBed,
  placeHardscape,
  liftHardscape,
  resetHardscape,
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
  getSubstrateKhReserve,
  freshSubstrate,
  replaceSubstrate,
  calculateSubstrateLeach,
  wasteSettlingShare,
  calculateSubstrateKhUptake,
  substrateUpdate,
  type SubstrateType,
  type Substrate,
  DEFAULT_SUBSTRATE,
  SUBSTRATE_SURFACE_PER_LITER,
  SUBSTRATE_ORGANIC_PER_LITER,
  SUBSTRATE_KH_RESERVE_PER_LITER,
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
  scheduledLightByHour,
  dailyLightIntegral,
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
  getHardscapeHardnessEffect,
  checkHardscapeCapacity,
  createHardscapeItem,
  calculateCalciteDissolution,
  calculateTanninLeach,
  hardscapeUpdate,
  DEFAULT_HARDSCAPE,
  HARDSCAPE_SURFACE,
  HARDSCAPE_TANNINS,
  type HardscapeType,
  type HardscapeItem,
  type HardscapeItemSpec,
  type Hardscape,
} from './equipment/hardscape.js';

// Alerts
export type { Alert, AlertResult, CheckAlertsResult } from './alerts/index.js';
export {
  alerts,
  checkAlerts,
  waterLevelAlert,
  highAlgaeAlert,
  waterLevelAlertLine,
  algaeAlertLine,
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
  MIN_PLANTABLE_SIZE,
  isPlantableSize,
  waterChange,
  WATER_CHANGE_AMOUNTS,
  trimPlants,
  canTrimPlants,
  getPlantsToTrimCount,
  addPlant,
  removePlant,
  isSubstrateCompatible,
  getSubstrateIncompatibilityReason,
  canAddPlant,
  checkPlantFootprint,
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
  speciesDemand,
  speciesHalfSaturation,
  nutrientShare,
  calculateCo2Factor,
  calculateRespiration,
  getRespirationTemperatureFactor,
  spendSurplus,
  propagate,
  VIGOUR_SPAN,
  getSpeciesGrowthRate,
  computePlantVitality,
  plantHealingRate,
  plantNitrateEdge,
  buildPlantStressors,
  buildPlantBenefits,
  readPlantLight,
  LEAF_AREA_PER_RATE_UNIT,
  plantHeight,
  leafArea,
  rateUnits,
  getTotalRateUnits,
  canopyLight,
  floorCover,
  floorShade,
  isOvergrown,
} from './plants/index.js';
export type { PlantLight, CanopyLight, Propagation } from './plants/index.js';

// Livestock
export {
  processLivestock,
  processMetabolism,
  processHealth,
  computeFishVitality,
  fishHealingRate,
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
  hardened,
  type VitalityFactor,
  type VitalityInput,
  type VitalityResult,
  type VitalityBreakdown,
} from './systems/index.js';
