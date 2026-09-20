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
import { CONTROL_FOCUS, TIGHT_FOCUS } from '../ui/focus';
import { RangeStrip, TONE_TEXT } from '../ui/RangeStrip';
import { CELL, ROW, ROW_H, RowOverlay, WIDE } from '../ui/row';
import { SpeciesGlyph, type SpeciesKey } from '../ui/SpeciesGlyph';

/**
 * One row, laid out three ways. Each layout fixes its column count, so a row
 * kind must emit exactly that many cells: nine for the fish table at tablet
 * width, seven for the plants, five for the widget, and six for either table on
 * a phone — which is what the {@link WIDE} cells fall out to.
 */
export type RosterLayout = 'fish' | 'plants' | 'widget';

/** The layouts that print headings, and the figures the widget has no room for. */
type TableLayout = Exclude<RosterLayout, 'widget'>;

const TEMPLATE: Record<RosterLayout, string> = {
  fish: 'grid-cols-[16px_minmax(0,1fr)_44px_84px_68px_24px] md:grid-cols-[16px_minmax(0,1fr)_52px_92px_64px_140px_160px_88px_28px]',
  plants:
    'grid-cols-[16px_minmax(0,1fr)_44px_84px_68px_24px] md:grid-cols-[16px_minmax(0,1fr)_52px_92px_160px_88px_28px]',
  widget: 'grid-cols-[16px_minmax(0,1fr)_40px_80px_68px]',
};

interface Heading {
  label: string;
  wide?: boolean;
}

const HEADINGS: Record<TableLayout, Heading[]> = {
  fish: [
    { label: '' },
    { label: 'species' },
    { label: 'count' },
    { label: 'mass', wide: true },
    { label: 'age', wide: true },
    { label: 'satiation', wide: true },
    { label: 'condition' },
    { label: 'status' },
    { label: '' },
  ],
  plants: [
    { label: '' },
    { label: 'species' },
    { label: 'count' },
    { label: 'size', wide: true },
    { label: 'condition' },
    { label: 'status' },
    { label: '' },
  ],
};

const FIGURE = `${CELL} text-right tabular-nums text-[13px] text-ink-2`;

function Word({ status, word }: { status: Status; word: string }): React.JSX.Element {
  return (
    <span className={`${CELL} text-right text-[13px] ${TONE_TEXT[toneOf(status)]}`}>{word}</span>
  );
}

