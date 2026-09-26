/**
 * The day's light: the substrate's PAR over the 24 hours the next tick reads,
 * judged by the plants actually planted, each on the light at its own height.
 */

import type { PlantLight } from '../../simulation/index.js';
import type { HourAhead } from './ahead.js';
import type { Status } from './status.js';

export const DAILY_LIGHT_DECIMALS = 2;

export const DAILY_LIGHT_UNIT = 'mol/m²/d';

export interface DailyLightReading {
  value: number;
  text: string;
  /** The day's light at the substrate the worst-lit plant starves under; 0 when nothing is planted. */
  needed: number;
  /** `need …` beside the reading, empty while nothing is planted. */
  need: string;
  status: Status;
}

/** The plant furthest from its need at its own height: the one needing the most substrate light. */
function worstLit(plants: readonly PlantLight[]): PlantLight | null {
  return plants.reduce<PlantLight | null>(
    (worst, plant) => (worst === null || plant.substrateEdge > worst.substrateEdge ? plant : worst),
    null
  );
}

/** How a plant's light reads off its share of what its species starves under. */
export function lightStatus(needShare: number): Status {
  return needShare >= 1 ? 'ok' : needShare > 0 ? 'warn' : 'alert';
}

export function dailyLightReading(ahead: HourAhead): DailyLightReading {
  const value = ahead.dailyLight;
  const worst = worstLit(ahead.plants.map((plant) => plant.light));
  const needed = worst?.substrateEdge ?? 0;

  return {
    value,
    text: value.toFixed(DAILY_LIGHT_DECIMALS),
    needed,
    need: worst ? `need ${needed.toFixed(DAILY_LIGHT_DECIMALS)}` : '',
    status: worst === null ? 'neutral' : lightStatus(worst.needShare),
  };
}
