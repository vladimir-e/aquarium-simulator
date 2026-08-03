/**
 * The scenario model: what each preset actually builds, what the environment
 * fields imply, and what the destructive actions cost. Preset copy is read off
 * the state the engine itself creates from the preset, so a card cannot promise
 * something the preset does not build.
 */

import {
  calculateEvaporationRatePerDay,
  createSimulation,
  getFilterFlow,
  getMaxPlants,
  type LidType,
  type SimulationState,
} from '../../simulation/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { SurfaceResource } from '../../simulation/resources/index.js';
import { PRESETS, type PresetId } from '../../simulation/presets.js';
import { TICKS_PER_DAY, formatElapsed } from '../utils/clock.js';
import { formatVolume, type UnitSystem } from '../utils/units.js';
import { turnover } from './readings.js';
import { scapeSummary } from './scape.js';

/** Lids in the order the picker offers them. */
export const LID_TYPES: readonly LidType[] = ['none', 'mesh', 'full', 'sealed'];

/**
 * The lid in prose — the rail, the preset cards, the evaporation row and the
 * lid picker all read it from here, so there is one wording to disagree with.
 */
export const LID_LABEL: Record<LidType, string> = {
  none: 'no lid',
  mesh: 'mesh lid',
  full: 'full lid',
  sealed: 'sealed lid',
};

export interface PresetCard {
  id: PresetId;
  name: string;
  /** Tank capacity in the reader's units. */
  volume: string;
  /** The scape it lays down and the gear it switches on, in one line. */
  build: string;
}

function buildSummary(state: SimulationState): string {
  const {
    airPump,
    ato,
    autoDoser,
    co2Generator,
    filter,
    heater,
    hardscape,
    light,
    lid,
    powerhead,
    substrate,
  } = state.equipment;
  const gear: string[] = [];

  if (filter.enabled) gear.push(`${filter.type} filter`);
  if (heater.enabled) gear.push('heater');
  if (light.enabled) gear.push('light');
  if (co2Generator.enabled) gear.push('CO₂');
  if (airPump.enabled) gear.push('air pump');
  if (powerhead.enabled) gear.push('powerhead');
  if (ato.enabled) gear.push('ATO');
  if (autoDoser.enabled) gear.push('auto doser');
  if (gear.length === 0) gear.push('no equipment');

  return [scapeSummary(substrate.type, hardscape.items), ...gear, LID_LABEL[lid.type]].join(' · ');
}

/** The section's headline figure, shared with the rail's Scenario row. */
export function scenarioSummary(
  state: SimulationState,
  presetName: string,
  units: UnitSystem
): string {
  return `${presetName} · ${formatVolume(state.tank.capacity, units, 0)}`;
}

export function presetCards(units: UnitSystem): PresetCard[] {
  return PRESETS.map((preset) => {
    const built = createSimulation(preset.config);
    return {
      id: preset.id,
      name: preset.name,
      volume: formatVolume(built.tank.capacity, units, 0),
      build: buildSummary(built),
    };
  });
}

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
    tapPH: state.environment.tapWaterPH,
    heater: [e.heater.enabled, e.heater.targetTemperature, e.heater.wattage],
    lid: e.lid.type,
    ato: e.ato.enabled,
    filter: [e.filter.enabled, e.filter.type],
    powerhead: [e.powerhead.enabled, e.powerhead.flowRateGPH],
    substrate: e.substrate.type,
    hardscape: e.hardscape.items.map((item) => item.type).sort(),
    light: [e.light.enabled, e.light.wattage, ...schedule(e.light.schedule)],
    co2: [e.co2Generator.enabled, e.co2Generator.bubbleRate, ...schedule(e.co2Generator.schedule)],
    airPump: e.airPump.enabled,
    autoDoser: [e.autoDoser.enabled, e.autoDoser.doseAmountMl, ...schedule(e.autoDoser.schedule)],
  });
}

const PRESET_SETTINGS = new Map<PresetId, string>(
  PRESETS.map((preset) => [preset.id, presetSettings(createSimulation(preset.config))])
);

/**
 * Whether the tank has moved away from the preset it was built from. Derived
 * rather than tracked, so a change and its undo cancel out, a reload cannot
 * lose it, and it is true exactly when Restore has something to put back.
 */
export function driftsFromPreset(state: SimulationState, presetId: PresetId): boolean {
  return presetSettings(state) !== PRESET_SETTINGS.get(presetId);
}

export interface DerivedReading {
  label: string;
  value: string;
  note?: string;
}

/** What the environment fields do to the tank, in the engine's own terms. */
export function environmentDerived(
  state: SimulationState,
  config: TunableConfig
): DerivedReading[] {
  const { environment, equipment, resources, tank } = state;
  const evaporation = calculateEvaporationRatePerDay(
    resources.temperature,
    environment.roomTemperature,
    equipment.lid.type,
    config.evaporation
  );
  const flow = getFilterFlow(equipment.filter.type, tank.capacity);

  return [
    {
      label: 'Evaporation',
      value: evaporation === 0 ? 'none' : `${evaporation.toFixed(1)} %/d`,
      note: LID_LABEL[equipment.lid.type],
    },
    { label: 'Bacteria surface', value: SurfaceResource.format(resources.surface) },
    {
      label: 'Filter turnover',
      value: equipment.filter.enabled ? turnover(flow, resources.water) : 'none',
      note: equipment.filter.enabled ? undefined : 'filter off',
    },
    {
      label: 'Plant slots',
      value: String(getMaxPlants(tank.capacity)),
      note: `${state.plants.length} used`,
    },
  ];
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

/**
 * Whether loading a preset would cost anything. A tank with no clock on it and
 * nothing living in it is already what a preset builds, so asking would cost
 * more than the load does.
 */
export function presetLoadDestroys(state: SimulationState): boolean {
  return atStake(state).length > 0;
}

export function presetLoadMessage(name: string, state: SimulationState): string {
  const stake = atStake(state);
  const loss =
    stake.length === 0
      ? ''
      : ` This one — ${stake.join(' · ')} — goes, water chemistry and biofilter with it.`;

  return `Starts “${name}” as a new tank at hour zero.${loss}`;
}