function SatiationCell({
  satiation,
  wide = false,
}: {
  satiation: Satiation | null;
  wide?: boolean;
}): React.JSX.Element {
  if (!satiation) return <span aria-hidden className={wide ? WIDE : ''} />;
  return (
    <span className={`relative pointer-events-none ${wide ? WIDE : ''}`}>
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
    <span className="relative pointer-events-none flex flex-col justify-center gap-1.5">
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
      <SpeciesGlyph species={species} className="relative pointer-events-none" />
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
    <div className={`${ROW} ${ROW_H} ${TEMPLATE[layout]}`}>
      <RowOverlay
        label={`${row.name} — ${row.count}, ${row.word}`}
        onClick={onToggle}
        expanded={row.expanded}
      />
      <Name species={row.species} name={row.name} strong />
      <span className={`${CELL} flex items-center justify-end gap-0.5 text-[13px] text-ink-2`}>
        {layout !== 'widget' && <Caret className="h-3 w-3 text-ink-3" aria-hidden />}×{row.count}
      </span>
      {layout !== 'widget' && <span className={`${FIGURE} ${WIDE}`}>{row.figure}</span>}
      {layout === 'fish' && <span className={`${FIGURE} ${WIDE}`}>{row.age}</span>}
      {layout === 'fish' && <SatiationCell satiation={row.satiation} wide />}
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
        className={`relative truncate text-right text-[13px] underline-offset-2 hover:underline ${TIGHT_FOCUS} ${TONE_TEXT[toneOf(row.status)]}`}
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
    <div className={`${ROW} ${ROW_H} ${TEMPLATE[layout]}`}>
      <RowOverlay label={`${row.name} ${row.shortId} — ${row.word}`} onClick={onInspect} />
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
      {layout !== 'widget' && <span className={`${FIGURE} ${WIDE}`}>{row.figure}</span>}
      {layout === 'fish' && <span className={`${FIGURE} ${WIDE}`}>{row.age}</span>}
      {layout === 'fish' && <SatiationCell satiation={row.satiation} wide />}
      <ConditionCell at={row.at} status={row.status} label={`${row.name} condition`} />
      <Word status={row.status} word={row.word} />
      {layout !== 'widget' && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${row.name} ${row.shortId}`}
          className={`relative flex h-6 w-6 items-center justify-center justify-self-center rounded-control text-ink-3 transition-colors hover:text-alert ${TIGHT_FOCUS}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export interface RosterHandlers {
  onToggle: (key: string) => void;
  onInspect: (row: RosterRow) => void;
  onRemove: (id: string) => void;
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
        <div className={`${ROW} ${ROW_H} ${TEMPLATE[layout]}`}>
          <RowOverlay label={`${row.name} — ${row.word}`} onClick={() => handlers.onInspect(row)} />
          <SpeciesGlyph species="algae" className="relative pointer-events-none" />
          <span className={`${CELL} text-[14px] font-medium text-ink`}>
            {row.name}
            <span className={`ml-1.5 text-[13px] font-normal text-ink-2 ${layout === 'widget' ? '' : 'md:hidden'}`}>
              {row.figure}
            </span>
          </span>
          {layout === 'widget' ? (
            <span aria-hidden />
          ) : (
            <>
              <span aria-hidden className="md:hidden" />
              <span className={`${CELL} col-span-2 text-right text-[13px] text-ink-2 ${WIDE}`}>
                {row.figure} {row.caption}
                {row.trend && <span className="ml-1.5 tabular-nums text-ink-3">{row.trend}</span>}
              </span>
            </>
          )}
          <span className="relative pointer-events-none">
            <RangeStrip at={row.at} band={row.band} tone={toneOf(row.status)} />
          </span>
          <Word status={row.status} word={row.word} />
          {layout !== 'widget' && <span aria-hidden />}
        </div>
      );
    case 'fry':
      return (
        <div className={`${ROW} ${ROW_H} ${TEMPLATE[layout]}`}>
          <span aria-hidden />
          <span className={`${CELL} text-[14px] font-medium text-ink`}>
            {row.name}
            <span className="ml-1.5 text-[13px] font-normal text-ink-2">{row.caption}</span>
          </span>
          <span className={`${CELL} text-right text-[13px] text-ink-2`}>×{row.count}</span>
          {layout !== 'widget' && (
            <>
              <span className={`${FIGURE} ${WIDE}`}>{row.figure}</span>
              <span className={`${FIGURE} ${WIDE}`}>{row.age}</span>
              <SatiationCell satiation={row.satiation} wide />
            </>
          )}
          <ConditionCell at={row.at} status={row.status} label={`${row.name} condition`} />
          <Word status={row.status} word={row.word} />
          {layout !== 'widget' && (
            <button
              type="button"
              onClick={handlers.onSellFry}
              aria-label={`Sell all fry (${row.count})`}
              className={`relative flex h-6 w-6 items-center justify-center justify-self-center rounded-control text-ink-3 transition-colors hover:text-ink ${TIGHT_FOCUS}`}
            >
              <Coins className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      );
    case 'clutch':
      return (
        <div className={`${ROW} ${ROW_H} ${TEMPLATE[layout]}`}>
          <Name species={row.species} name={row.name} />
          <span aria-hidden />
          {layout !== 'widget' && <span className={`${FIGURE} ${WIDE}`}>{row.figure}</span>}
          <span
            className={`${CELL} text-right text-[13px] text-ink-3 ${
              layout === 'widget' ? 'col-span-2' : 'col-span-3 md:col-span-4'
            }`}
          >
            {row.age}
          </span>
          {layout !== 'widget' && <span aria-hidden className={WIDE} />}
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
              className={`truncate text-[11px] text-ink-3 ${i >= 2 ? 'text-right' : ''} ${
                heading.wide ? WIDE : ''
              }`}
            >
              {heading.label}
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
      <SpeciesGlyph species={species} size="h-6 w-6" tone="text-ink-3" />
      <p>
        {line} —{' '}
        <button
          type="button"
          onClick={onAdd}
          className={`text-accent underline-offset-2 hover:underline ${CONTROL_FOCUS}`}
        >
          {verb}
        </button>
      </p>
    </div>
  );
}
