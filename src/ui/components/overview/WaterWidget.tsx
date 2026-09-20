import React from 'react';
import type { SimulationState } from '../../../simulation/index.js';
import type { ReadingBook, ReadingId } from '../../readings';
import { ReadingRow } from '../ui/ReadingRow';
import { VerbButton } from '../ui/VerbButton';
import { Widget } from '../ui/Widget';

/** The three physical readings, above the two dissolved gases. */
const ROWS: ReadingId[] = ['temperature', 'ph', 'level'];

function Gas({
  name,
  value,
  unit,
  onClick,
}: {
  name: string;
  value: string;
  unit: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-control px-1 -mx-1 text-ink-2 transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    >
      {name} <span className="font-medium tabular-nums text-ink">{value}</span> {unit}
    </button>
  );
}

interface WaterWidgetProps {
  book: ReadingBook;
  state: SimulationState;
  onOpenReading: (id: ReadingId) => void;
  onAct: () => void;
}

export function WaterWidget({
  book,
  state,
  onOpenReading,
  onAct,
}: WaterWidgetProps): React.JSX.Element {
  const { byId } = book;

  return (
    <Widget
      title="Water"
      caption={[
        state.equipment.heater.enabled ? 'heater on' : 'no heater',
        state.equipment.ato.enabled ? 'ATO on' : 'ATO off',
      ].join(' · ')}
      to="/water"
      footer={
        <>
          <VerbButton label="Water change · 25 %" onClick={onAct} />
          <VerbButton label="Top off" onClick={onAct} />
        </>
      }
    >
      {ROWS.map((id) => {
        const reading = byId[id];
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
            onClick={() => onOpenReading(id)}
          />
        );
      })}

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-hairline py-2 text-[13px]">
        <Gas
          name={byId.oxygen.name}
          value={byId.oxygen.value}
          unit={byId.oxygen.unit}
          onClick={() => onOpenReading('oxygen')}
        />
        <Gas
          name={byId.co2.name}
          value={byId.co2.value}
          unit={byId.co2.unit}
          onClick={() => onOpenReading('co2')}
        />
      </div>
    </Widget>
  );
}
