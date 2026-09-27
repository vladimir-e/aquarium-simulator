/**
 * What needs the keeper now: every alert the engine latches, and the fish once
 * they starve or fall sick — the single source for the top bar's count, the
 * rail's dots and the Needs-you strip. A need states the figure, the sentence
 * and the tone of the reading behind it, so one condition can never be
 * reported twice in different words or in different colours.
 */

import { ALGAE, ALGAE_KINDS, type AlertState, type SimulationState } from '../../simulation/index.js';
import { verbName, type VerbId } from '../actions';
import type { ReadingBook, ReadingId } from '../readings';
import { bloomVerb, STATUS_SEVERITY, worstStatus } from '../run';
import type { SectionId } from './sections.js';

/** The two tones that ask for the keeper: past a line fish take harm at, and short of it. */
export type NeedTone = 'warn' | 'alert';

export interface Need {
  id: keyof AlertState | 'fish';
  section: SectionId;
  tone: NeedTone;
  /** What went wrong, as the strip states it. */
  text: string;
  /** The figure behind it. */
  figure: string;
  /** What that figure means, in the engine's words. */
  sentence: string;
  /** The verb that answers it, and where the reader goes to use it. */
  verb: string;
  /** The husbandry verb the strip opens; a need answered elsewhere has none. */
  act?: VerbId;
  to: string;
}

/**
 * An engine alert as it is written down: the reading it speaks for, and the
 * verb that answers it — a husbandry verb names itself, and only the two
 * answered by a fitting have a verb of their own to state.
 */
type AlertSpec = {
  id: keyof AlertState;
  section: SectionId;
  text: string;
  reading: ReadingId;
  to: string;
} & ({ act: VerbId; verb?: never } | { act?: never; verb: string });

/** What poisons fish before what merely looks bad. */
const ALERTS: readonly AlertSpec[] = [
  {
    id: 'highAmmonia',
    section: 'water',
    text: 'NH₃ high',
    reading: 'ammonia',
    act: 'waterChange',
    to: '/water',
  },
  {
    id: 'highNitrite',
    section: 'water',
    text: 'NO₂ high',
    reading: 'nitrite',
    act: 'waterChange',
    to: '/water',
  },
  {
    id: 'lowOxygen',
    section: 'water',
    text: 'O₂ low',
    reading: 'oxygen',
    verb: 'Air pump',
    to: '/gear',
  },
  {
    id: 'highCo2',
    section: 'water',
    text: 'CO₂ high',
    reading: 'co2',
    verb: 'CO₂ injector',
    to: '/gear',
  },
  {
    id: 'waterLevelCritical',
    section: 'water',
    text: 'Water level low',
    reading: 'level',
    act: 'topOff',
    to: '/water',
  },
  {
    id: 'highNitrate',
    section: 'water',
    text: 'NO₃ high',
    reading: 'nitrate',
    act: 'waterChange',
    to: '/water',
  },
  ...ALGAE_KINDS.map(
    (kind): AlertSpec => ({
      id: kind,
      section: 'life',
      text: `${ALGAE[kind].name} bloom`,
      reading: kind,
      act: bloomVerb(kind),
      to: '/life',
    })
  ),
];

/** Every alert the strip speaks for, and nothing it does not. */
export const ALERT_IDS: readonly (keyof AlertState)[] = ALERTS.map((spec) => spec.id);

/** Anything short of an alert that still asks for the keeper asks at the milder tone. */
function needTone(tone: string): NeedTone {
  return tone === 'alert' ? 'alert' : 'warn';
}

/** The verb that answers an alert, and the husbandry verb the strip opens where it has one. */
function answer(spec: AlertSpec): Pick<Need, 'verb' | 'act'> {
  return spec.act === undefined ? { verb: spec.verb } : { verb: verbName(spec.act), act: spec.act };
}

function alertNeed(spec: AlertSpec, book: ReadingBook): Need {
  const reading = book.byId[spec.reading];
  return {
    id: spec.id,
    section: spec.section,
    tone: needTone(reading.tone),
    text: spec.text,
    figure: `${reading.value} ${reading.unit}`.trim(),
    sentence: reading.sentence,
    ...answer(spec),
    to: spec.to,
  };
}

/**
 * The fish, once any starve or fall sick. A starving fish is answered by a
 * feeding, in the tone its gut reads; otherwise the worst sick one's ledger
 * names what is charging it.
 */
function fishNeed(book: ReadingBook): Need | null {
  const groups = [...book.roster.fish, ...(book.roster.fry ? [book.roster.fry] : [])];
  const fish = groups.flatMap((group) => group.members);

  const starving = fish.filter((member) => member.gut.word === 'starving');
  if (starving.length > 0) {
    return {
      id: 'fish',
      section: 'life',
      tone: needTone(starving.map((member) => member.gut.status).reduce(worstStatus)),
      text: 'Fish starving',
      figure: `${starving.length} of ${fish.length}`,
      sentence: 'Digesting short of their ration, hunger alone outruns everything they earn.',
      verb: verbName('feed'),
      act: 'feed',
      to: '/life',
    };
  }

  const sick = fish.filter((member) => member.sick);
  if (sick.length === 0) return null;

  const worstFish = sick.reduce((a, b) => (b.condition < a.condition ? b : a));
  return {
    id: 'fish',
    section: 'life',
    tone: needTone(sick.map((member) => member.reading.status).reduce(worstStatus)),
    text: 'Fish sick',
    figure: `${sick.length} of ${fish.length}`,
    sentence: 'Damage is outrunning what their banks heal; the ledger names what is charging it.',
    verb: 'Inspect',
    to: `/life?inspect=${worstFish.id}`,
  };
}

/**
 * Worst tone first, and within a tone the water before the fish before the
 * bloom — the order the rail's dots and the top bar's badge read their tone off.
 */
export function activeNeeds(state: SimulationState, book: ReadingBook): Need[] {
  const latched = (section: SectionId): Need[] =>
    ALERTS.filter((spec) => spec.section === section && state.alertState[spec.id]).map((spec) => alertNeed(spec, book));
  const fish = fishNeed(book);
  return [...latched('water'), ...(fish ? [fish] : []), ...latched('life')].sort(
    (a, b) => STATUS_SEVERITY[b.tone] - STATUS_SEVERITY[a.tone]
  );
}

/** The sections carrying a dot on the rail, each in the tone of its worst need. */
export function needySections(needs: Need[]): Map<SectionId, NeedTone> {
  const sections = new Map<SectionId, NeedTone>();
  for (const need of needs) if (!sections.has(need.section)) sections.set(need.section, need.tone);
  return sections;
}
