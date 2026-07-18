import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import {
  FILTER_SURFACE,
  FILTER_SPECS,
  getFilterFlow,
  POWERHEAD_FLOW_LPH,
  type FilterType,
  type PowerheadFlowRate,
  type SimulationState,
  type DailySchedule,
} from '../../../simulation/index.js';
import { BUBBLE_RATE_OPTIONS, formatCo2Rate } from '../../../simulation/equipment/co2-generator.js';
import { DOSE_AMOUNT_OPTIONS, formatDosePreview } from '../../../simulation/equipment/auto-doser.js';
import type { useSimulation } from '../../hooks/useSimulation';
import { useUnits, type UnitSystem } from '../../hooks/useUnits';
import { formatFlowRate, lphToGph } from '../../utils/units';
import {
  buildDeviceList,
  filterDevices,
  resolveSelectedDevice,
  DEVICE_NAME,
  type DeviceId,
} from '../../build';
import { useCardCollapse } from '../../hooks/useCardCollapse';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { Card, CardBody, CardHeader, CollapseRegion } from '../run/Card';
import { StatusDot, CONTROL_FOCUS } from '../run/elements';
import { FieldRow, Select, Stepper, Toggle } from './controls';

type Sim = ReturnType<typeof useSimulation>;

const FILTER_TYPE_OPTIONS = [
  { value: 'sponge', label: 'Sponge' },
  { value: 'hob', label: 'HOB' },
  { value: 'canister', label: 'Canister' },
  { value: 'sump', label: 'Sump' },
];

const HEATER_WATTS = [50, 100, 200, 300, 500, 1000];
const LIGHT_WATTS = [5, 10, 25, 50, 100, 150, 200];
const POWERHEAD_RATES: PowerheadFlowRate[] = [240, 400, 600, 850];

const POWERHEAD_RECOMMEND: Record<UnitSystem, Record<PowerheadFlowRate, string>> = {
  imperial: { 240: '5–20 gal', 400: '20–30 gal', 600: '30–50 gal', 850: '50–80 gal' },
  metric: { 240: '20–75 L', 400: '75–115 L', 600: '115–190 L', 850: '190–300 L' },
};

function numberOptions(values: number[], suffix: string): { value: string; label: string }[] {
  return values.map((v) => ({ value: String(v), label: `${v}${suffix}` }));
}

/** Terse right-aligned figure for a device list row. */
function deviceFigure(
  id: DeviceId,
  state: SimulationState,
  unitSystem: 'metric' | 'imperial',
  formatTemp: (c: number, p?: number) => string
): string {
  const { equipment, tank } = state;
  switch (id) {
    case 'filter':
      return equipment.filter.enabled
        ? formatFlowRate(Math.round(lphToGph(getFilterFlow(equipment.filter.type, tank.capacity))), unitSystem)
        : 'off';
    case 'heater':
      return equipment.heater.enabled ? formatTemp(equipment.heater.targetTemperature, 0) : 'off';
    case 'light':
      return equipment.light.enabled ? `${equipment.light.wattage}W` : 'off';
    case 'airPump':
      return equipment.airPump.enabled ? 'on' : 'off';
    case 'ato':
      return equipment.ato.enabled ? 'on' : 'off';
    case 'co2Generator':
      return equipment.co2Generator.enabled ? `${equipment.co2Generator.bubbleRate} bps` : 'off';
    case 'powerhead':
      return equipment.powerhead.enabled ? formatFlowRate(equipment.powerhead.flowRateGPH, unitSystem) : 'off';
    case 'autoDoser':
      return equipment.autoDoser.enabled ? `${equipment.autoDoser.doseAmountMl} ml` : 'off';
  }
}

function ReadOnlyRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <FieldRow label={label}>
      <span className="font-mono text-[13px] tabular-nums text-ink-2">{value}</span>
    </FieldRow>
  );
}

function Hint({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'warn';
}): React.JSX.Element {
  return (
    <p className={`py-2 text-[12px] leading-relaxed ${tone === 'warn' ? 'text-warn-text' : 'text-ink-3'}`}>
      {children}
    </p>
  );
}

