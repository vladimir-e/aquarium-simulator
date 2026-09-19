import React from 'react';
import type { TunableConfig } from '../../../simulation/config/index.js';
import type { SimulationState } from '../../../simulation/index.js';
import type { ReadingBook, ReadingId } from '../../readings';
import {
  algaeRow,
  conditionStatus,
  conditionWord,
  groupBySpecies,
  plantRows,
  type Status,
} from '../../run';
import { DotStrip } from '../ui/DotStrip';
import { Glyph } from '../ui/Glyph';
import { RangeStrip, type StripBand } from '../ui/RangeStrip';
import { VerbButton } from '../ui/VerbButton';
import { Widget } from '../ui/Widget';

/** Condition is scored 0–100; the engine calls 60 and up healthy. */
const CONDITION_BAND = { from: 0.6, to: 1 };

const WORD_TONE: Record<Status, string> = {
  ok: 'text-ink-2',
  neutral: 'text-ink-2',
  warn: 'text-warn',
  alert: 'text-alert',
};

function toneOf(status: Status): 'ink' | 'warn' | 'alert' {
  return status === 'warn' || status === 'alert' ? status : 'ink';
}

function Row({
  name,
  detail,
  dots,
  at,
  band,
  status,
  word,
  onClick,
}: {
  name: string;
  detail: string;
  dots: Status[];
  /** Where the row's own strip sits, or null where it carries none. */
  at: number | null;
  band: StripBand | null;
  status: Status;
  word: string;
  onClick?: () => void;
}): React.JSX.Element {
  const body = (
    <>
      <Glyph />
      <span className="min-w-0 truncate text-left">
        <span className="font-medium">{name}</span>
        <span className="ml-1.5 text-[13px] text-ink-2">{detail}</span>
      </span>
      <span className="flex flex-col justify-center gap-1.5">
        <DotStrip statuses={dots} label={`${name} by individual`} />
        {at !== null && <RangeStrip at={at} band={band} tone={toneOf(status)} />}
      </span>
      <span className={`truncate text-right text-[13px] ${WORD_TONE[status]}`}>{word}</span>
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
  config: TunableConfig;
  onOpenReading: (id: ReadingId) => void;
  onAct: () => void;
}

/**
 * Who lives here and how they are doing — fish folded into species rows, plants
 * one row each, and the algae as the population it competes with them as.
 */
export function LifeWidget({
  book,
  state,
  config,
  onOpenReading,
  onAct,
}: LifeWidgetProps): React.JSX.Element {
  const species = groupBySpecies(state, config.livestock);
  const plants = plantRows(state, config);
  const algae = algaeRow(state, config);
  const algaeReading = book.byId.algae;

  const empty = species.length === 0 && plants.length === 0;

  return (
    <Widget
      title="Life"
      caption={`${state.fish.length} fish · ${plants.length} plants`}
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

      {plants.map((plant) => (
        <Row
          key={plant.id}
          name={plant.name}
          detail={`${Math.round(plant.size)} % size`}
          dots={[plant.status]}
          at={plant.condition / 100}
          band={CONDITION_BAND}
          status={plant.status}
          word={plant.word}
        />
      ))}

      <Row
        name="Algae"
        detail={`${algaeReading.value} % coverage`}
        dots={[]}
        at={algaeReading.at}
        band={algaeReading.band}
        status={algae.status}
        word={algaeReading.trend || algae.word}
        onClick={() => onOpenReading('algae')}
      />
    </Widget>
  );
}
