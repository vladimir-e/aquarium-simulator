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
  FilterType,
  Filter,
  PowerheadFlowRate,
  Powerhead,
  SubstrateType,
  Substrate,
  HardscapeType,
  HardscapeItem,
  Hardscape,
  Light,
  Equipment,
  PassiveResources,
  LogEntry,
  LogSeverity,
  AlertState,
} from './state.js';
export {
  createSimulation,
  calculateTankBacteriaSurface,
  calculateHardscapeSlots,
  DEFAULT_HEATER,
  DEFAULT_LID,
  DEFAULT_ATO,
  DEFAULT_FILTER,
  DEFAULT_POWERHEAD,
  DEFAULT_SUBSTRATE,
  DEFAULT_HARDSCAPE,
  DEFAULT_LIGHT,
  FILTER_SURFACE,
  FILTER_FLOW,
  POWERHEAD_FLOW_LPH,
  SUBSTRATE_SURFACE_PER_LITER,
  HARDSCAPE_SURFACE,
} from './state.js';

// Passive resources
export {
  calculatePassiveResources,
  getFilterSurface,
  getFilterFlow,
  getPowerheadFlow,
  getSubstrateSurface,
} from './passive-resources.js';

// Schedule
export type { DailySchedule } from './schedule.js';
export { isScheduleActive, isValidSchedule, formatSchedule } from './schedule.js';

// Logging
export { createLog } from './logging.js';

export type { Effect, EffectTier, ResourceKey } from './effects.js';
export { applyEffects } from './effects.js';

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
  calculateDecay,
  COOLING_COEFFICIENT,
  REFERENCE_VOLUME,
  VOLUME_EXPONENT,
  BASE_RATE_PER_DAY,
  TEMP_DOUBLING_INTERVAL,
  LID_MULTIPLIERS,
  getLidMultiplier,
  Q10,
  REFERENCE_TEMP,
  BASE_DECAY_RATE,
} from './systems/index.js';

// Equipment
export {
  processEquipment,
  heaterUpdate,
  applyHeaterStateChange,
  calculateHeatingRate,
  atoUpdate,
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
  WATER_LEVEL_CRITICAL_THRESHOLD,
} from './alerts/index.js';

// Actions
export type {
  ActionType,
  Action,
  BaseAction,
  TopOffAction,
  FeedAction,
  ActionResult,
} from './actions/index.js';
export { applyAction, topOff, feed } from './actions/index.js';