function DeviceInspector({
  id,
  sim,
  showTitle = true,
}: {
  id: DeviceId;
  sim: Sim;
  showTitle?: boolean;
}): React.JSX.Element {
  const { equipment, tank, resources } = sim.state;
  const { unitSystem, tempUnit, displayTemp, internalTemp } = useUnits();

  const setStart = (schedule: DailySchedule, startHour: number): DailySchedule => ({ ...schedule, startHour });
  const setDuration = (schedule: DailySchedule, duration: number): DailySchedule => ({ ...schedule, duration });

  let body: React.ReactNode;
  switch (id) {
    case 'filter': {
      const f = equipment.filter;
      body = (
        <>
          <FieldRow label="Enabled">
            <Toggle ariaLabel="Filter enabled" checked={f.enabled} onChange={sim.updateFilterEnabled} />
          </FieldRow>
          <FieldRow label="Type">
            <Select
              ariaLabel="Filter type"
              value={f.type}
              onChange={(v) => sim.updateFilterType(v as FilterType)}
              options={FILTER_TYPE_OPTIONS}
            />
          </FieldRow>
          <ReadOnlyRow label="Flow" value={formatFlowRate(Math.round(lphToGph(getFilterFlow(f.type, tank.capacity))), unitSystem)} />
          <ReadOnlyRow label="Surface" value={`${FILTER_SURFACE[f.type].toLocaleString()} cm²`} />
          {!f.enabled && <Hint>Off — no biological filtration while disabled.</Hint>}
          {f.enabled && tank.capacity > FILTER_SPECS[f.type].maxCapacityLiters && (
            <Hint tone="warn">Undersized for this tank — filtration can’t keep up.</Hint>
          )}
        </>
      );
      break;
    }
    case 'heater': {
      const h = equipment.heater;
      const target = Math.round(displayTemp(h.targetTemperature));
      body = (
        <>
          <FieldRow label="Enabled">
            <Toggle ariaLabel="Heater enabled" checked={h.enabled} onChange={sim.updateHeaterEnabled} />
          </FieldRow>
          <FieldRow label="Target">
            <Stepper
              ariaLabel="Heater target temperature"
              value={target}
              min={unitSystem === 'imperial' ? 59 : 15}
              max={unitSystem === 'imperial' ? 95 : 35}
              display={`${target}${tempUnit}`}
              onChange={(v) => sim.updateHeaterTargetTemperature(internalTemp(v))}
            />
          </FieldRow>
          <FieldRow label="Wattage">
            <Select
              ariaLabel="Heater wattage"
              value={String(h.wattage)}
              onChange={(v) => sim.updateHeaterWattage(Number(v))}
              options={numberOptions(HEATER_WATTS, 'W')}
            />
          </FieldRow>
        </>
      );
      break;
    }
    case 'light': {
      const l = equipment.light;
      body = (
        <>
          <FieldRow label="Enabled">
            <Toggle ariaLabel="Light enabled" checked={l.enabled} onChange={sim.updateLightEnabled} />
          </FieldRow>
          <FieldRow label="Wattage">
            <Select
              ariaLabel="Light wattage"
              value={String(l.wattage)}
              onChange={(v) => sim.updateLightWattage(Number(v))}
              options={numberOptions(LIGHT_WATTS, 'W')}
            />
          </FieldRow>
          <FieldRow label="Start">
            <Stepper
              ariaLabel="Light start hour"
              value={l.schedule.startHour}
              min={0}
              max={23}
              display={`${l.schedule.startHour}:00`}
              onChange={(v) => sim.updateLightSchedule(setStart(l.schedule, v))}
            />
          </FieldRow>
          <FieldRow label="Duration">
            <Stepper
              ariaLabel="Light duration"
              value={l.schedule.duration}
              min={1}
              max={24}
              display={`${l.schedule.duration}h`}
              onChange={(v) => sim.updateLightSchedule(setDuration(l.schedule, v))}
            />
          </FieldRow>
          <Hint>Photoperiod drives plant growth and algae.</Hint>
        </>
      );
      break;
    }
    case 'airPump': {
      const a = equipment.airPump;
      body = (
        <>
          <FieldRow label="Enabled">
            <Toggle ariaLabel="Air pump enabled" checked={a.enabled} onChange={sim.updateAirPumpEnabled} />
          </FieldRow>
          <Hint>Adds oxygen and off-gasses CO₂ through surface agitation.</Hint>
        </>
      );
      break;
    }
    case 'ato': {
      const a = equipment.ato;
      body = (
        <>
          <FieldRow label="Enabled">
            <Toggle ariaLabel="Auto top-off enabled" checked={a.enabled} onChange={sim.updateAtoEnabled} />
          </FieldRow>
          <Hint>Tops the tank back to full as water evaporates.</Hint>
        </>
      );
      break;
    }
    case 'co2Generator': {
      const c = equipment.co2Generator;
      body = (
        <>
          <FieldRow label="Enabled">
            <Toggle ariaLabel="CO₂ injector enabled" checked={c.enabled} onChange={sim.updateCo2GeneratorEnabled} />
          </FieldRow>
          <FieldRow label="Bubble rate">
            <Select
              ariaLabel="CO₂ bubble rate"
              value={String(c.bubbleRate)}
              onChange={(v) => sim.updateCo2GeneratorBubbleRate(Number(v))}
              options={BUBBLE_RATE_OPTIONS.map((r) => ({ value: String(r), label: `${r.toFixed(1)} bps` }))}
            />
          </FieldRow>
          <FieldRow label="Start">
            <Stepper
              ariaLabel="CO₂ start hour"
              value={c.schedule.startHour}
              min={0}
              max={23}
              display={`${c.schedule.startHour}:00`}
              onChange={(v) => sim.updateCo2GeneratorSchedule(setStart(c.schedule, v))}
            />
          </FieldRow>
          <FieldRow label="Duration">
            <Stepper
              ariaLabel="CO₂ duration"
              value={c.schedule.duration}
              min={1}
              max={24}
              display={`${c.schedule.duration}h`}
              onChange={(v) => sim.updateCo2GeneratorSchedule(setDuration(c.schedule, v))}
            />
          </FieldRow>
          <Hint>{formatCo2Rate(c.bubbleRate, tank.capacity)} while injecting.</Hint>
        </>
      );
      break;
    }
    case 'powerhead': {
      const p = equipment.powerhead;
      body = (
        <>
          <FieldRow label="Enabled">
            <Toggle ariaLabel="Powerhead enabled" checked={p.enabled} onChange={sim.updatePowerheadEnabled} />
          </FieldRow>
          <FieldRow label="Flow rate">
            <Select
              ariaLabel="Powerhead flow rate"
              value={String(p.flowRateGPH)}
              onChange={(v) => sim.updatePowerheadFlowRate(Number(v) as PowerheadFlowRate)}
              options={POWERHEAD_RATES.map((gph) => ({
                value: String(gph),
                label: unitSystem === 'imperial' ? `${gph} GPH` : `${POWERHEAD_FLOW_LPH[gph]} L/h`,
              }))}
            />
          </FieldRow>
          <ReadOnlyRow label="Recommended" value={POWERHEAD_RECOMMEND[unitSystem][p.flowRateGPH]} />
          <Hint>Extra circulation and gas exchange on top of the filter.</Hint>
        </>
      );
      break;
    }
    case 'autoDoser': {
      const d = equipment.autoDoser;
      body = (
        <>
          <FieldRow label="Enabled">
            <Toggle ariaLabel="Auto doser enabled" checked={d.enabled} onChange={sim.updateAutoDoserEnabled} />
          </FieldRow>
          <FieldRow label="Dose">
            <Select
              ariaLabel="Auto doser amount"
              value={String(d.doseAmountMl)}
              onChange={(v) => sim.updateAutoDoserAmount(Number(v))}
              options={DOSE_AMOUNT_OPTIONS.map((ml) => ({ value: String(ml), label: `${ml.toFixed(1)} ml` }))}
            />
          </FieldRow>
          <FieldRow label="Dose hour">
            <Stepper
              ariaLabel="Auto doser hour"
              value={d.schedule.startHour}
              min={0}
              max={23}
              display={`${d.schedule.startHour}:00`}
              onChange={(v) => sim.updateAutoDoserSchedule(setStart(d.schedule, v))}
            />
          </FieldRow>
          <Hint>{formatDosePreview(d.doseAmountMl, resources.water)}</Hint>
        </>
      );
      break;
    }
  }

  return (
    <div>
      {showTitle && <h3 className="pb-1 text-[15px] font-semibold text-ink">{DEVICE_NAME[id]}</h3>}
      <div className="divide-y divide-hairline">{body}</div>
    </div>
  );
}

