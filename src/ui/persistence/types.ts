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
import type { RngState } from '../../simulation/core/rng.js';
import type { TunableConfig } from '../../simulation/config/index.js';

/**
 * Schema version for persisted state.
 * Increment this when the structure changes in a breaking way.
 * On version mismatch, stored data is discarded.
 *
 * v22: Growth draws a share of the bank instead of a flat ceiling.
 *      `PlantsConfig` swaps `plantGrowthPerTickCap` (surplus units per tick)
 *      for `growthDrawRate` (share of the bank per lit hour), and only the
 *      units that became size leave the bank. A v21 config carries a key the
 *      strict schema refuses, and a refused section reverts every other one to
 *      its defaults; read as a rate, its 2.0 would mobilise twice the whole
 *      bank every hour.
 * v21: Photosynthesis reads the intensity. `PlantsConfig` gains
 *      `saturationIrradianceFactor`, the multiple of a species' band low at
 *      which it saturates, and both light channels — the photosynthetic rate
 *      and the vitality benefit — run through it. A v20 config is missing it,
 *      and the strict schema refuses that section; a refused section reverts
 *      every other one to its defaults.
 * v20: Every oxygen consumer saturates against the oxygen it is drawing from,
 *      and each carries the half-saturation constant it does so at:
 *      `DecayConfig` gains `oxygenHalfSaturation`, `PlantsConfig` and
 *      `LivestockConfig` gain `respirationOxygenHalfSaturation`, and
 *      `NitrogenCycleConfig` gains `aobOxygenHalfSaturation` /
 *      `nobOxygenHalfSaturation`. A v19 config is missing all five, and the
 *      strict schema refuses those sections; a refused section reverts every
 *      other one to its defaults.
 * v19: The plant gas yields collapse onto one constant, and it changes unit.
 *      `PlantsConfig` drops `o2PerPhotosynthesis` and `o2PerRespiration` —
 *      oxygen derives from the carbon at `CO2_TO_O2_MASS_RATIO` — and replaces
 *      `co2PerPhotosynthesis` / `co2PerRespiration` with a single
 *      `co2PerRateUnit` holding a mass rather than a concentration: mg of CO2
 *      per rate unit where the pair held mg/L, so the shipped value moves
 *      0.5 → 30. A v18 config carries four keys the strict schema refuses, and
 *      a refused config section reverts *every* other section to its defaults;
 *      were the stored 0.5 read as a v19 number it would be a planting fixing
 *      a sixtieth of the carbon it should.
 * v18: Light is PAR, not watts. `Light.wattage` becomes `Light.par` — the
 *      fixture's rated PAR at the water surface — and `Resources.light`
 *      holds PAR at the substrate rather than a raw watt count, so the
 *      species bands, the plant light severities and the algae excess-light
 *      threshold are all redenominated with it. `TunableConfig` gains an
 *      `optics` section carrying the water column's attenuation coefficient.
 *      A v17 tank read as v18 would take a 200 W fixture's number for
 *      200 PAR — brighter than the 150 at the top of the catalog.
 * v17: The tank carries its own randomness. `SimulationState` gains
 *      `rng: { seed, counter }` — the seed and stream position every draw
 *      comes off — and organism ids are cut from that counter rather than
 *      the clock. A v16 tank has no stream to resume, and its ids belong to
 *      a scheme the counter would start colliding with the moment the tank
 *      bred again.
 * v16: Fish flow tolerance is a turnover. `FishSpeciesData.maxFlow`
 *      (absolute L/h) becomes `maxTurnover` (tank volumes/h), and
 *      `LivestockConfig.flowStressSeverity` is redenominated with it —
 *      %/h per turnover-unit above tolerance rather than per L/h, so
 *      the shipped default moves 0.01 → 0.3. A v15 severity read as a
 *      v16 one is a 30× understatement of every flow stressor, so a
 *      saved tank would quietly stop reporting a powerhead that is
 *      drowning its fish.
 * v15: Nitrogen-cycle throughput per bacterium. `NitrogenCycleConfig`
 *      swaps `spawnAmount` for `inoculumPerLiter` (bacteria units the
 *      tank is seeded with per litre) and gains the `q10` /
 *      `referenceTemp` pair that scales nitrification with water
 *      temperature, and `Resources.aob` / `.nob` are
 *      redenominated in units of 10⁶ cells — a colony that read 192
 *      under v14 reads six figures under v15. A v14 colony loaded
 *      against v15 constants would be a biofilter roughly 1/50th the
 *      size the tank needs, so the tank would silently poison itself.
 *      Per project policy this is a breaking save format change with no
 *      migration shim — stored sessions are discarded on version
 *      mismatch.
 * v14: Substrate organic leaching. `Substrate` gains `organicReserve`
 *      (grams of organic matter left in the bed) and `DecayConfig`
 *      swaps `ambientWaste` for `substrateLeachRate`. Per project
 *      policy this is a breaking save format change with no migration
 *      shim — stored sessions are discarded on version mismatch.
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
export const PERSISTENCE_VERSION = 22;

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
  rng: RngState;
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
