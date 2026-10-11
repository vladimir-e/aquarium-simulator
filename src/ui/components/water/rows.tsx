import React from 'react';
import { ratePerHour, type ReadingBook, type ReadingId, type StoresGauge } from '../../readings';
import { colonyCount, type BacteriaReadout, type Colony } from '../../run';
import { RangeStrip, TONE_TEXT } from '../ui/RangeStrip';
import { ReadingRow } from '../ui/ReadingRow';

/**
 * The reading rows the Water module and the Overview widgets both draw. One
 * source for the row, so a reading cannot carry a different band or a
 * different word depending on which surface is showing it.
 */
export function ReadingRows({
  book,
  ids,
  onOpen,
}: {
  book: ReadingBook;
  ids: readonly ReadingId[];
  onOpen: (id: ReadingId) => void;
}): React.JSX.Element {
  return (
    <>
      {ids.map((id) => {
        const reading = book.byId[id];
        return (
          <ReadingRow
            key={id}
            name={reading.name}
            value={reading.value}
            unit={reading.unit}
            at={reading.at}
            band={reading.band}
            tone={reading.tone}
            trend={reading.trend ?? undefined}
            onClick={() => onOpen(id)}
          />
        );
      })}
    </>
  );
}

/**
 * The feeders' stores beside what a pool holds: a reading of their own, figure
 * and strip, so the tone sits on the stores' band and never on the pool's. A
 * narrow row gives up the word, then the strip, so the figure always fits
 * beside NO₃'s trend.
 */
function StoresNote({ stores }: { stores: StoresGauge }): React.JSX.Element {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`min-w-0 truncate tabular-nums ${stores.tone === 'ink' ? 'text-ink-3' : TONE_TEXT[stores.tone]}`}>
        <span className="@max-[24rem]:hidden">stores </span>
        {stores.value} %
      </span>
      <RangeStrip
        className="w-10 shrink-0 @max-[22rem]:hidden"
        at={stores.at}
        band={stores.band}
        tone={stores.tone}
      />
    </span>
  );
}

/** The four plant foods in the water, then the bed's store — over a bare bottom only while something roots in it. */
export function NutrientRows({
  book,
  onOpen,
}: {
  book: ReadingBook;
  onOpen: (id: ReadingId) => void;
}): React.JSX.Element {
  const { bare, asked } = book.bed;
  const rows = bare && !asked ? book.demand : [...book.demand, book.byId.bed];
  return (
    <>
      {rows.map((reading) => (
        <ReadingRow
          key={reading.id}
          name={reading.name}
          value={reading.value}
          unit={reading.unit}
          at={reading.at}
          band={reading.band}
          tone={reading.tone}
          trend={reading.trend ?? undefined}
          note={reading.stores && <StoresNote stores={reading.stores} />}
          onClick={() => onOpen(reading.id)}
        />
      ))}
    </>
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
      trend={throughput}
      note={
        <>
          {pct > 0 && pct < 1 ? '<1' : Math.round(pct)} %
          <span className="@max-[20rem]:hidden"> of ceiling</span>
        </>
      }
    />
  );
}

/** A colony is a population, not a level — it takes no strip. */
export function ColonyRows({ bacteria }: { bacteria: BacteriaReadout }): React.JSX.Element {
  const { rates } = bacteria;
  return (
    <>
      <ColonyRow
        name="AOB"
        colony={bacteria.aob}
        throughput={ratePerHour(rates.ammoniaToNitrite, 'ppm')}
      />
      <ColonyRow
        name="NOB"
        colony={bacteria.nob}
        throughput={ratePerHour(rates.nitriteToNitrate, 'ppm')}
      />
    </>
  );
}
