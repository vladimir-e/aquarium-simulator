import React from 'react';
import type { SimulationState } from '../../../simulation/index.js';
import { toneOf, type ReadingBook, type ReadingId } from '../../readings';
import { conditionStatus, conditionWord, type Status } from '../../run';
import { DotStrip } from '../ui/DotStrip';
import { Glyph } from '../ui/Glyph';
import { RangeStrip, TONE_TEXT, type StripBand } from '../ui/RangeStrip';
import { VerbButton } from '../ui/VerbButton';
import { Widget } from '../ui/Widget';

/** Condition is scored 0–100; the engine calls 60 and up healthy. */
const CONDITION_BAND = { from: 0.6, to: 1 };

function Row({
  name,
  detail,
  dots = [],
  at,
  band,
  status,
  word,
  onClick,
}: {
  name: string;
  detail: string;
  /** One per individual; a row with none carries no strip of dots. */
  dots?: Status[];
  /** Where the row's own strip sits, or null where it carries none. */
  at: number | null;
  band: StripBand | null;
  status: Status;
  word: string;
  onClick?: () => void;
}): React.JSX.Element {
  const tone = toneOf(status);
  const body = (
    <>
      <Glyph />
      <span className="min-w-0 truncate text-left">
        <span className="font-medium">{name}</span>
        <span className="ml-1.5 text-[13px] text-ink-2">{detail}</span>
      </span>
      <span className="flex flex-col justify-center gap-1.5">
        {dots.length > 0 && <DotStrip statuses={dots} label={`${name} by individual`} />}
        {at !== null && <RangeStrip at={at} band={band} tone={tone} />}
      </span>
      <span className={`truncate text-right text-[13px] ${TONE_TEXT[tone]}`}>{word}</span>
    </>
  );

  const shape =
    'grid h-10 w-full grid-cols-[16px_minmax(0,1fr)_80px_minmax(0,68px)] items-center gap-2.5 border-t border-hairline first:border-t-0';

  if (!onClick) return <div className={shape}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${shape} transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`}
    >
      {body}
    </button>
  );
}

interface LifeWidgetProps {
  book: ReadingBook;
  state: SimulationState;
  onOpenReading: (id: ReadingId) => void;
  onAct: () => void;
}

/**
 * Who lives here and how they are doing — fish and plants folded into species
 * rows, and the algae as the population it competes with them as.
 */
export function LifeWidget({
  book,
  state,
  onOpenReading,
  onAct,
}: LifeWidgetProps): React.JSX.Element {
  const { fish: species, plants, algae } = book.roster;
  const algaeReading = book.byId.algae;

  const empty = species.length === 0 && plants.length === 0;

  return (
    <Widget
      title="Life"
      caption={`${state.fish.length} fish · ${state.plants.length} plants`}
      to="/life"
      footer={
        <>
          <VerbButton label="Feed" onClick={onAct} />
          <VerbButton label="Trim" onClick={onAct} />
          <VerbButton label="Scrub" onClick={onAct} />
          <VerbButton label="+ Add" onClick={onAct} className="ml-auto" />
        </>
      }
    >
      {empty && (
        <p className="py-3 text-[13px] text-ink-2">Nothing stocked yet — add fish or plants.</p>
      )}

      {species.map((group) => (
        <Row
          key={group.species}
          name={group.name}
          detail={`×${group.count} · ${(group.massG / group.count).toFixed(2)} g each`}
          dots={group.fish.map((fish) => conditionStatus(fish.health))}
          at={group.condition / 100}
          band={CONDITION_BAND}
          status={conditionStatus(group.condition)}
          word={conditionWord(group.condition)}
        />
      ))}

      {plants.map((group) => (
        <Row
          key={group.species}
          name={group.name}
          detail={`×${group.count} · ${Math.round(group.size)} % size`}
          dots={group.statuses}
          at={group.condition / 100}
          band={CONDITION_BAND}
          status={group.status}
          word={group.word}
        />
      ))}

      <Row
        name="Algae"
        detail={`${algaeReading.value} % coverage${
          algaeReading.trend ? ` · ${algaeReading.trend} %` : ''
        }`}
        at={algaeReading.at}
        band={algaeReading.band}
        status={algae.status}
        word={algae.word}
        onClick={() => onOpenReading('algae')}
      />
    </Widget>
  );
}
