import type { SimulationState } from '../../simulation/index.js';
import { createPresetSimulation, getPresetById, type PresetId } from '../../simulation/presets.js';
import { TICKS_PER_DAY } from '../utils/clock.js';

/**
 * The tank a preset builds, both halves of it, as `loadPreset` does — with
 * `days` on the clock when a test needs the load to have something to destroy.
 */
export function presetTank(id: PresetId, { days = 0 }: { days?: number } = {}): SimulationState {
  const built = createPresetSimulation(getPresetById(id)!);
  return days === 0 ? built : { ...built, tick: days * TICKS_PER_DAY };
}
