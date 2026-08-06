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
export {
  type AlgaeVitalityConfig,
  algaeVitalityDefaults,
  algaeVitalityConfigMeta,
} from './algae-vitality.js';
export {
  type OpticsConfig,
  opticsDefaults,
  opticsConfigMeta,
  MAX_WATER_ATTENUATION_PER_CM,
} from './optics.js';
export { type PhConfig, phDefaults, phConfigMeta } from './ph.js';
export { type PlantsConfig, plantsDefaults, plantsConfigMeta } from './plants.js';
export {
  type NutrientsConfig,
  type FertilizerFormula,
  nutrientsDefaults,
  nutrientsConfigMeta,
  fertilizerFormulaMeta,
  getTotalFertilizerNutrients,
  getNutrientRatio,
} from './nutrients.js';
export {
  type LivestockConfig,
  livestockDefaults,
  livestockConfigMeta,
} from './livestock.js';

import { type DecayConfig, decayDefaults, decayConfigMeta } from './decay.js';
import {
  type NitrogenCycleConfig,
  nitrogenCycleDefaults,
  nitrogenCycleConfigMeta,
} from './nitrogen-cycle.js';
import {
  type GasExchangeConfig,
  gasExchangeDefaults,
  gasExchangeConfigMeta,
} from './gas-exchange.js';
import {
  type TemperatureConfig,
  temperatureDefaults,
  temperatureConfigMeta,
} from './temperature.js';
import {
  type EvaporationConfig,
  evaporationDefaults,
  evaporationConfigMeta,
} from './evaporation.js';
import {
  type AlgaeVitalityConfig,
  algaeVitalityDefaults,
  algaeVitalityConfigMeta,
} from './algae-vitality.js';
import { type OpticsConfig, opticsDefaults, opticsConfigMeta } from './optics.js';
import { type PhConfig, phDefaults, phConfigMeta } from './ph.js';
import { type PlantsConfig, plantsDefaults, plantsConfigMeta } from './plants.js';
import {
  type NutrientsConfig,
  nutrientsDefaults,
  nutrientsConfigMeta,
  fertilizerFormulaMeta,
} from './nutrients.js';
import { type LivestockConfig, livestockDefaults, livestockConfigMeta } from './livestock.js';

/**
 * Complete tunable configuration for all simulation systems.
 */
export interface TunableConfig {
  decay: DecayConfig;
  nitrogenCycle: NitrogenCycleConfig;
  gasExchange: GasExchangeConfig;
  temperature: TemperatureConfig;
  evaporation: EvaporationConfig;
  algae: AlgaeVitalityConfig;
  optics: OpticsConfig;
  ph: PhConfig;
  plants: PlantsConfig;
  nutrients: NutrientsConfig;
  livestock: LivestockConfig;
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
  algae: algaeVitalityDefaults,
  optics: opticsDefaults,
  ph: phDefaults,
  plants: plantsDefaults,
  nutrients: nutrientsDefaults,
  livestock: livestockDefaults,
};

interface RangedMeta {
  key: string;
  min?: number;
  max?: number;
}

const CONFIG_META: ReadonlyMap<string, readonly RangedMeta[]> = new Map(
  Object.entries({
    decay: decayConfigMeta,
    nitrogenCycle: nitrogenCycleConfigMeta,
    gasExchange: gasExchangeConfigMeta,
    temperature: temperatureConfigMeta,
    evaporation: evaporationConfigMeta,
    algae: algaeVitalityConfigMeta,
    optics: opticsConfigMeta,
    ph: phConfigMeta,
    plants: plantsConfigMeta,
    nutrients: nutrientsConfigMeta,
    'nutrients.fertilizerFormula': fertilizerFormulaMeta,
    livestock: livestockConfigMeta,
  } satisfies Record<keyof TunableConfig | 'nutrients.fertilizerFormula', readonly RangedMeta[]>)
);

export interface ConfigRange {
  min: number;
  max: number;
}

/**
 * The range a tunable declares for itself, addressed the way `config set`
 * addresses it. Every section's meta bounds every one of its leaves except
 * the nitrogen cycle's, whose rates are derived from doubling times and were
 * never given bounds: those answer `undefined`, and a writer that asks has
 * nothing to hold them to.
 */
export function configRange(path: string): ConfigRange | undefined {
  const keys = path.split('.');
  const leaf = keys.pop();
  const meta = CONFIG_META.get(keys.join('.'))?.find((entry) => entry.key === leaf);
  if (!meta || meta.min === undefined || meta.max === undefined) return undefined;
  return { min: meta.min, max: meta.max };
}

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
 * Deep equality check for config values (handles nested objects).
 */
function isValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object' && a !== null && b !== null) {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => isValueEqual(aObj[key], bObj[key]));
  }
  return false;
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
    if (!isValueEqual(current[key], defaults[key])) {
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
