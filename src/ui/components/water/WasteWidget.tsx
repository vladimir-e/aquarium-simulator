import React from 'react';
import type { ReadingBook, ReadingId } from '../../readings';
import { wasteSummary, type PoolRot } from '../../run';
import { Widget } from '../ui/Widget';
import { ReadingRows } from './rows';

const STANDING: ReadingId[] = ['waste'];

const HEAD = 'pb-0.5 text-right font-normal';
const CELL = 'py-0.5 text-right font-medium text-ink';

const percent = (share: number): string => (share * 100).toFixed(1);

function PoolRow({ pool }: { pool: PoolRot }): React.JSX.Element {
  return (
    <tr>
      <th scope="row" className="py-0.5 text-left font-normal text-ink-2">
        {pool.label}
      </th>
      <td className={CELL}>{pool.grams.toFixed(3)}</td>
      <td className={CELL}>{percent(pool.rots)}</td>
      <td className={CELL}>{pool.key === 'mulm' ? '—' : percent(pool.settles)}</td>
      <td className={CELL}>{pool.oxygen.toFixed(3)}</td>
    </tr>
  );
}

/**
 * The pool the cycle starts in: what stands in the tank and what the producers
 * put into it each hour, then every organic pool the hour rots — how fast, how
 * much of it settles into the bed, and the oxygen its rot takes.
 */
export function WasteWidget({
  book,
  onOpen,
}: {
  book: ReadingBook;
  onOpen: (id: ReadingId) => void;
}): React.JSX.Element {
  const { waste } = book;
  const bed = waste.pools.some((pool) => pool.key === 'mulm');

  return (
    <Widget
      title="Waste"
      footer={<p className="text-[12px] leading-4 text-ink-3">{wasteSummary(waste)}</p>}
    >
      <ReadingRows book={book} ids={STANDING} onOpen={onOpen} />

      <div className="border-t border-hairline py-2">
        <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
          {waste.sources.map((source) => (
            <React.Fragment key={source.key}>
              <dt className="text-ink-2">{source.label}</dt>
              <dd className="-ml-2.5 font-medium tabular-nums text-ink">
                {source.gramsPerHour.toFixed(3)}
              </dd>
            </React.Fragment>
          ))}
          <span className="text-ink-3">g/h</span>
        </dl>
      </div>

      <div className="border-t border-hairline py-2">
        <table className="w-full text-[13px] tabular-nums">
          <thead>
            <tr className="text-[11px] text-ink-3">
              <td />
              <th scope="col" className={HEAD}>
                g
              </th>
              <th scope="col" className={HEAD}>
                rots %/h
              </th>
              <th scope="col" className={HEAD}>
                settles %/h
              </th>
              <th scope="col" className={HEAD}>
                O₂ mg/L/h
              </th>
            </tr>
          </thead>
          <tbody>
            {waste.pools.map((pool) => (
              <PoolRow key={pool.key} pool={pool} />
            ))}
          </tbody>
        </table>
        <p className="pt-1.5 text-[11px] leading-[14px] text-ink-3">
          {bed
            ? 'Food and waste rot in the water and settle into the bed as mulm'
            : 'Food and waste rot in the water, with no bed to settle into'}{' '}
          · Q10 {waste.q10.toFixed(2)}×
        </p>
      </div>
    </Widget>
  );
}
