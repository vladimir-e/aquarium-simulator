import React from 'react';
import { X } from 'lucide-react';
import { SATIATION_BAND_LABEL, type FishSex, type FishSpecies } from '../../../simulation/index.js';
import {
  bandStatus,
  conditionStatus,
  type ClutchRosterRow,
  type FishRosterRow,
  type FryRosterRow,
  type RosterFigures,
  type RosterRow,
  type SpeciesRosterRow,
} from '../../run';
import { Bar, Caret, statusText } from '../run/elements';

const SEX_GLYPH: Record<FishSex, string> = { male: '♂', female: '♀' };

/** Columns the roster sheds as the stage narrows, widest-first. */
const AT_MD = 'hidden md:table-cell';
const AT_LG = 'hidden lg:table-cell';

const CELL = 'h-11 whitespace-nowrap border-b border-hairline px-1.5 align-middle';
const NUM = 'font-mono text-[12.5px] tabular-nums';
const HEAD = 'px-1.5 pb-2 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3';

function Mass({ g }: { g: number }): React.JSX.Element {
  return <span className={NUM}>{g.toFixed(2)} g</span>;
}

/**
 * Satiation reads as a word first; the number is there to compare two fish. The
 * per-fish word is the first thing a narrow stage drops, but a group's hungry
 * tally survives at every width — it is the one reading that asks for an action.
 */
function Satiation({ figures, note }: { figures: RosterFigures; note?: string }): React.JSX.Element {
  const status = bandStatus(figures.band);
  return (
    <span className="flex items-center justify-end gap-2">
      <span
        className={`w-14 text-left text-[12px] ${note ? 'text-warn-text' : `hidden sm:inline ${statusText(status)}`}`}
      >
        {note ?? SATIATION_BAND_LABEL[figures.band].toLowerCase()}
      </span>
      <Bar className="hidden w-[90px] sm:block" value={figures.satiation} status={status} />
      <span className={`w-10 text-right ${NUM}`}>{Math.round(figures.satiation)} %</span>
    </span>
  );
}

function Condition({ condition }: { condition: number }): React.JSX.Element {
  return (
    <span className="flex items-center justify-end gap-2">
      <Bar className="w-16" value={condition} status={conditionStatus(condition)} />
      <span className={`w-10 text-right ${NUM}`}>{Math.round(condition)} %</span>
    </span>
  );
}

function SpeciesRow({
  row,
  onToggle,
}: {
  row: SpeciesRosterRow;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <tr className="bg-surface-2">
      <td className={CELL}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={row.expanded}
          aria-label={`${row.name} — ${row.count} fish`}
          className="flex h-9 w-full items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
        >
          <Caret open={row.expanded} />
        </button>
      </td>
      <td className={CELL}>
        <span className="text-[13px] font-semibold text-ink">{row.name}</span>{' '}
        <span className="text-[12px] text-ink-3">×{row.count}</span>
      </td>
      <td className={`${CELL} ${AT_LG} ${NUM} text-ink-3`}>—</td>
      <td className={`${CELL} text-right text-ink-2`}>
        <Mass g={row.massG} />
      </td>
      <td className={`${CELL} ${AT_MD} text-right ${NUM} text-ink-3`}>{row.ageDays} d</td>
      <td className={`${CELL} text-right`}>
        <Satiation
          figures={row}
          note={row.hungryCount > 0 ? `${row.hungryCount} hungry` : undefined}
        />
      </td>
      <td className={`${CELL} ${AT_MD} text-right`}>
        <Condition condition={row.condition} />
      </td>
      <td className={CELL} />
    </tr>
  );
}

