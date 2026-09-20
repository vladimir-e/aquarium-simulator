import React from 'react';
import { ChevronDown, ChevronRight, Coins, X } from 'lucide-react';
import { toneOf } from '../../readings';
import {
  CONDITION_BAND,
  type IndividualRosterRow,
  type RosterRow,
  type Satiation,
  type SpeciesRosterRow,
  type Status,
} from '../../run';
import { DotStrip } from '../ui/DotStrip';
import { RangeStrip, TONE_TEXT } from '../ui/RangeStrip';
import { SpeciesGlyph, type SpeciesKey } from '../ui/SpeciesGlyph';

/**
 * The roster's two tables and the Overview's window onto them are one row, laid
 * out three ways: the fish table carries satiation and age, the plant table
 * neither, and the widget keeps only what survives at 340 px — the name, the
 * count and how the individuals are doing.
 */
export type RosterLayout = 'fish' | 'plants' | 'widget';

const TEMPLATE: Record<RosterLayout, string> = {
  fish: 'grid-cols-[16px_minmax(0,1fr)_44px_78px_56px_84px_92px_76px_28px]',
  plants: 'grid-cols-[16px_minmax(0,1fr)_44px_78px_92px_76px_28px]',
  widget: 'grid-cols-[16px_minmax(0,1fr)_40px_80px_68px]',
};

const HEADINGS: Record<RosterLayout, string[]> = {
  fish: ['', 'species', 'count', 'mass', 'age', 'satiation', 'condition', 'status', ''],
  plants: ['', 'species', 'count', 'size', 'condition', 'status', ''],
  widget: [],
};

const ROW =
  'relative grid h-11 w-full items-center gap-2.5 border-t border-hairline first:border-t-0';

const CELL = 'pointer-events-none truncate';
const FIGURE = `${CELL} text-right tabular-nums text-[13px] text-ink-2`;

/** The row-wide target, under every cell so the columns stay one grid. */
function RowButton({
  label,
  onClick,
  expanded,
}: {
  label: string;
  onClick: () => void;
  expanded?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      className="absolute inset-0 rounded-none transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    />
  );
}

function Word({ status, word }: { status: Status; word: string }): React.JSX.Element {
  return (
    <span className={`${CELL} text-right text-[13px] ${TONE_TEXT[toneOf(status)]}`}>{word}</span>
  );
}

function SatiationCell({ satiation }: { satiation: Satiation | null }): React.JSX.Element {
  if (!satiation) return <span aria-hidden />;
  return (
    <span className="pointer-events-none">
      <RangeStrip at={satiation.at} band={satiation.band} tone={toneOf(satiation.status)} />
    </span>
  );
}

function ConditionCell({
  at,
  status,
  dots,
  label,
}: {
  at: number;
  status: Status;
  /** One per individual, above the group's mean — a group reads as its worst. */
  dots?: Status[];
  label: string;
}): React.JSX.Element {
  return (
    <span className="pointer-events-none flex flex-col justify-center gap-1.5">
      {dots && dots.length > 0 && <DotStrip statuses={dots} label={label} />}
      <RangeStrip at={at} band={CONDITION_BAND} tone={toneOf(status)} />
    </span>
  );
}

function Name({
  species,
  name,
  strong = false,
}: {
  species: SpeciesKey;
  name: string;
  strong?: boolean;
}): React.JSX.Element {
  return (
    <>
      <SpeciesGlyph species={species} className="pointer-events-none" />
      <span className={`${CELL} text-[14px] ${strong ? 'font-medium text-ink' : 'text-ink-2'}`}>
        {name}
      </span>
    </>
  );
}

function SpeciesLine({
  row,
  layout,
  onToggle,
  onInspect,
}: {
  row: SpeciesRosterRow;
  layout: RosterLayout;
  onToggle: () => void;
  onInspect: () => void;
}): React.JSX.Element {
  const Caret = row.expanded ? ChevronDown : ChevronRight;

  return (
    <div className={`${ROW} ${TEMPLATE[layout]}`}>
      <RowButton
        label={`${row.name} — ${row.count}, ${row.word}`}
        onClick={onToggle}
        expanded={row.expanded}
      />
      <Name species={row.species} name={row.name} strong />
      <span className={`${CELL} flex items-center justify-end gap-0.5 text-[13px] text-ink-2`}>
        <Caret className="h-3 w-3 text-ink-3" aria-hidden />×{row.count}
      </span>
      {layout !== 'widget' && <span className={FIGURE}>{row.figure}</span>}
      {layout === 'fish' && <span className={FIGURE}>{row.age}</span>}
      {layout === 'fish' && <span aria-hidden />}
      <ConditionCell
        at={row.at}
        status={row.status}
        dots={row.dots}
        label={`${row.name} by individual`}
      />
      <button
        type="button"
        onClick={onInspect}
        aria-label={`${row.name} — inspect the worst of ${row.count}`}
        className={`truncate text-right text-[13px] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${TONE_TEXT[toneOf(row.status)]}`}
      >
        {row.word}
      </button>
      {layout !== 'widget' && <span aria-hidden />}
    </div>
  );
}

const SEX: Record<string, string> = { male: '♂', female: '♀' };

