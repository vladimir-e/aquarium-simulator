import React from 'react';
import { Link } from 'react-router-dom';
import {
  equipmentRows,
  scheduleBand,
  turnoverShort,
  type DeviceId,
  type EquipmentRow,
  type ScheduleRow,
} from '../../build';
import type { useSimulation } from '../../hooks/useSimulation';
import { useUnits } from '../../hooks/useUnits';
import type { ReadingBook } from '../../readings';
import { Glyph } from '../ui/Glyph';
import { PowerToggle } from '../ui/PowerToggle';
import { Widget } from '../ui/Widget';

type Sim = ReturnType<typeof useSimulation>;

/** Which callback each device's power switch dispatches. */
const POWER: Record<DeviceId, keyof Sim> = {
  filter: 'updateFilterEnabled',
  heater: 'updateHeaterEnabled',
  light: 'updateLightEnabled',
  airPump: 'updateAirPumpEnabled',
  ato: 'updateAtoEnabled',
  co2Generator: 'updateCo2GeneratorEnabled',
  powerhead: 'updatePowerheadEnabled',
  autoDoser: 'updateAutoDoserEnabled',
};

function Ribbon({ row, hour }: { row: ScheduleRow; hour: number }): React.JSX.Element {
  return (
    <span aria-hidden className="relative block h-1.5 rounded-full bg-surface-2">
      {row.spans.map((span, i) => (
        <span
          key={i}
          className={`absolute inset-y-0 rounded-full ${row.active ? 'bg-accent opacity-70' : 'bg-band'}`}
          style={{ left: `${span.from * 100}%`, width: `${(span.to - span.from) * 100}%` }}
        />
      ))}
      <span
        className="absolute -top-[3px] h-3 w-px bg-ink"
        style={{ left: `${(hour / 24) * 100}%` }}
      />
    </span>
  );
}

function Passive({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <span className="whitespace-nowrap text-ink-2">
      {label} <span className="font-medium tabular-nums text-ink">{value}</span>
    </span>
  );
}

interface GearWidgetProps {
  book: ReadingBook;
  sim: Sim;
}

/**
 * The rack: what is powered, what it is set to, and — for the three devices
 * that keep a clock — when it runs against the hour the tank is on. Everything
 * switched off collapses into one row, because an off device has nothing to
 * read and the rack is for reading.
 */
export function GearWidget({ book, sim }: GearWidgetProps): React.JSX.Element {
  const { unitSystem } = useUnits();
  const { state } = sim;
  const rows = equipmentRows(state, book.bacteria, unitSystem).filter(
    (row): row is EquipmentRow & { id: DeviceId } => row.id !== 'biofilter'
  );
  const band = scheduleBand(state);
  const schedules = new Map(band.rows.map((row) => [row.id as string, row]));

  const on = rows.filter((row) => row.on);
  const off = rows.filter((row) => !row.on);
  const toggle = (id: DeviceId, next: boolean): void => {
    (sim[POWER[id]] as (enabled: boolean) => void)(next);
  };

  return (
    <Widget
      title="Gear"
      caption={`${on.length} of ${rows.length} on`}
      to="/gear"
      footer={
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px]">
          <Passive label="surface" value={`${Math.round(state.resources.surface).toLocaleString()} cm²`} />
          <Passive label="turnover" value={turnoverShort(state.resources.flow, state.resources.water)} />
          <Passive label="PAR at bed" value={Math.round(state.resources.light).toString()} />
          <Passive label="aeration" value={state.resources.aeration ? 'yes' : 'no'} />
        </div>
      }
    >
      {on.map((row) => {
        const schedule = schedules.get(row.id);
        return (
          <div
            key={row.id}
            className="grid h-9 grid-cols-[26px_16px_64px_minmax(0,1fr)_46px] items-center gap-2 border-t border-hairline text-[13px] first:border-t-0"
          >
            <PowerToggle
              checked
              onChange={(next) => toggle(row.id, next)}
              ariaLabel={`${row.name} power`}
            />
            <Glyph />
            <span className="truncate text-[14px] font-medium">{row.name}</span>
            {schedule ? (
              <Ribbon row={schedule} hour={band.hour} />
            ) : (
              <span className="truncate text-ink-2">{row.summary}</span>
            )}
            <span className="truncate text-right text-[12px] tabular-nums text-ink-3">
              {schedule ? schedule.detail.split(' · ')[0] : ''}
            </span>
          </div>
        );
      })}

      {off.length > 0 && (
        <Link
          to="/gear"
          className="grid h-9 grid-cols-[26px_16px_minmax(0,1fr)] items-center gap-2 border-t border-hairline text-[13px] transition-colors first:border-t-0 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden />
          <Glyph />
          <span className="truncate text-ink-3">
            <span className="text-[14px] font-medium">Others</span>
            <span className="ml-1.5">
              {off.map((row) => row.name.toLowerCase()).join(', ')} off
            </span>
          </span>
        </Link>
      )}
    </Widget>
  );
}