/**
 * Mobile equipment editor: the desktop inspector pushed full-screen. It is
 * navigation, not a modal — a back control pops it, there is no scrim and no
 * dismiss-on-outside. Reuses `DeviceInspector` verbatim (title suppressed, since
 * the back bar names the device).
 */
function PushedEditor({
  id,
  sim,
  onBack,
}: {
  id: DeviceId;
  sim: Sim;
  onBack: () => void;
}): React.JSX.Element {
  const backRef = useRef<HTMLButtonElement>(null);
  // Entry focus: the editor is pushed navigation, so land focus on its way out.
  useEffect(() => {
    backRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-label={`${DEVICE_NAME[id]} settings`}
      className="animate-push-in fixed inset-0 z-50 flex flex-col bg-surface-2"
    >
      <div
        className="flex items-center gap-1 border-b border-hairline-2 px-2 py-2"
        style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}
      >
        <button
          ref={backRef}
          type="button"
          onClick={onBack}
          aria-label={`Back from ${DEVICE_NAME[id]} settings`}
          className="flex h-11 items-center gap-0.5 rounded-control pl-1 pr-2 text-[15px] font-medium text-accent transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <ChevronLeft className="h-5 w-5" />
          back
        </button>
        <h2 className="text-[17px] font-semibold text-ink">{DEVICE_NAME[id]}</h2>
      </div>
      <div
        className="flex-1 overflow-y-auto px-4 py-2"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <DeviceInspector id={id} sim={sim} showTitle={false} />
      </div>
    </div>
  );
}