function IndividualLine({
  row,
  layout,
  onInspect,
  onRemove,
}: {
  row: IndividualRosterRow;
  layout: RosterLayout;
  onInspect: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <div className={`${ROW} ${TEMPLATE[layout]}`}>
      <RowButton label={`${row.name} ${row.shortId} — ${row.word}`} onClick={onInspect} />
      <span aria-hidden />
      <span className={`${CELL} pl-6 text-[13px] tabular-nums text-ink-2`}>
        {row.shortId}
        {row.sex && (
          <span className="ml-1.5 text-ink-3" title={row.sex}>
            {SEX[row.sex]}
          </span>
        )}
      </span>
      <span aria-hidden />
      <span className={FIGURE}>{row.figure}</span>
      {layout === 'fish' && <span className={FIGURE}>{row.age}</span>}
      {layout === 'fish' && <SatiationCell satiation={row.satiation} />}
      <ConditionCell at={row.at} status={row.status} label={`${row.name} condition`} />
      <Word status={row.status} word={row.word} />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${row.name} ${row.shortId}`}
        className="flex h-6 w-6 items-center justify-center justify-self-center rounded-control text-ink-3 transition-colors hover:text-alert focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export interface RosterHandlers {
  onToggle: (key: string) => void;
  onInspect: (row: RosterRow) => void;
  onRemove: (id: string) => void;
  /** Sells every fry in the tank — the engine's action takes no batch. */
  onSellFry: () => void;
}

function Line({
  row,
  layout,
  handlers,
}: {
  row: RosterRow;
  layout: RosterLayout;
  handlers: RosterHandlers;
}): React.JSX.Element {
  switch (row.kind) {
    case 'species':
      return (
        <SpeciesLine
          row={row}
          layout={layout}
          onToggle={() => handlers.onToggle(row.key)}
          onInspect={() => handlers.onInspect(row)}
        />
      );
    case 'individual':
      return (
        <IndividualLine
          row={row}
          layout={layout}
          onInspect={() => handlers.onInspect(row)}
          onRemove={() => handlers.onRemove(row.id)}
        />
      );
    case 'population':
      return (
        <div className={`${ROW} ${TEMPLATE[layout]}`}>
          <RowButton label={`${row.name} — ${row.word}`} onClick={() => handlers.onInspect(row)} />
          <SpeciesGlyph species="algae" className="pointer-events-none" />
          <span className={`${CELL} text-[14px] font-medium text-ink`}>
            {row.name}
            {layout === 'widget' && (
              <span className="ml-1.5 text-[13px] font-normal text-ink-2">{row.figure}</span>
            )}
          </span>
          {layout === 'widget' ? (
            <span aria-hidden />
          ) : (
            <span className={`${CELL} col-span-2 text-right text-[13px] text-ink-2`}>
              {row.figure}
              {row.trend && <span className="ml-1.5 tabular-nums text-ink-3">{row.trend}</span>}
            </span>
          )}
          <span className="pointer-events-none">
            <RangeStrip at={row.at} band={row.band} tone={toneOf(row.status)} />
          </span>
          <Word status={row.status} word={row.word} />
          {layout !== 'widget' && <span aria-hidden />}
        </div>
      );
    case 'fry':
      return (
        <div className={`${ROW} ${TEMPLATE[layout]}`}>
          <Name species={row.species} name={row.name} />
          <span className={`${CELL} text-right text-[13px] text-ink-2`}>×{row.count}</span>
          <span className={FIGURE}>{row.figure}</span>
          <span className={FIGURE}>{row.age}</span>
          <SatiationCell satiation={row.satiation} />
          <ConditionCell at={row.at} status={row.status} label={`${row.name} condition`} />
          <Word status={row.status} word={row.word} />
          <button
            type="button"
            onClick={handlers.onSellFry}
            aria-label={`Sell ${row.count} fry`}
            className="flex h-6 w-6 items-center justify-center justify-self-center rounded-control text-ink-3 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            <Coins className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    case 'clutch':
      return (
        <div className={`${ROW} ${TEMPLATE[layout]}`}>
          <Name species={row.species} name={row.name} />
          <span aria-hidden />
          <span className={FIGURE}>{row.figure}</span>
          <span className={`${CELL} col-span-4 text-[13px] text-ink-3`}>{row.age}</span>
          <span aria-hidden />
        </div>
      );
  }
}

/** One table: its column headings once, then the rows. */
export function Roster({
  layout,
  rows,
  handlers,
}: {
  layout: RosterLayout;
  rows: RosterRow[];
  handlers: RosterHandlers;
}): React.JSX.Element {
  return (
    <div>
      {layout !== 'widget' && (
        <div className={`grid h-6 items-center gap-2.5 ${TEMPLATE[layout]}`}>
          {HEADINGS[layout].map((heading, i) => (
            <span
              key={i}
              className={`truncate text-[11px] text-ink-3 ${i > 2 ? 'text-right' : ''}`}
            >
              {heading}
            </span>
          ))}
        </div>
      )}
      {rows.map((row) => (
        <Line key={row.key} row={row} layout={layout} handlers={handlers} />
      ))}
    </div>
  );
}

/** Nothing stocked: the outline of what would be here, and the verb that puts it there. */
export function RosterEmpty({
  species,
  line,
  verb,
  onAdd,
}: {
  species: SpeciesKey;
  line: string;
  verb: string;
  onAdd: () => void;
}): React.JSX.Element {
  return (
    <div className="flex h-24 flex-col items-center justify-center gap-1.5 text-[13px] text-ink-2">
      <SpeciesGlyph species={species} className="h-6 w-6 text-ink-3" />
      <p>
        {line} —{' '}
        <button
          type="button"
          onClick={onAdd}
          className="text-accent underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {verb}
        </button>
      </p>
    </div>
  );
}
