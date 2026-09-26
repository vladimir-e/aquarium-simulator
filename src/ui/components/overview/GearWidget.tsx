import React, { useMemo } from 'react';
import { turnoverShort } from '../../build';
import type { useSimulation } from '../../hooks/useSimulation';
import type { ReadingBook, ReadingId } from '../../readings';
import { DeviceLine, OthersLine, powerSwitch, rackEntries, shownInPlace } from '../gear/rack';
import { CONTROL_FOCUS } from '../ui/focus';
import { TONE_TEXT } from '../ui/RangeStrip';
import type { StripTone } from '../ui/strip.js';
import { Widget } from '../ui/Widget';

function Passive({
  label,
  value,
  tone = 'ink',
  onOpen,
}: {
  label: string;
  value: string;
  tone?: StripTone;
  onOpen?: () => void;
}): React.JSX.Element {
  const body = (
    <>
      {label} <span className={`font-medium tabular-nums ${TONE_TEXT[tone]}`}>{value}</span>
    </>
  );
  if (!onOpen) return <span className="whitespace-nowrap text-ink-2">{body}</span>;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`-mx-1 whitespace-nowrap rounded-control px-1 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink ${CONTROL_FOCUS}`}
    >
      {body}
    </button>
  );
}

/**
 * The rack in a window: what is powered, what it is set to, and — for the three
 * devices that keep a clock — when it runs against the hour the tank is on.
 */
export function GearWidget({
  book,
  sim,
  onOpenReading,
}: {
  book: ReadingBook;
  sim: ReturnType<typeof useSimulation>;
  onOpenReading: (id: ReadingId) => void;
}): React.JSX.Element {
  const { state } = sim;
  const entries = useMemo(() => rackEntries(book.rack), [book.rack]);
  const on = entries.filter(shownInPlace);
  const off = entries.filter((entry) => !shownInPlace(entry));
  const onPower = powerSwitch(sim);
  const { dailyLight } = book.byId;

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
          <Passive
            label="daily light"
            value={`${dailyLight.value} ${dailyLight.unit}`}
            tone={dailyLight.tone}
            onOpen={() => onOpenReading('dailyLight')}
          />
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
