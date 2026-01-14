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
  DEFAULT_HARDSCAPE,
  DEFAULT_LIGHT,
  HARDSCAPE_SURFACE,
} from './state.js';

// Schedule
export type { DailySchedule } from './core/schedule.js';
export { isScheduleActive, isValidSchedule, formatSchedule } from './core/schedule.js';

// Logging
export { createLog } from './core/logging.js';

export type { Effect, EffectTier, ResourceKey } from './core/effects.js';
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
  calculatePassiveResources,
  heaterUpdate,
  applyHeaterStateChange,
  calculateHeatingRate,
  atoUpdate,
  getFilterSurface,
  getFilterFlow,
  type FilterType,
  type Filter,
  DEFAULT_FILTER,
  FILTER_SURFACE,
  FILTER_FLOW,
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
