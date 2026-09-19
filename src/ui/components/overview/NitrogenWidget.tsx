import React from 'react';
import type { TunableConfig } from '../../../simulation/config/index.js';
import type { ReadingBook, ReadingId, ReadingView } from '../../readings';
import { bacteriaSummary, colonyCount, cycleWord, type Colony } from '../../run';
import { ReadingRow } from '../ui/ReadingRow';
import { Widget } from '../ui/Widget';

const STOCK_TONE = {
  ink: 'text-ink',
  warn: 'text-warn',
  alert: 'text-alert',
};

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
      <span className={`text-[20px] leading-6 font-medium tabular-nums ${STOCK_TONE[reading.tone]}`}>
        {reading.value}
        <span className="ml-0.5 text-[11px] font-normal text-ink-2">{reading.unit}</span>
      </span>
      <span className="text-[11px] leading-[14px] tabular-nums text-ink-3">{rate}</span>
    </button>
  );
}

function ColonyRow({
  name,
  colony,
  throughput,
}: {
  name: string;
  colony: Colony;
  throughput: string;
}): React.JSX.Element {
  const { pct } = colony;
  return (
    <ReadingRow
      name={name}
      value={colonyCount(colony.count)}
      unit="cells"
      at={pct / 100}
      band={{ from: 0, to: 1 }}
      trend={throughput}
      note={`${pct > 0 && pct < 1 ? '<1' : Math.round(pct)} % of ceiling`}
    />
  );
}

function perHour(value: number, unit: string, decimals: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(decimals)} ${unit}/h`;
}

interface NitrogenWidgetProps {
  book: ReadingBook;
  config: TunableConfig;
  onOpenReading: (id: ReadingId) => void;
  className?: string;
}

/**
 * The cycle as the chain it is: what stands in each stock, how fast it is
 * moving, and the two guilds doing the moving against the biofilm they have to
 * live on. Every stock opens its own reading; the title opens the module.
 */
export function NitrogenWidget({
  book,
  config,
  onOpenReading,
  className,
}: NitrogenWidgetProps): React.JSX.Element {
  const { bacteria, waste, byId } = book;
  const { rates } = bacteria;

  const chainRate: Record<ChainId, string> = {
    waste: perHour(waste.perHour - waste.mineralised, 'g', 3),
    ammonia: perHour(
      rates.wasteToAmmonia + rates.gillsToAmmonia - rates.ammoniaOxidised,
      'ppm',
      4
    ),
    nitrite: perHour(rates.netNitrite, 'ppm', 4),
    // The one stock whose balance the run layer cannot close — plants and water
    // changes take nitrate out from outside the cycle — so it reports what the
    // history buffer measured rather than a rate that would ignore them.
    nitrate: byId.nitrate.trend.replace('/d', ' ppm/d') || 'steady',
  };

  return (
    <Widget
      title="Nitrogen"
      caption={cycleWord(bacteria.cycled)}
      to="/water"
      className={className}
      footer={
        <p className="text-[12px] leading-4 text-ink-3">
          {bacteriaSummary(bacteria, book.projection, config.nitrogenCycle)}
        </p>
      }
    >
      <div className="grid grid-cols-[1fr_16px_1fr_16px_1fr_16px_1fr] items-center py-1">
        {CHAIN.map((id, i) => (
          <React.Fragment key={id}>
            {i > 0 && <span aria-hidden className="text-center text-ink-3">→</span>}
            <Stock reading={byId[id]} rate={chainRate[id]} onOpen={() => onOpenReading(id)} />
          </React.Fragment>
        ))}
      </div>

      <div className="mt-1 border-t border-hairline pt-0.5">
        <ColonyRow
          name="AOB"
          colony={bacteria.aob}
          throughput={perHour(rates.ammoniaToNitrite, 'ppm', 4)}
        />
        <ColonyRow
          name="NOB"
          colony={bacteria.nob}
          throughput={perHour(rates.nitriteToNitrate, 'ppm', 4)}
        />
      </div>
    </Widget>
  );
}
