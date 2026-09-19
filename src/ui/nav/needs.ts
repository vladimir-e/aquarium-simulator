/**
 * What needs the keeper now, read off the engine's own latched alert flags —
 * the single source for the top bar's count, the rail's alert dots and the
 * Needs-you strip, so one condition can never be reported twice in different
 * words.
 */

import type { AlertState, SimulationState } from '../../simulation/index.js';
import type { SectionId } from './sections.js';

export interface Need {
  id: keyof AlertState;
  section: SectionId;
  /** The reading and the direction it went, as the strip states it. */
  text: string;
}

/** Worst first: what poisons fish outranks what merely looks bad. */
const NEEDS: readonly Need[] = [
  { id: 'highAmmonia', section: 'water', text: 'NH₃ high' },
  { id: 'highNitrite', section: 'water', text: 'NO₂ high' },
  { id: 'lowOxygen', section: 'water', text: 'O₂ low' },
  { id: 'highCo2', section: 'water', text: 'CO₂ high' },
  { id: 'waterLevelCritical', section: 'water', text: 'Water level critical' },
  { id: 'highNitrate', section: 'water', text: 'NO₃ high' },
  { id: 'highAlgae', section: 'life', text: 'Algae bloom' },
];

export function activeNeeds(state: SimulationState): Need[] {
  return NEEDS.filter((need) => state.alertState[need.id]);
}

/** The sections carrying a dot on the rail. */
export function needySections(needs: Need[]): Set<SectionId> {
  return new Set(needs.map((need) => need.section));
}
