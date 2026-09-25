/**
 * What Setup states: whether the tank still matches the preset it came from,
 * what the environment fields imply, and what the destructive actions cost.
 * Drift is measured against the state the engine itself creates from the
 * preset, so the tank is never compared to a second description of it.
 */

import {
  calculateEvaporationRatePerDay,
  calculateTemperatureDrift,
  type LidType,
  type SimulationState,
} from '../../simulation/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { PRESETS, createPresetSimulation, type PresetId } from '../../simulation/presets.js';
import { TICKS_PER_DAY, formatElapsed } from '../utils/clock.js';
import { formatTemperatureDelta, formatVolume, type UnitSystem } from '../utils/units.js';

/** Lids in the order the picker offers them. */
export const LID_TYPES: readonly LidType[] = ['none', 'mesh', 'full', 'sealed'];

/** The lid in prose, for the picker that sets it and the row that reads it. */
export const LID_LABEL: Record<LidType, string> = {
  none: 'no lid',
  mesh: 'mesh lid',
  full: 'full lid',
  sealed: 'sealed lid',
};

/** The tank each preset builds, built once — every figure below reads off these. */
const PRESET_TANKS = PRESETS.map(
  (preset) => [preset, createPresetSimulation(preset)] as const
);

/**
 * The tank, environment and equipment a preset configures, flattened to
 * primitives — minus what the engine drives on its own (`isOn`, `dosedToday`)
 * and the ids it mints per hardscape item.
 */
function presetSettings(state: SimulationState): string {
  const e = state.equipment;
  const schedule = (s: { startHour: number; duration: number }): number[] => [s.startHour, s.duration];

  return JSON.stringify({
    capacity: state.tank.capacity,
    room: state.environment.roomTemperature,
    tapTemperature: state.environment.tapWaterTemperature,
    tapKh: state.environment.tapKh,
    tapGh: state.environment.tapGh,
    heater: [e.heater.enabled, e.heater.targetTemperature, e.heater.wattage],
    lid: e.lid.type,
    ato: e.ato.enabled,
    filter: [e.filter.enabled, e.filter.type],
    powerhead: [e.powerhead.enabled, e.powerhead.flowRateGPH],
    substrate: e.substrate.type,
    hardscape: e.hardscape.items.map((item) => item.type).sort(),
    light: [e.light.enabled, e.light.par, ...schedule(e.light.schedule)],
    co2: [e.co2Generator.enabled, e.co2Generator.bubbleRate, ...schedule(e.co2Generator.schedule)],
    airPump: e.airPump.enabled,
    autoDoser: [e.autoDoser.enabled, e.autoDoser.doseAmountMl, ...schedule(e.autoDoser.schedule)],
  });
}

const PRESET_SETTINGS = new Map<PresetId, string>(
  PRESET_TANKS.map(([preset, built]) => [preset.id, presetSettings(built)])
);

/**
 * Whether the tank has moved away from the preset it was built from. Derived
 * rather than tracked, so a change and its undo cancel out and a reload cannot
 * lose it.
 */
export function driftsFromPreset(state: SimulationState, presetId: PresetId): boolean {
  return presetSettings(state) !== PRESET_SETTINGS.get(presetId);
}

export interface EnvironmentNotes {
  /** What the lid lets the tank lose, at the temperatures it is standing on. */
  lid: string;
  /** What the room does to the water between ticks. */
  room: string;
}

/** What the environment fields do to the tank, in the engine's own terms. */
export function environmentNotes(
  state: SimulationState,
  config: TunableConfig,
  units: UnitSystem
): EnvironmentNotes {
  const { environment, equipment, resources } = state;
  const evaporation = calculateEvaporationRatePerDay(
    resources.temperature,
    environment.roomTemperature,
    equipment.lid.type,
    config.evaporation
  );
  const drift = calculateTemperatureDrift(
    resources.temperature,
    environment.roomTemperature,
    resources.water,
    config.temperature
  );

  return {
    lid: evaporation === 0 ? 'nothing evaporates' : `${evaporation.toFixed(1)} %/d evaporates`,
    room:
      drift === 0
        ? 'the water is already there'
        : `the water drifts ${formatTemperatureDelta(Math.abs(drift), units)}/h toward it`,
  };
}

/**
 * Below this a reset costs little enough that interrupting to ask costs more
 * than the reset does.
 */
export const RESET_CONFIRM_TICKS = 30 * TICKS_PER_DAY;

export function resetConsequence(state: SimulationState): string {
  const days = Math.floor(state.tick / TICKS_PER_DAY);
  const elapsed = days > 0 ? ` — ${days} day${days === 1 ? '' : 's'}` : '';
  const clutches = state.clutches.length;
  const eggs =
    clutches > 0
      ? ` ${clutches} clutch${clutches === 1 ? '' : 'es'} in the water ${clutches === 1 ? 'is' : 'are'} lost.`
      : '';

  return `Reset clears the clock, water chemistry, alerts and this run's charts${elapsed}. Equipment, scape, plants and fish stay.${eggs}`;
}

/**
 * A resize does not stretch the tank — it builds a new one and moves the
 * fittings across, so it costs everything a reset costs and the stock besides.
 */
export function resizeConsequence(capacity: number, units: UnitSystem): string {
  return `Rebuilding at ${formatVolume(capacity, units, 0)} starts the tank over at hour zero — the clock, the water, the biofilter, the fish and plants, and this run's charts.`;
}

/** What the tank holds that a preset load takes with it. */
function atStake(state: SimulationState): string[] {
  const stake: string[] = [];
  if (state.tick > 0) stake.push(formatElapsed(state.tick));
  if (state.fish.length > 0) stake.push(`${state.fish.length} fish`);
  if (state.plants.length > 0) {
    stake.push(`${state.plants.length} plant${state.plants.length === 1 ? '' : 's'}`);
  }
  return stake;
}

/** The stock a preset puts in the tank, so a load can tell it from the player's. */
const PRESET_STOCK = new Map<PresetId, { fish: number; plants: number }>(
  PRESET_TANKS.map(([preset, built]) => [
    preset.id,
    { fish: built.fish.length, plants: built.plants.length },
  ])
);

/**
 * Whether loading a preset would cost anything. A tank still at hour zero and
 * holding exactly what `presetId` stocked it with is already what a load
 * builds, so asking would cost more than the load does.
 */
export function presetLoadDestroys(state: SimulationState, presetId: PresetId): boolean {
  const shipped = PRESET_STOCK.get(presetId);
  return (
    state.tick > 0 ||
    state.fish.length !== shipped?.fish ||
    state.plants.length !== shipped?.plants
  );
}

export function presetLoadMessage(name: string, state: SimulationState): string {
  const stake = atStake(state);
  const loss =
    stake.length === 0
      ? ''
      : ` This one — ${stake.join(' · ')} — goes, water chemistry and biofilter with it.`;

  return `Starts “${name}” as a new tank at hour zero.${loss}`;
}
