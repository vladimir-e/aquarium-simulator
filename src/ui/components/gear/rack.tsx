import React from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { DeviceId, EquipmentRow, ScheduleRow } from "../../build";
import type { useSimulation } from "../../hooks/useSimulation";
import type { Rack } from "../../readings";
import { DeviceGlyph } from "../ui/DeviceGlyph";
import { DRAWER_TOGGLE } from "../ui/Drawer";
import { Toggle } from "../ui/Toggle";

type Sim = ReturnType<typeof useSimulation>;

/** Which callback each device's switch dispatches. */
const POWER: Record<DeviceId, keyof Sim> = {
  filter: "updateFilterEnabled",
  heater: "updateHeaterEnabled",
  light: "updateLightEnabled",
  airPump: "updateAirPumpEnabled",
  ato: "updateAtoEnabled",
  co2Generator: "updateCo2GeneratorEnabled",
  powerhead: "updatePowerheadEnabled",
  autoDoser: "updateAutoDoserEnabled",
};

export function powerSwitch(sim: Sim): (id: DeviceId, next: boolean) => void {
  return (id, next) => (sim[POWER[id]] as (enabled: boolean) => void)(next);
}

/** A device row at full stage, or in the window the Overview keeps on it. */
export type RackLayout = "page" | "widget";

export interface RackEntry {
  row: EquipmentRow & { id: DeviceId };
  /** The clock it keeps, for the three devices that keep one. */
  schedule: ScheduleRow | null;
}

const TEMPLATE: Record<RackLayout, string> = {
  page: "grid-cols-[26px_16px_minmax(72px,1fr)_minmax(0,1.4fr)_44px] md:grid-cols-[26px_16px_minmax(88px,160px)_minmax(0,460px)_56px_minmax(0,1fr)_16px]",
  widget: "grid-cols-[26px_16px_88px_minmax(0,1fr)_42px]",
};

const ROW =
  "relative grid h-11 w-full items-center gap-2.5 border-t border-hairline first:border-t-0";

const CELL = "relative pointer-events-none truncate";

/** A column only a tablet-wide stage has room for. */
const WIDE = "hidden md:block";

/** The whole row is the link, laid over the cells it reads out. */
const OVERLAY =
  "absolute inset-0 transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

/**
 * The biofilter is in the book's rack but not on it: it has no switch and no
 * settings, and the Water module reads its colonies against their ceiling.
 */
export function rackEntries(rack: Rack): RackEntry[] {
  const schedules = new Map(
    rack.schedules.rows.map((row) => [row.id as DeviceId, row]),
  );
  return rack.devices
    .filter(
      (row): row is EquipmentRow & { id: DeviceId } => row.id !== "biofilter",
    )
    .map((row) => ({ row, schedule: schedules.get(row.id) ?? null }));
}

/** On-hours over one day, against the hour the tank is on. */
export function Ribbon({
  spans,
  hour,
  active,
  className = "",
}: {
  spans: { from: number; to: number }[];
  hour: number;
  active: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={`relative block h-1.5 rounded-full bg-surface-2 ${className}`}
    >
      {spans.map((span) => (
        <span
          key={span.from}
          className={`absolute inset-y-0 rounded-full ${active ? "bg-accent opacity-70" : "bg-band"}`}
          style={{
            left: `${span.from * 100}%`,
            width: `${(span.to - span.from) * 100}%`,
          }}
        />
      ))}
      <span
        className="absolute -top-[3px] h-3 w-px bg-ink"
        style={{ left: `${(hour / 24) * 100}%` }}
      />
    </span>
  );
}

/**
 * One device, laid out two ways: the switch, what it is, what it is set to —
 * and where it keeps a clock, that clock in place of the sentence, so three
 * ribbons stacked in three rows are the schedule view. Off is grey and stays
 * in place; the accent on the switch is the one status the accent may carry.
 */
export function DeviceLine({
  entry: { row, schedule },
  hour,
  layout,
  onPower,
}: {
  entry: RackEntry;
  hour: number;
  layout: RackLayout;
  onPower: (id: DeviceId, next: boolean) => void;
}): React.JSX.Element {
  const lit = row.on && schedule !== null;
  const ink = row.on ? "text-ink-2" : "text-ink-3";

  return (
    <div {...DRAWER_TOGGLE} className={`${ROW} ${TEMPLATE[layout]}`}>
      <Link
        to={`/gear/${row.id}`}
        aria-label={`${row.name} — ${row.summary}`}
        className={OVERLAY}
      />
      <span className="relative">
        <Toggle
          checked={row.on}
          onChange={(next) => onPower(row.id, next)}
          ariaLabel={`${row.name} power`}
        />
      </span>
      <DeviceGlyph
        device={row.id}
        tone={row.on ? "text-ink-2" : "text-ink-3"}
        className="relative pointer-events-none"
      />
      <span
        className={`${CELL} text-[14px] ${row.on ? "font-medium text-ink" : "text-ink-3"}`}
      >
        {row.name}
      </span>
      {lit ? (
        <span className="relative pointer-events-none">
          <Ribbon spans={schedule.spans} hour={hour} active={schedule.active} />
        </span>
      ) : (
        <span className={`${CELL} text-[13px] ${ink}`}>{row.summary}</span>
      )}
      <span
        className={`${CELL} text-right text-[12px] tabular-nums text-ink-3`}
      >
        {lit ? schedule.hours : ""}
      </span>
      {layout === "page" && <span aria-hidden className={WIDE} />}
      {layout === "page" && (
        <ChevronRight
          className={`relative pointer-events-none h-4 w-4 text-ink-3 ${WIDE}`}
          aria-hidden
        />
      )}
    </div>
  );
}

/**
 * What is switched off collapses into one row on the Overview, because an off
 * device has nothing to read and the window is for reading. The module shows
 * them in place.
 */
export function OthersLine({ off }: { off: RackEntry[] }): React.JSX.Element {
  return (
    <div className={`${ROW} ${TEMPLATE.widget}`}>
      <Link
        to="/gear"
        aria-label={`Others — ${off.map((entry) => entry.row.name.toLowerCase()).join(", ")} off`}
        className={OVERLAY}
      />
      <span aria-hidden />
      <span aria-hidden />
      <span className={`${CELL} col-span-3 text-ink-3`}>
        <span className="text-[14px] font-medium">Others</span>
        <span className="ml-1.5 text-[13px]">
          {off.map((entry) => entry.row.name.toLowerCase()).join(", ")} off
        </span>
      </span>
    </div>
  );
}
