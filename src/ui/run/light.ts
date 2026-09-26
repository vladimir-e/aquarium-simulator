/**
 * The day's light as the plants take it: the substrate's PAR over the last 24
 * hours, against the daily light the neediest species planted starves under.
 */

import { dailyLightEdge, dailyLightIntegral, type SimulationState } from '../../simulation/index.js';
import type { Status } from './status.js';

export const DAILY_LIGHT_DECIMALS = 2;

export interface DailyLightReading {
  /** mol/m²/d */
  value: number;
  text: string;
  /** The daily light edge of the neediest species planted; 0 when nothing is. */
  needed: number;
  /** `need …` beside the reading, empty while nothing is planted. */
  need: string;
  status: Status;
}

export function dailyLightReading(state: SimulationState): DailyLightReading {
  const value = dailyLightIntegral(state.resources.lightByHour);
  const needed = Math.max(0, ...state.plants.map((plant) => dailyLightEdge(plant.species)));

  return {
    value,
    text: value.toFixed(DAILY_LIGHT_DECIMALS),
    needed,
    need: needed > 0 ? `need ${needed.toFixed(DAILY_LIGHT_DECIMALS)}` : '',
    status: needed <= 0 ? 'neutral' : value >= needed ? 'ok' : value > 0 ? 'warn' : 'alert',
  };
}
