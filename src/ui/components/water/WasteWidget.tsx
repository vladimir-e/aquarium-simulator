import React from 'react';
import type { TunableConfig } from '../../../simulation/config/index.js';
import type { ReadingBook, ReadingId } from '../../readings';
import { wasteSummary } from '../../run';
import { Widget } from '../ui/Widget';
import { ReadingRows } from './rows';

const STANDING: ReadingId[] = ['waste'];

/**
 * The pool the cycle starts in: what stands in the tank, what the four
 * producers put into it each hour, and the terms the engine decays it on.
 */
export function WasteWidget({
  book,
  config,
  onOpen,
}: {
  book: ReadingBook;
  config: TunableConfig;
  onOpen: (id: ReadingId) => void;
}): React.JSX.Element {
  const { waste } = book;

  return (
    <Widget
      title="Waste"
      caption={`${waste.standing.toFixed(2)} g standing`}
      footer={<p className="text-[12px] leading-4 text-ink-3">{wasteSummary(waste, config)}</p>}
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
        <p className="pt-1.5 text-[11px] leading-[14px] text-ink-3">
          {waste.food.toFixed(2)} g food · {(waste.decayRate * 100).toFixed(1)} %/h decay ·{' '}
          {(config.decay.wasteConversionRatio * 100).toFixed(0)} % to waste · Q10{' '}
          {waste.q10.toFixed(2)}×
        </p>
      </div>
    </Widget>
  );
}
