/**
 * Centralized tunable configuration system.
 *
 * Provides type-safe defaults and metadata for all simulation constants.
 * Used by ConfigContext to provide runtime-mutable configuration.
 */

export { type DecayConfig, decayDefaults, decayConfigMeta } from './decay.js';
export {
  type NitrogenCycleConfig,
  nitrogenCycleDefaults,
  nitrogenCycleConfigMeta,
} from './nitrogen-cycle.js';
export {
  type GasExchangeConfig,
  gasExchangeDefaults,
  gasExchangeConfigMeta,
} from './gas-exchange.js';
export {
  type TemperatureConfig,
  temperatureDefaults,
  temperatureConfigMeta,
} from './temperature.js';
export {
  type EvaporationConfig,
  evaporationDefaults,
  evaporationConfigMeta,
} from './evaporation.js';
export { type AlgaeConfig, algaeDefaults, algaeConfigMeta } from './algae.js';
export { type PhConfig, phDefaults, phConfigMeta } from './ph.js';

import { type DecayConfig, decayDefaults } from './decay.js';
import { type NitrogenCycleConfig, nitrogenCycleDefaults } from './nitrogen-cycle.js';
import { type GasExchangeConfig, gasExchangeDefaults } from './gas-exchange.js';
import { type TemperatureConfig, temperatureDefaults } from './temperature.js';
import { type EvaporationConfig, evaporationDefaults } from './evaporation.js';
import { type AlgaeConfig, algaeDefaults } from './algae.js';
import { type PhConfig, phDefaults } from './ph.js';

/**
 * Complete tunable configuration for all simulation systems.
 */
export interface TunableConfig {
  decay: DecayConfig;
  nitrogenCycle: NitrogenCycleConfig;
  gasExchange: GasExchangeConfig;
  temperature: TemperatureConfig;
  evaporation: EvaporationConfig;
  algae: AlgaeConfig;
  ph: PhConfig;
}

/**
 * Default values for all tunable configuration.
 */
export const DEFAULT_CONFIG: TunableConfig = {
  decay: decayDefaults,
  nitrogenCycle: nitrogenCycleDefaults,
  gasExchange: gasExchangeDefaults,
  temperature: temperatureDefaults,
  evaporation: evaporationDefaults,
  algae: algaeDefaults,
  ph: phDefaults,
};

/**
 * Deep clone a config object.
 */
export function cloneConfig(config: TunableConfig): TunableConfig {
  return JSON.parse(JSON.stringify(config));
}

/**
 * Check if a config value differs from default.
 */
export function isModified<K extends keyof TunableConfig>(
  config: TunableConfig,
  section: K,
  key: keyof TunableConfig[K]
): boolean {
  return config[section][key] !== DEFAULT_CONFIG[section][key];
}

/**
 * Check if any value in a section differs from default.
 */
export function isSectionModified<K extends keyof TunableConfig>(
  config: TunableConfig,
  section: K
): boolean {
  const current = config[section];
  const defaults = DEFAULT_CONFIG[section];
  for (const key of Object.keys(defaults) as (keyof TunableConfig[K])[]) {
    if (current[key] !== defaults[key]) {
      return true;
    }
  }
  return false;
}

/**
 * Check if any value in the config differs from default.
 */
export function isConfigModified(config: TunableConfig): boolean {
  for (const section of Object.keys(DEFAULT_CONFIG) as (keyof TunableConfig)[]) {
    if (isSectionModified(config, section)) {
      return true;
    }
  }
  return false;
}
