/**
 * Types for the persistence system.
 * Defines the structure of data saved to localStorage.
 */

import type {
  Tank,
  Resources,
  Environment,
  Equipment,
  Plant,
  Fish,
  Clutch,
  AlgaeState,
  AlertState,
} from '../../simulation/state.js';
import type { TunableConfig } from '../../simulation/config/index.js';

/**
 * Schema version for persisted state.
 * Increment this when the structure changes in a breaking way.
 * On version mismatch, stored data is discarded.
 *
 * v13: Two additions on the same version bump (unshipped, no migration):
 *      (a) every organism config gains a `surplusCap` knob (the
 *      saturation cap for the vitality surplus reserve buffer):
 *      `LivestockConfig`, `PlantsConfig`, and `AlgaeVitalityConfig` each
 *      add the required field, defaulting to `SURPLUS_CAP_DEFAULT`;
 *      (b) the fish reproduction system — `Fish` gains a `stage`
 *      ('fry' | 'adult') field, and the simulation gains a top-level
 *      `clutches: Clutch[]` array of unhatched egg batches. Per project
 *      policy this is a breaking save format change with no migration
 *      shim — stored sessions are discarded on version mismatch.
 * v12: Algae promoted from `Resources.algae: number` to a top-level
 *      `state.algae: { mass, surplus }` population. The Resources
 *      schema drops the `algae` field and the simulation gains an
 *      `AlgaeState` entry. `TunableConfig.algae` swaps the
 *      Michaelis–Menten growth knobs (`maxGrowthRate`,
 *      `halfSaturation`, `algaeCap`) for population knobs
 *      (`hardiness`, plant-suppression / weakness thresholds, the
 *      benefit peaks for excess light / nutrients / deficiency /
 *      low plant power, and the growth knobs
 *      `algaeGrowthPerTickCap`, `massPerSurplus`). Per project
 *      policy this is a breaking save format change with no migration
 *      shim — stored sessions are discarded on version mismatch.
 * v11: `Fish.hunger` (0=full, 100=starving) renamed and inverted to
 *      `Fish.satiation` (0=starving, 100=stuffed). `LivestockConfig`
 *      drops `hungerIncreaseRate` for `satiationDecayRate` (same
 *      magnitude, opposite direction). Old hunger band-edge knobs
 *      (`hungerStressThreshold`, `hungerStressSeverity`,
 *      `hungerBenefitPeak`, `hungerBenefitFullThreshold`) are replaced
 *      with the eight `satiation*` band-edge knobs that drive the
 *      five-band model. Per project policy this is a breaking save
 *      format change with no migration shim — stored sessions are
 *      discarded on version mismatch.
 * v10: `Plant` gains `surplus` field (banked vitality surplus, drives
 *      growth and future propagation). `PlantsConfig` drops the
 *      photosynthesis-driven growth knobs (`biomassPerPhotosynthesis`,
 *      `sizePerBiomass`, `overgrowthPenaltyScale`, `wastePerExcessSize`)
 *      and gains the surplus-driven growth knobs
 *      (`plantGrowthPerTickCap`, `sizePerSurplus`).
 * v9: `LivestockConfig.oldAgeDeathChance` removed (probabilistic
 *     old-age cliff replaced by a smooth vitality stressor). New
 *     `LivestockConfig.ageStressSeverity` for the smooth path.
 * v8: Plant lifecycle knobs (`sheddingConditionThreshold`,
 *     `maxSheddingRate`, `wastePerShedSize`, `deathConditionThreshold`,
 *     `deathSizeThreshold`, `wastePerPlantDeath`) move from
 *     `NutrientsConfig` to `PlantsConfig` — alongside the rest of the
 *     plant-lifecycle calibration.
 * v7: `LivestockConfig` gains stressor activation thresholds
 *     (nitrate / oxygen / hunger / water level) and vitality benefit
 *     peaks (pH / hunger / hunger-full / oxygen / plant / plant
 *     saturation point) — knobs that were previously hardcoded
 *     constants in `fish-health.ts`. (The hunger knobs listed here
 *     were superseded by the satiation band knobs in v11.)
 * v6: Fish gains `surplus` (vitality overflow store). Plant condition
 *     semantics also change (driven by stressors + benefits, not raw
 *     nutrient sufficiency) but its persisted shape is identical, so
 *     the bump is purely the new Fish field.
 */
export const PERSISTENCE_VERSION = 13;

/**
 * Storage key for the unified persisted state.
 */
export const STORAGE_KEY = 'aquarium-state';

/**
 * Simulation state subset that gets persisted.
 * Logs are NOT persisted - they start fresh each session.
 */
export interface PersistedSimulation {
  tick: number;
  tank: Tank;
  resources: Resources;
  environment: Environment;
  equipment: Equipment;
  plants: Plant[];
  fish: Fish[];
  clutches: Clutch[];
  algae: AlgaeState;
  alertState: AlertState;
  /** Currently selected preset ID */
  currentPreset: string;
}

/**
 * UI preferences that get persisted.
 */
export interface PersistedUI {
  units: 'metric' | 'imperial';
  debugPanelOpen: boolean;
}

/**
 * Complete persisted state structure.
 */
export interface PersistedState {
  version: number;
  simulation: PersistedSimulation;
  tunableConfig: TunableConfig;
  ui: PersistedUI;
}
