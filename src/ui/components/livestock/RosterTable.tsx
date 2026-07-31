import React from 'react';
import { X } from 'lucide-react';
import { SATIATION_BAND_LABEL, type FishSex } from '../../../simulation/index.js';
import {
  bandStatus,
  conditionStatus,
  type ClutchRosterRow,
  type FishRosterRow,
  type FryRosterRow,
  type Hunger,
  type RosterFigures,
  type RosterRow,
  type SpeciesRosterRow,
} from '../../run';
import { Breakdown } from '../run/Breakdown';
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

/** A group is as urgent as its worst fish, so hunger overrides the mean band. */
function Satiation({
  figures,
  hunger,
}: {
  figures: RosterFigures;
  hunger?: Hunger | null;
}): React.JSX.Element {
  const status = bandStatus(hunger?.band ?? figures.band);
  return (
    <span className="flex items-center justify-end gap-2">
      <span
        className={`w-14 text-left text-[12px] ${statusText(status)} ${hunger ? '' : 'hidden sm:inline'}`}
      >
        {hunger ? `${hunger.count} hungry` : SATIATION_BAND_LABEL[figures.band].toLowerCase()}
      </span>
      <Bar className="hidden w-[90px] sm:block" value={figures.satiation} status={status} />
      <span className={`w-10 text-right ${NUM}`}>{Math.round(figures.satiation)} %</span>
    </span>
  );
}

/**
 * Condition, and whether it is being held there. A fish burning reserves reads
 * full while its bank drains, so the bar warns where the number cannot.
 */
function Condition({
  condition,
  burning,
}: {
  condition: number;
  burning: boolean;
}): React.JSX.Element {
  return (
    <span className="flex items-center justify-end gap-2">
      {burning && <span className={`text-[12px] ${statusText('warn')}`}>burning</span>}
      <Bar
        className="w-16"
        value={condition}
        status={burning ? 'warn' : conditionStatus(condition)}
      />
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
        <Satiation figures={row} hunger={row.hunger} />
      </td>
      <td className={`${CELL} ${AT_MD} text-right`}>
        <Condition condition={row.condition} burning={row.burning} />
      </td>
      <td className={CELL} />
    </tr>
  );
}

function FishRow({
  row,
  onToggle,
  onRemove,
}: {
  row: FishRosterRow;
  onToggle: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <tr>
      <td className={`${CELL} text-center text-[12px] text-ink-3`}>
        <span aria-hidden>{SEX_GLYPH[row.sex]}</span>
        <span className="sr-only">{row.sex}</span>
      </td>
      <td className={`${CELL} pl-4`}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={row.expanded}
          aria-label={`${row.name} ${row.shortId} — conditions`}
          className="flex h-9 items-center gap-2 rounded pr-2 text-left text-[13px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
        >
          <Caret open={row.expanded} />
          {row.name}
        </button>
      </td>
      <td className={`${CELL} ${AT_LG} ${NUM} text-ink-3`}>{row.shortId}</td>
      <td className={`${CELL} text-right`}>
        <Mass g={row.massG} />
      </td>
      <td className={`${CELL} ${AT_MD} text-right ${NUM} text-ink-3`}>{row.ageDays} d</td>
      <td className={`${CELL} text-right`}>
        <Satiation figures={row} />
      </td>
      <td className={`${CELL} ${AT_MD} text-right`}>
        <Condition condition={row.condition} burning={row.burning} />
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

/**
 * Why this fish is where it is: the reserve standing between its net rate and
 * its condition, then the factors that rate is made of.
 */
function FishDetailRow({ row }: { row: FishRosterRow }): React.JSX.Element {
  const fill = row.reserveCap > 0 ? (row.reserve / row.reserveCap) * 100 : 0;
  const tone = row.burning ? 'warn' : 'ok';

  return (
    <tr>
      <td className="border-b border-hairline px-1.5 pt-2" colSpan={8}>
        <div className="flex min-h-[26px] items-center gap-2 pl-6 pr-1 text-[12px]">
          <span className={row.burning ? statusText('warn') : 'text-ink-2'}>
            {row.burning ? 'Burning reserves' : 'Reserve'}
          </span>
          <Bar className="w-24" value={fill} status={tone} />
          <span className={`ml-auto text-ink-2 ${NUM}`}>
            {row.reserve.toFixed(1)} / {row.reserveCap}
          </span>
        </div>
        <Breakdown stressors={row.stressors} benefits={row.benefits} net={row.net} />
      </td>
    </tr>
  );
}

/** A clutch has no mass, age or satiation, so it fills none of those columns. */
function ClutchRow({ row }: { row: ClutchRosterRow }): React.JSX.Element {
  return (
    <tr>
      <td className={CELL} />
      <td className={`${CELL} text-[13px] text-ink`}>
        {row.name} <span className="text-[12px] text-ink-3">{row.eggCount} eggs</span>
      </td>
      <td className={`${CELL} ${AT_LG} ${NUM} text-ink-3`}>{row.shortId}</td>
      <td className={`${CELL} text-right ${NUM} text-ink-3`} colSpan={5}>
        hatches T{row.hatchTick} · in {row.hoursToHatch} h
      </td>
    </tr>
  );
}

function FryRow({ row }: { row: FryRosterRow }): React.JSX.Element {
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
        day {row.ageDays} of {row.graduationDay}
      </td>
      <td className={`${CELL} text-right`}>
        <Satiation figures={row} hunger={row.hunger} />
      </td>
      <td className={`${CELL} ${AT_MD} text-right`}>
        <Condition condition={row.condition} burning={row.burning} />
      </td>
      <td className={CELL} />
    </tr>
  );
}

export function RosterTable({
  rows,
  onToggle,
  onRemoveFish,
}: {
  rows: RosterRow[];
  /** Disclose a row by its own key — a species group, or one fish inside it. */
  onToggle: (key: string) => void;
  onRemoveFish: (fishId: string) => void;
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
          <th className={`${HEAD} ${AT_MD} w-[180px] border-b border-hairline-2 text-right`}>
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
              return <SpeciesRow key={row.key} row={row} onToggle={() => onToggle(row.key)} />;
            case 'fish':
              return (
                <React.Fragment key={row.key}>
                  <FishRow
                    row={row}
                    onToggle={() => onToggle(row.key)}
                    onRemove={() => onRemoveFish(row.id)}
                  />
                  {row.expanded && <FishDetailRow row={row} />}
                </React.Fragment>
              );
            case 'clutch':
              return <ClutchRow key={row.key} row={row} />;
            case 'fry':
              return <FryRow key={row.key} row={row} />;
          }
        })}
      </tbody>
    </table>
  );
}