interface EquipmentColumnProps {
  sim: Sim;
  /** Device id carried in from a Systems row tap, or null. */
  selectedDeviceId: string | null;
}

export function EquipmentColumn({ sim, selectedDeviceId }: EquipmentColumnProps): React.JSX.Element {
  const { unitSystem, formatTemp } = useUnits();
  const isMobile = useIsMobile();
  const { collapsed, toggle, showToggle, regionId } = useCardCollapse('build.equipment');
  const devices = buildDeviceList(sim.state.equipment);
  const [selected, setSelected] = useState<DeviceId>(() =>
    resolveSelectedDevice(selectedDeviceId, devices)
  );
  // On mobile a row taps into a full-screen editor rather than an inline pane;
  // a device carried in from Run opens straight into it.
  const [pushed, setPushed] = useState<DeviceId | null>(() =>
    isMobile && selectedDeviceId ? resolveSelectedDevice(selectedDeviceId, devices) : null
  );
  const [query, setQuery] = useState('');
  const visible = filterDevices(devices, query);
  const onCount = devices.filter((d) => d.on).length;
  const summary = `${onCount}/${devices.length} on`;

  // Row that opened the pushed editor, so focus can return to it on back.
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const openDevice = (id: DeviceId, trigger: HTMLButtonElement): void => {
    setSelected(id);
    if (isMobile) {
      triggerRef.current = trigger;
      setPushed(id);
    }
  };

  const closePushed = (): void => {
    setPushed(null);
    triggerRef.current?.focus();
  };

  const search = (
    <div className={`relative ${collapsed ? 'max-sm:hidden' : ''}`}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search"
        aria-label="Search equipment"
        className={`w-32 rounded-control border border-hairline bg-surface py-1 pl-8 pr-2 text-[13px] text-ink transition-colors placeholder:text-ink-3 hover:border-hairline-2 ${CONTROL_FOCUS}`}
      />
    </div>
  );

  return (
    <Card className="h-full">
      <CardHeader
        title="Equipment"
        action={search}
        collapsible={showToggle}
        collapsed={collapsed}
        onToggle={toggle}
        regionId={regionId}
        meta={collapsed ? <span className="sm:hidden">{summary}</span> : undefined}
      />
      <CollapseRegion collapsed={collapsed} id={regionId}>
      <CardBody className="px-0">
        <div className="flex flex-col md:flex-row">
          <div className="px-4 py-1 md:w-[38%] md:border-r md:border-hairline">
            {visible.length === 0 ? (
              <p className="py-4 text-[13px] text-ink-3">No device matches “{query}”.</p>
            ) : (
              visible.map((device) => {
                const isSelected = device.id === selected;
                return (
                  <button
                    key={device.id}
                    type="button"
                    onClick={(e) => openDevice(device.id, e.currentTarget)}
                    aria-pressed={isSelected}
                    aria-label={device.name}
                    className={`flex min-h-[44px] w-full items-center gap-2.5 rounded py-2 pl-2 pr-1 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                      isSelected
                        ? 'bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]'
                        : 'hover:bg-surface-2'
                    }`}
                  >
                    <StatusDot on={device.on} />
                    <span className={`text-[14px] text-ink ${isSelected ? 'font-medium' : ''}`}>
                      {device.name}
                    </span>
                    <span className="ml-auto font-mono text-[12px] tabular-nums text-ink-3">
                      {deviceFigure(device.id, sim.state, unitSystem, formatTemp)}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-3 sm:hidden" aria-hidden />
                  </button>
                );
              })
            )}
          </div>
          <div className="hidden flex-1 px-4 py-1 sm:block">
            <DeviceInspector id={selected} sim={sim} />
          </div>
        </div>
      </CardBody>
      </CollapseRegion>

      {isMobile && pushed && <PushedEditor id={pushed} sim={sim} onBack={closePushed} />}
    </Card>
  );
}
