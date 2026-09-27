import React from 'react';
import { ChevronDown, ChevronRight, Coins, Scissors, X } from 'lucide-react';
import { toneOf } from '../../readings';
import {
  CONDITION_BAND,
  type FamilyRosterRow,
  type IndividualRosterRow,
  type LightFigure,
  type RosterRow,
  type Gut,
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
 * kind must emit exactly that many cells: six for either table on a phone,
 * eight at tablet width — the {@link WIDE} figures — and nine for the fish and
 * ten for the plants once a laptop-wide stage has room for the {@link WIDEST}
 * ones; five for the widget. The name keeps a real width at every step and
 * wraps to a second line before it truncates. On a phone an individual's
 * figure takes the count cell its row has no count for.
 */
export type RosterLayout = 'fish' | 'plants' | 'widget';

/** The layouts that print headings, and the figures the widget has no room for. */
type TableLayout = Exclude<RosterLayout, 'widget'>;

/** A column only a laptop-wide stage has room for: what the table reads beside a figure. */
const WIDEST = 'hidden lg:block';

const TEMPLATE: Record<RosterLayout, string> = {
  fish: 'gap-x-2 grid-cols-[16px_minmax(0,1fr)_44px_84px_80px_24px] md:gap-x-2.5 md:grid-cols-[16px_minmax(7rem,1fr)_52px_92px_64px_160px_88px_28px] lg:grid-cols-[16px_minmax(7rem,1fr)_52px_92px_64px_140px_160px_88px_28px]',
  plants:
    'gap-x-2 grid-cols-[16px_minmax(0,1fr)_44px_84px_80px_24px] md:gap-x-2.5 md:grid-cols-[16px_minmax(7rem,1fr)_52px_92px_64px_160px_88px_28px] lg:grid-cols-[16px_minmax(7rem,1fr)_52px_92px_64px_64px_64px_160px_88px_28px]',
  widget: 'gap-x-2 grid-cols-[16px_minmax(0,1fr)_40px_80px_80px]',
};

interface Heading {
  label: string;
  /** Hidden until the stage has room for it. */
  from?: typeof WIDE | typeof WIDEST;
}

const HEADINGS: Record<TableLayout, Heading[]> = {
  fish: [
    { label: '' },
    { label: 'species' },
    { label: 'count' },
    { label: 'mass', from: WIDE },
    { label: 'age', from: WIDE },
    { label: 'gut', from: WIDEST },
    { label: 'condition' },
    { label: 'status' },
    { label: '' },
  ],
  plants: [
    { label: '' },
    { label: 'species' },
    { label: 'count' },
    { label: 'size', from: WIDE },
    { label: 'age', from: WIDE },
    { label: 'light', from: WIDEST },
    { label: 'bank', from: WIDEST },
    { label: 'condition' },
    { label: 'status' },
    { label: '' },
  ],
};

/** A name that wraps to a second line before it gives up any of itself. */
const NAME = 'relative pointer-events-none line-clamp-2 break-words leading-5';

const NUMBER = `${CELL} text-right tabular-nums text-[13px]`;
const FIGURE = `${NUMBER} text-ink-2`;

function Word({ status, word }: { status: Status; word: string }): React.JSX.Element {
  return (
    <span className={`${CELL} text-right text-[13px] ${TONE_TEXT[toneOf(status)]}`}>{word}</span>
  );
}

function GutCell({ gut }: { gut: Gut | null }): React.JSX.Element {
  if (!gut) return <span aria-hidden className={WIDEST} />;
  return (
    <span className={`relative pointer-events-none ${WIDEST}`}>
      <RangeStrip at={gut.at} band={gut.band} tone={toneOf(gut.status)} />
    </span>
  );
}

function LightCell({ light }: { light: LightFigure | null }): React.JSX.Element {
  const tone = light ? toneOf(light.status) : 'ink';
  return (
    <span className={`${NUMBER} ${WIDEST} ${tone === 'ink' ? 'text-ink-2' : TONE_TEXT[tone]}`}>
      {light?.text}
    </span>
  );
}

/**
 * The wide figures between the count and the condition: what each one weighs or
 * measures and how old it is from a tablet up, then from a laptop up what the
 * table reads beside that — a fish's gut, a plant's light and bank. The
 * widget has room for none.
 */
function Figures({
  layout,
  figure,
  age,
  gut = null,
  light = null,
  bank = null,
}: {
  layout: RosterLayout;
  figure: string;
  age: string;
  gut?: Gut | null;
  light?: LightFigure | null;
  bank?: string | null;
}): React.JSX.Element | null {
  if (layout === 'widget') return null;
  return (
    <>
      <span className={`${FIGURE} ${WIDE}`}>{figure}</span>
      <span className={`${FIGURE} ${WIDE}`}>{age}</span>
      {layout === 'fish' ? (
        <GutCell gut={gut} />
      ) : (
        <>
          <LightCell light={light} />
          <span className={`${FIGURE} ${WIDEST}`}>{bank}</span>
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
  caption = null,
  strong = false,
}: {
  species: SpeciesKey;
  name: string;
  /** What the count is made of, where a tablet-wide table has room to say it. */
  caption?: string | null;
  strong?: boolean;
}): React.JSX.Element {
  return (
    <>
      <SpeciesGlyph species={species} className="relative pointer-events-none" />
      <span className={`${NAME} text-[14px] ${strong ? 'font-medium text-ink' : 'text-ink-2'}`}>
        {name}
        {caption && (
          <span className="ml-1.5 hidden whitespace-nowrap text-[13px] font-normal text-ink-3 md:inline">{caption}</span>
        )}
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
      <Name
        species={row.species}
        name={row.name}
        caption={layout === 'widget' ? null : row.caption}
        strong
      />
      <Count count={row.count} caret={layout === 'widget' ? null : row.expanded} />
      <Figures
        layout={layout}
        figure={row.figure}
        age={row.age}
        gut={row.gut}
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
        label={`${row.name} — inspect the worst of ${row.count}`}
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
  const { title } = row;
  return (
    <div className={`${ROW} ${ROW_H} ${TEMPLATE[layout]}`}>
      <RowOverlay
        label={`${title} — ${row.count}, ${row.word}`}
        onClick={onToggle}
        expanded={row.expanded}
      />
      <span aria-hidden />
      <span className={`${NAME} pl-3 text-[13px] text-ink-2 md:pl-6`}>{row.label}</span>
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
      <RowOverlay label={`${row.title} — ${row.word}`} onClick={onInspect} />
      <span aria-hidden />
      <span
        className={`${CELL} ${layout === 'plants' ? 'pl-6 md:pl-12' : 'pl-6'} text-[13px] tabular-nums text-ink-2`}
      >
        {row.tag}
        {row.sex && (
          <span className="ml-1.5 text-ink-3" title={row.sex}>
            {SEX[row.sex]}
          </span>
        )}
        {row.parent && <span className="hidden text-ink-3 md:inline"> · from {row.parent}</span>}
      </span>
      <span className={`${FIGURE} md:invisible`}>{row.figure}</span>
      <Figures
        layout={layout}
        figure={row.figure}
        age={row.age}
        gut={row.gut}
        light={row.light}
        bank={row.bank}
      />
      <ConditionCell at={row.at} status={row.status} label={`${row.name} condition`} />
      <Word status={row.status} word={row.word} />
      {layout !== 'widget' && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${row.title}`}
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
          <SpeciesGlyph species={row.key} className="relative pointer-events-none" />
          <span className={`${NAME} text-[14px] font-medium text-ink`}>
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
              <span
                className={`${CELL} col-span-3 text-right text-[13px] text-ink-2 lg:col-span-5 ${WIDE}`}
              >
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
          <span className={`${NAME} text-[14px] font-medium text-ink`}>
            {row.name}
            <span className="ml-1.5 text-[13px] font-normal text-ink-2">{row.caption}</span>
          </span>
          <span className={`${CELL} text-right text-[13px] text-ink-2`}>×{row.count}</span>
          <Figures layout={layout} figure={row.figure} age={row.age} gut={row.gut} />
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
              layout === 'widget' ? 'col-span-2' : 'col-span-3 lg:col-span-4'
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
        <div className={`grid h-6 items-center ${TEMPLATE[layout]}`}>
          {HEADINGS[layout].map((heading, i) => (
            <span
              key={i}
              className={`truncate text-[11px] text-ink-3 ${i >= 2 ? 'text-right' : ''} ${
                heading.from ?? ''
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
