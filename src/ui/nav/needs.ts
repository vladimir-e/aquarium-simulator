/**
 * What needs the keeper now, read off the engine's own latched alert flags —
 * the single source for the top bar's count, the rail's alert dots and the
 * Needs-you strip, so one condition can never be reported twice in different
 * words.
 */

import type { AlertState, SimulationState } from '../../simulation/index.js';
import type { SectionId } from './sections.js';

/** `alert` is what the engine calls toxic; `warn` is what it says to consider. */
export type NeedTone = 'warn' | 'alert';

export interface Need {
  id: keyof AlertState;
  section: SectionId;
  tone: NeedTone;
  /** The reading and the direction it went, as the strip states it. */
  text: string;
}

/** Worst first: what poisons fish outranks what merely looks bad. */
export const NEEDS: readonly Need[] = [
  { id: 'highAmmonia', section: 'water', tone: 'alert', text: 'NH₃ high' },
  { id: 'highNitrite', section: 'water', tone: 'alert', text: 'NO₂ high' },
  { id: 'lowOxygen', section: 'water', tone: 'alert', text: 'O₂ low' },
  { id: 'highCo2', section: 'water', tone: 'alert', text: 'CO₂ high' },
  { id: 'waterLevelCritical', section: 'water', tone: 'alert', text: 'Water level critical' },
  { id: 'highNitrate', section: 'water', tone: 'warn', text: 'NO₃ high' },
  { id: 'highAlgae', section: 'life', tone: 'warn', text: 'Algae bloom' },
];

export function activeNeeds(state: SimulationState): Need[] {
  return NEEDS.filter((need) => state.alertState[need.id]);
}

/** The sections carrying a dot on the rail, each in the tone of its worst need. */
export function needySections(needs: Need[]): Map<SectionId, NeedTone> {
  const sections = new Map<SectionId, NeedTone>();
  for (const need of needs) if (!sections.has(need.section)) sections.set(need.section, need.tone);
  return sections;
}
