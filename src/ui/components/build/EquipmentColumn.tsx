import React, { useState } from 'react';
import { Search } from 'lucide-react';
import {
  FILTER_SURFACE,
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
import { useUnits } from '../../hooks/useUnits';
import { formatFlowRate, lphToGph } from '../../utils/units';
import {
  buildDeviceList,
  filterDevices,
  resolveSelectedDevice,
  type DeviceId,
} from '../../build';
import { Card, CardBody, CardHeader } from '../run/Card';
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

function Hint({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="py-2 text-[12px] leading-relaxed text-ink-3">{children}</p>;
}

const DEVICE_TITLE: Record<DeviceId, string> = {
  filter: 'Filter',
  heater: 'Heater',
  light: 'Light',
  airPump: 'Air pump',
  ato: 'ATO',
  co2Generator: 'CO₂ injector',
  powerhead: 'Powerhead',
  autoDoser: 'Auto doser',
};

function DeviceInspector({ id, sim }: { id: DeviceId; sim: Sim }): React.JSX.Element {
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
      <h3 className="pb-1 text-[15px] font-semibold text-ink">{DEVICE_TITLE[id]}</h3>
      <div className="divide-y divide-hairline">{body}</div>
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
  const devices = buildDeviceList(sim.state.equipment);
  const [selected, setSelected] = useState<DeviceId>(() =>
    resolveSelectedDevice(selectedDeviceId, devices)
  );
  const [query, setQuery] = useState('');
  const visible = filterDevices(devices, query);

  const search = (
    <div className="relative">
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
      <CardHeader title="Equipment" action={search} />
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
                    onClick={() => setSelected(device.id)}
                    aria-pressed={isSelected}
                    className={`flex w-full items-center gap-2.5 rounded py-2 pl-2 pr-1 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
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
                  </button>
                );
              })
            )}
          </div>
          <div className="flex-1 px-4 py-1">
            <DeviceInspector id={selected} sim={sim} />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
