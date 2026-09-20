import React from 'react';
import type { TunableConfig } from '../../../simulation/config/index.js';
import type { ReadingBook, ReadingId, ReadingView } from '../../readings';
import { TONE_TEXT } from '../ui/RangeStrip';
import { BiofilterWidget } from '../water/BiofilterWidget';

type ChainId = Extract<ReadingId, 'waste' | 'ammonia' | 'nitrite' | 'nitrate'>;

/** The four stocks of the cycle, in the order nitrogen moves through them. */
const CHAIN: ChainId[] = ['waste', 'ammonia', 'nitrite', 'nitrate'];

function Stock({
  reading,
  rate,
  onOpen,
}: {
  reading: ReadingView;
  rate: string;
  onOpen: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 flex-col items-center gap-0.5 rounded-control py-1 transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <span className="text-[12px] leading-4 text-ink-2">{reading.name}</span>
      <span className={`text-[20px] leading-6 font-medium tabular-nums ${TONE_TEXT[reading.tone]}`}>
        {reading.value}
        <span className="ml-0.5 text-[11px] font-normal text-ink-2">{reading.unit}</span>
      </span>
      <span className="text-[11px] leading-[14px] tabular-nums text-ink-3">{rate}</span>
    </button>
  );
}

interface NitrogenWidgetProps {
  book: ReadingBook;
  config: TunableConfig;
  onOpenReading: (id: ReadingId) => void;
  className?: string;
}

/**
 * The cycle as the chain it is: what stands in each stock and how fast it is
 * moving, over the biofilter's own reading of the two guilds doing the moving.
 * Every stock opens its own reading; the title opens the module.
 */
export function NitrogenWidget({
  book,
  config,
  onOpenReading,
  className,
}: NitrogenWidgetProps): React.JSX.Element {
  const { byId } = book;

  // Nitrate is the one stock whose balance the run layer cannot close — plants
  // and water changes take it out from outside the cycle — so a stock with no
  // net falls back to what the history buffer measured.
  const chainRate = (id: ChainId): string =>
    byId[id].net ?? (byId[id].trend.replace('/d', ' ppm/d') || 'steady');

  return (
    <BiofilterWidget title="Nitrogen" to="/water" book={book} config={config} className={className}>
      <div className="grid grid-cols-[1fr_16px_1fr_16px_1fr_16px_1fr] items-center py-1 max-md:grid-cols-1">
        {CHAIN.map((id, i) => (
          <React.Fragment key={id}>
            {i > 0 && (
              <span aria-hidden className="text-center text-ink-3 max-md:rotate-90">
                →
              </span>
            )}
            <Stock reading={byId[id]} rate={chainRate(id)} onOpen={() => onOpenReading(id)} />
          </React.Fragment>
        ))}
      </div>
    </BiofilterWidget>
  );
}
