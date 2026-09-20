import React from 'react';
import { turnoverShort } from '../../build';
import type { useSimulation } from '../../hooks/useSimulation';
import type { ReadingBook } from '../../readings';
import { DeviceLine, OthersLine, powerSwitch, rackEntries } from '../gear/rack';
import { Widget } from '../ui/Widget';

function Passive({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <span className="whitespace-nowrap text-ink-2">
      {label} <span className="font-medium tabular-nums text-ink">{value}</span>
    </span>
  );
}

/**
 * The rack in a window: what is powered, what it is set to, and — for the three
 * devices that keep a clock — when it runs against the hour the tank is on.
 */
export function GearWidget({
  book,
  sim,
}: {
  book: ReadingBook;
  sim: ReturnType<typeof useSimulation>;
}): React.JSX.Element {
  const { state } = sim;
  const entries = rackEntries(book.rack);
  const on = entries.filter((entry) => entry.row.on);
  const off = entries.filter((entry) => !entry.row.on);
  const onPower = powerSwitch(sim);

  return (
    <Widget
      title="Gear"
      caption={`${on.length} of ${entries.length} on`}
      to="/gear"
      footer={
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px]">
          <Passive
            label="surface"
            value={`${Math.round(state.resources.surface).toLocaleString()} cm²`}
          />
          <Passive label="turnover" value={turnoverShort(state.resources.flow, state.resources.water)} />
          <Passive label="PAR at bed" value={Math.round(state.resources.light).toString()} />
          <Passive label="aeration" value={state.resources.aeration ? 'yes' : 'no'} />
        </div>
      }
    >
      {on.map((entry) => (
        <DeviceLine
          key={entry.row.id}
          entry={entry}
          hour={book.rack.schedules.hour}
          layout="widget"
          onPower={onPower}
        />
      ))}
      {off.length > 0 && <OthersLine off={off} />}
    </Widget>
  );
}