function FishRow({
  row,
  onRemove,
}: {
  row: FishRosterRow;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <tr>
      <td className={`${CELL} text-center text-[12px] text-ink-3`}>{SEX_GLYPH[row.sex]}</td>
      <td className={`${CELL} pl-6 text-[13px] text-ink`}>{row.name}</td>
      <td className={`${CELL} ${AT_LG} ${NUM} text-ink-3`}>{row.shortId}</td>
      <td className={`${CELL} text-right`}>
        <Mass g={row.massG} />
      </td>
      <td className={`${CELL} ${AT_MD} text-right ${NUM} text-ink-3`}>{row.ageDays} d</td>
      <td className={`${CELL} text-right`}>
        <Satiation figures={row} />
      </td>
      <td className={`${CELL} ${AT_MD} text-right`}>
        <Condition condition={row.condition} />
      </td>
      <td className={`${CELL} text-right`}>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${row.name} ${row.shortId}`}
          className="rounded p-1 text-ink-3 transition-colors hover:text-alert focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function ClutchRow({ row }: { row: ClutchRosterRow }): React.JSX.Element {
  return (
    <tr>
      <td className={CELL} />
      <td className={`${CELL} text-[13px] text-ink`}>{row.name}</td>
      <td className={`${CELL} ${AT_LG} ${NUM} text-ink-3`}>{row.shortId}</td>
      <td className={`${CELL} text-right ${NUM} text-ink-2`}>{row.eggCount} eggs</td>
      <td className={`${CELL} ${AT_MD} text-right ${NUM} text-ink-3`}>laid T{row.laidTick}</td>
      <td className={`${CELL} text-right ${NUM} text-ink-3`}>
        {row.hoursToHatch > 0
          ? `hatches T${row.hatchTick} · in ${row.hoursToHatch} h`
          : `hatching · due T${row.hatchTick}`}
      </td>
      <td className={`${CELL} ${AT_MD}`} />
      <td className={CELL} />
    </tr>
  );
}

function FryRow({ row, onSell }: { row: FryRosterRow; onSell: () => void }): React.JSX.Element {
  return (
    <tr>
      <td className={CELL} />
      <td className={`${CELL} text-[13px] text-ink`}>
        {row.name} fry <span className="text-[12px] text-ink-3">×{row.count}</span>
      </td>
      <td className={`${CELL} ${AT_LG} ${NUM} text-ink-3`}>—</td>
      <td className={`${CELL} text-right text-ink-2`}>
        <Mass g={row.massG} />
      </td>
      <td className={`${CELL} ${AT_MD} text-right ${NUM} text-ink-3`}>
        day {row.dayNow} of {row.graduationDay}
      </td>
      <td className={`${CELL} text-right`}>
        <span className="flex items-center justify-end gap-2">
          <span className="hidden w-14 text-left text-[12px] text-ink-3 sm:inline">growing</span>
          <Bar className="hidden w-[90px] sm:block" value={row.growthPct} status="neutral" />
          <span className={`w-10 text-right ${NUM}`}>{Math.round(row.growthPct)} %</span>
        </span>
      </td>
      <td className={`${CELL} ${AT_MD}`} />
      <td className={`${CELL} text-right`}>
        <button
          type="button"
          onClick={onSell}
          aria-label="Sell every fry in the tank"
          className="rounded px-0.5 text-[12px] text-ink-3 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
        >
          sell
        </button>
      </td>
    </tr>
  );
}

/**
 * The roster as a real table. The column header sticks to the top of whatever
 * scrolls it, because a roster is the one unbounded thing in the tank and the
 * reader will be scrolling.
 */
export function RosterTable({
  rows,
  onToggleSpecies,
  onRemoveFish,
  onSellFry,
}: {
  rows: RosterRow[];
  onToggleSpecies: (species: FishSpecies) => void;
  onRemoveFish: (fishId: string) => void;
  onSellFry: () => void;
}): React.JSX.Element {
  return (
    <table className="w-full border-separate border-spacing-0">
      <thead className="sticky top-0 z-10 bg-surface">
        <tr>
          <th className={`${HEAD} w-8 border-b border-hairline-2`}>
            <span className="sr-only">Sex</span>
          </th>
          <th className={`${HEAD} border-b border-hairline-2`}>Species / fish</th>
          <th className={`${HEAD} ${AT_LG} w-[110px] border-b border-hairline-2`}>id</th>
          <th className={`${HEAD} w-[78px] border-b border-hairline-2 text-right`}>mass</th>
          <th className={`${HEAD} ${AT_MD} w-[110px] border-b border-hairline-2 text-right`}>age</th>
          <th className={`${HEAD} w-[210px] border-b border-hairline-2 text-right`}>satiation</th>
          <th className={`${HEAD} ${AT_MD} w-[124px] border-b border-hairline-2 text-right`}>
            condition
          </th>
          <th className={`${HEAD} w-11 border-b border-hairline-2`}>
            <span className="sr-only">Remove</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          switch (row.kind) {
            case 'species':
              return (
                <SpeciesRow key={row.key} row={row} onToggle={() => onToggleSpecies(row.species)} />
              );
            case 'fish':
              return <FishRow key={row.key} row={row} onRemove={() => onRemoveFish(row.id)} />;
            case 'clutch':
              return <ClutchRow key={row.key} row={row} />;
            case 'fry':
              return <FryRow key={row.key} row={row} onSell={onSellFry} />;
          }
        })}
      </tbody>
    </table>
  );
}
