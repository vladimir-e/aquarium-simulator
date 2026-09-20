import React from 'react';
import { ratePerHour, type ReadingBook, type ReadingId } from '../../readings';
import { colonyCount, type BacteriaReadout, type Colony } from '../../run';
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
            trend={reading.trend}
            onClick={() => onOpen(id)}
          />
        );
      })}
    </>
  );
}

/** The four plant foods, banded on what the plants are asking for. */
export function NutrientRows({
  book,
  onOpen,
}: {
  book: ReadingBook;
  onOpen: (id: ReadingId) => void;
}): React.JSX.Element {
  return (
    <>
      {book.demand.map((reading) => (
        <ReadingRow
          key={reading.id}
          name={reading.name}
          value={reading.value}
          unit={reading.unit}
          at={reading.at}
          band={reading.band}
          tone={reading.tone}
          trend={reading.trend}
          note={reading.need}
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
      note={`${pct > 0 && pct < 1 ? '<1' : Math.round(pct)} % of ceiling`}
    />
  );
}

/**
 * The two guilds against the biofilm they live on, each carrying the step it
 * runs. A colony is a population, not a level — it takes no strip.
 */
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
