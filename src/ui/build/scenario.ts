/**
 * The scenario model: what each preset actually builds, what the environment
 * fields imply, and what the destructive actions cost. Preset copy is read off
 * the state the engine itself creates from the preset, so a card cannot promise
 * something the preset does not build — and none of them build livestock.
 */

import {
  calculateEvaporationRatePerDay,
  createSimulation,
  getFilterFlow,
  getMaxPlants,
  POWERHEAD_FLOW_LPH,
  type LidType,
  type SimulationState,
} from '../../simulation/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { SurfaceResource } from '../../simulation/resources/index.js';
import { PRESETS, type PresetId } from '../presets.js';
import { TICKS_PER_DAY } from '../utils/clock.js';
import {
  formatFlowRate,
  formatTemperature,
  formatVolume,
  type UnitSystem,
} from '../utils/units.js';
import { turnoverRatio } from './readings.js';
import { scapeSummary } from './scape.js';
import { scheduleRange } from './schedules.js';

/** The lid in prose — the rail, the preset cards and the evaporation row agree. */
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
  /** Substrate and hardscape, in the Scape card's words. */
  scape: string;
  /** The devices the preset switches on, each with its engine figure. */
  gear: string;
}

function gearSummary(state: SimulationState, units: UnitSystem): string {
  const { airPump, ato, co2Generator, filter, heater, light, lid, powerhead } = state.equipment;
  const parts: string[] = [];

  if (filter.enabled) {
    const flow = getFilterFlow(filter.type, state.tank.capacity);
    parts.push(`${filter.type} ${formatFlowRate(flow, units)}`);
  }
  if (heater.enabled) {
    parts.push(`${heater.wattage} W heater → ${formatTemperature(heater.targetTemperature, units, 0)}`);
  }
  if (light.enabled) {
    parts.push(`${light.wattage} W light ${scheduleRange(light.schedule)}`);
  }
  if (co2Generator.enabled) {
    parts.push(`CO₂ ${co2Generator.bubbleRate.toFixed(1)} bps`);
  }
  if (airPump.enabled) parts.push('air pump');
  if (powerhead.enabled) {
    parts.push(`powerhead ${formatFlowRate(POWERHEAD_FLOW_LPH[powerhead.flowRateGPH], units)}`);
  }
  if (ato.enabled) parts.push('ATO');
  if (parts.length === 0) parts.push('no equipment');

  parts.push(LID_LABEL[lid.type]);
  return parts.join(' · ');
}

export function presetCards(units: UnitSystem): PresetCard[] {
  return PRESETS.map((preset) => {
    const built = createSimulation(preset.config);
    const { hardscape, substrate } = built.equipment;
    return {
      id: preset.id,
      name: preset.name,
      volume: formatVolume(built.tank.capacity, units, 0),
      scape: scapeSummary(substrate.type, hardscape.items),
      gear: gearSummary(built, units),
    };
  });
}

export interface DerivedReading {
  label: string;
  value: string;
  note?: string;
}

/** What the fields above this block do to the tank, in the engine's own terms. */
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
      value: equipment.filter.enabled
        ? `${turnoverRatio(flow, tank.capacity).toFixed(1)} ×/h`
        : 'none',
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
 * 30 days. Below it a reset costs little enough that interrupting to ask costs
 * more than the reset does.
 */
export const RESET_CONFIRM_TICKS = 720;

/** The standing statement of what Reset takes and what it leaves. */
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
 * Loading a preset rebuilds the world around the run rather than replacing it.
 * Both dialogs say so in the same words, because it is the same consequence.
 */
const PRESET_CONSEQUENCE =
  'The run is not reset — the clock, plants and fish carry over — but playback pauses and the charts start over.';

export function presetSwitchMessage(name: string): string {
  return `Rebuilds the tank, equipment, scape and environment as “${name}”. ${PRESET_CONSEQUENCE}`;
}

export function presetRestoreMessage(name: string): string {
  return `Puts the tank, equipment, scape and environment back to the “${name}” defaults. ${PRESET_CONSEQUENCE}`;
}
