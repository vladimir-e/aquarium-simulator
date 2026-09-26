import React from 'react';
import { ChevronDown, ChevronRight, Coins, Scissors, X } from 'lucide-react';
import { toneOf } from '../../readings';
import {
  CONDITION_BAND,
  type FamilyRosterRow,
  type IndividualRosterRow,
  type LightFigure,
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
 * width, ten for the plants, five for the widget, and six for either table on
 * a phone — which is what the {@link WIDE} cells fall out to.
 */
export type RosterLayout = 'fish' | 'plants' | 'widget';

/** The layouts that print headings, and the figures the widget has no room for. */
type TableLayout = Exclude<RosterLayout, 'widget'>;

const TEMPLATE: Record<RosterLayout, string> = {
  fish: 'grid-cols-[16px_minmax(0,1fr)_44px_84px_68px_24px] md:grid-cols-[16px_minmax(0,1fr)_52px_92px_64px_140px_160px_88px_28px]',
  plants:
    'grid-cols-[16px_minmax(0,1fr)_44px_84px_68px_24px] md:grid-cols-[16px_minmax(0,1fr)_52px_92px_64px_64px_64px_160px_88px_28px]',
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
    { label: 'age', wide: true },
    { label: 'light', wide: true },
    { label: 'bank', wide: true },
    { label: 'condition' },
    { label: 'status' },
    { label: '' },
  ],
};

const NUMBER = `${CELL} text-right tabular-nums text-[13px]`;
const FIGURE = `${NUMBER} text-ink-2`;

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

function LightCell({ light }: { light: LightFigure | null }): React.JSX.Element {
  const tone = light ? toneOf(light.status) : 'ink';
  return (
    <span className={`${NUMBER} ${WIDE} ${tone === 'ink' ? 'text-ink-2' : TONE_TEXT[tone]}`}>
      {light?.text}
    </span>
  );
}

/**
 * The tablet-wide figures between the count and the condition: what each one
 * weighs or measures and how old it is, then what the table reads beside that —
 * a fish's satiation, a plant's light and bank. The widget has room for none.
 */
function Figures({
  layout,
  figure,
  age,
  satiation = null,
  light = null,
  bank = null,
}: {
  layout: RosterLayout;
  figure: string;
  age: string;
  satiation?: Satiation | null;
  light?: LightFigure | null;
  bank?: string | null;
}): React.JSX.Element | null {
  if (layout === 'widget') return null;
  return (
    <>
      <span className={`${FIGURE} ${WIDE}`}>{figure}</span>
      <span className={`${FIGURE} ${WIDE}`}>{age}</span>
      {layout === 'fish' ? (
        <SatiationCell satiation={satiation} wide />
      ) : (
        <>
          <LightCell light={light} />
          <span className={`${FIGURE} ${WIDE}`}>{bank}</span>
        </>
      )}
    </>
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
  /** One per member, above the group's mean — a group reads as its worst. */
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
  return (
    <div className={`${ROW} ${ROW_H} ${TEMPLATE[layout]}`}>
      <RowOverlay
        label={`${row.name} — ${row.count}, ${row.word}`}
        onClick={onToggle}
        expanded={row.expanded}
      />
      <Name species={row.species} name={row.name} strong />
      <Count count={row.count} caret={layout === 'widget' ? null : row.expanded} />
      <Figures
        layout={layout}
        figure={row.figure}
        age={row.age}
        satiation={row.satiation}
        light={row.light}
      />
      <ConditionCell
        at={row.at}
        status={row.status}
        dots={row.dots}
        label={`${row.name} by ${row.dot}`}
      />
      <WorstWord
        status={row.status}
        word={row.word}
        label={`${row.name} — inspect the worst of ${row.members}`}
        onInspect={onInspect}
      />
      {layout !== 'widget' && <span aria-hidden />}
    </div>
  );
}

function Count({ count, caret }: { count: number; caret: boolean | null }): React.JSX.Element {
  const Caret = caret ? ChevronDown : ChevronRight;
  return (
    <span className={`${CELL} flex items-center justify-end gap-0.5 text-[13px] text-ink-2`}>
      {caret !== null && <Caret className="h-3 w-3 text-ink-3" aria-hidden />}×{count}
    </span>
  );
}

/** A group's word, which opens the member it names. */
function WorstWord({
  status,
  word,
  label,
  onInspect,
}: {
  status: Status;
  word: string;
  label: string;
  onInspect: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onInspect}
      aria-label={label}
      className={`relative truncate text-right text-[13px] underline-offset-2 hover:underline ${TIGHT_FOCUS} ${TONE_TEXT[toneOf(status)]}`}
    >
      {word}
    </button>
  );
}

function FamilyLine({
  row,
  layout,
  onToggle,
  onInspect,
  onTrim,
}: {
  row: FamilyRosterRow;
  layout: RosterLayout;
  onToggle: () => void;
  onInspect: () => void;
  onTrim: () => void;
}): React.JSX.Element {
  const title = `${row.name} ${row.label}`;
  return (
    <div className={`${ROW} ${ROW_H} ${TEMPLATE[layout]}`}>
      <RowOverlay
        label={`${title} — ${row.count}, ${row.word}`}
        onClick={onToggle}
        expanded={row.expanded}
      />
      <span aria-hidden />
      <span className={`${CELL} pl-3 text-[13px] text-ink-2 md:pl-6`}>{row.label}</span>
      <Count count={row.count} caret={row.expanded} />
      <Figures layout={layout} figure={row.figure} age={row.age} light={row.light} />
      <ConditionCell at={row.at} status={row.status} dots={row.dots} label={`${title} by unit`} />
      <WorstWord
        status={row.status}
        word={row.word}
        label={`${title} — inspect the worst of ${row.count}`}
        onInspect={onInspect}
      />
      <button
        type="button"
        onClick={onTrim}
        aria-label={`Trim ${title}`}
        className={`relative flex h-6 w-6 items-center justify-center justify-self-center rounded-control text-ink-3 transition-colors hover:text-ink ${TIGHT_FOCUS}`}
      >
        <Scissors className="h-3.5 w-3.5" />
      </button>
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
      <span
        className={`${CELL} ${layout === 'plants' ? 'pl-6 md:pl-12' : 'pl-6'} text-[13px] tabular-nums text-ink-2`}
      >
        {row.shortId}
        {row.sex && (
          <span className="ml-1.5 text-ink-3" title={row.sex}>
            {SEX[row.sex]}
          </span>
        )}
        {row.parent && <span className="ml-1.5 hidden text-ink-3 md:inline">from {row.parent}</span>}
      </span>
      <span aria-hidden />
      <Figures
        layout={layout}
        figure={row.figure}
        age={row.age}
        satiation={row.satiation}
        light={row.light}
        bank={row.bank}
      />
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
  onTrimFamily: (familyId: string) => void;
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
    case 'family':
      return (
        <FamilyLine
          row={row}
          layout={layout}
          onToggle={() => handlers.onToggle(row.key)}
          onInspect={() => handlers.onInspect(row)}
          onTrim={() => handlers.onTrimFamily(row.familyId)}
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
              <span className={`${CELL} col-span-5 text-right text-[13px] text-ink-2 ${WIDE}`}>
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
