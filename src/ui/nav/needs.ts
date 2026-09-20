/**
 * What needs the keeper now, read off the engine's own latched alert flags —
 * the single source for the top bar's count, the rail's alert dots and the
 * Needs-you strip, so one condition can never be reported twice in different
 * words.
 */

import type { AlertState, SimulationState } from '../../simulation/index.js';
import { verbName, type VerbId } from '../actions';
import type { ReadingId } from '../readings';
import type { SectionId } from './sections.js';

/** `alert` is what the engine calls toxic; `warn` is what it says to consider. */
export type NeedTone = 'warn' | 'alert';

export interface Need {
  id: keyof AlertState;
  section: SectionId;
  tone: NeedTone;
  /** The reading and the direction it went, as the strip states it. */
  text: string;
  /** The reading behind it, so the strip can state the band in the engine's words. */
  reading: ReadingId;
  /** The verb that answers it, and where the reader goes to use it. */
  verb: string;
  /** The husbandry verb the strip opens; a need answered by gear has none. */
  act?: VerbId;
  to: string;
}

/**
 * A need as it is written down: a husbandry verb names itself, and only the two
 * answered by a fitting have a verb of their own to state.
 */
type NeedSpec = Omit<Need, 'verb' | 'act'> &
  ({ act: VerbId; verb?: never } | { act?: never; verb: string });

function stated(spec: NeedSpec): Need {
  return spec.act === undefined ? spec : { ...spec, verb: verbName(spec.act) };
}

/** Worst first: what poisons fish outranks what merely looks bad. */
const WRITTEN: readonly NeedSpec[] = [
  {
    id: 'highAmmonia',
    section: 'water',
    tone: 'alert',
    text: 'NH₃ high',
    reading: 'ammonia',
    act: 'waterChange',
    to: '/water',
  },
  {
    id: 'highNitrite',
    section: 'water',
    tone: 'alert',
    text: 'NO₂ high',
    reading: 'nitrite',
    act: 'waterChange',
    to: '/water',
  },
  {
    id: 'lowOxygen',
    section: 'water',
    tone: 'alert',
    text: 'O₂ low',
    reading: 'oxygen',
    verb: 'Air pump',
    to: '/gear',
  },
  {
    id: 'highCo2',
    section: 'water',
    tone: 'alert',
    text: 'CO₂ high',
    reading: 'co2',
    verb: 'CO₂ injector',
    to: '/gear',
  },
  {
    id: 'waterLevelCritical',
    section: 'water',
    tone: 'alert',
    text: 'Water level critical',
    reading: 'level',
    act: 'topOff',
    to: '/water',
  },
  {
    id: 'highNitrate',
    section: 'water',
    tone: 'warn',
    text: 'NO₃ high',
    reading: 'nitrate',
    act: 'waterChange',
    to: '/water',
  },
  {
    id: 'highAlgae',
    section: 'life',
    tone: 'warn',
    text: 'Algae bloom',
    reading: 'algae',
    act: 'scrubAlgae',
    to: '/life',
  },
];

export const NEEDS: readonly Need[] = WRITTEN.map(stated);

export function activeNeeds(state: SimulationState): Need[] {
  return NEEDS.filter((need) => state.alertState[need.id]);
}

/** The sections carrying a dot on the rail, each in the tone of its worst need. */
export function needySections(needs: Need[]): Map<SectionId, NeedTone> {
  const sections = new Map<SectionId, NeedTone>();
  for (const need of needs) if (!sections.has(need.section)) sections.set(need.section, need.tone);
  return sections;
}
