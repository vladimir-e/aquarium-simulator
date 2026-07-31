import React, { useEffect, useMemo, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FILTER_TYPES,
  HEATER_WATTAGE_OPTIONS,
  POWERHEAD_FLOW_LPH,
  POWERHEAD_FLOW_RATES,
  type DailySchedule,
  type FilterType,
  type PowerheadFlowRate,
} from '../../../simulation/index.js';
import { LIGHT_WATTAGE_OPTIONS } from '../../../simulation/equipment/light.js';
import { BUBBLE_RATE_OPTIONS } from '../../../simulation/equipment/co2-generator.js';
import { DOSE_AMOUNT_OPTIONS } from '../../../simulation/equipment/auto-doser.js';
import type { TunableConfig } from '../../../simulation/config/index.js';
import type { useSimulation } from '../../hooks/useSimulation';
import { useUnits } from '../../hooks/useUnits';
import { formatFlowRate } from '../../utils/units';
import {
  deviceHint,
  deviceReadings,
  FILTER_LABEL,
  type DeviceReading,
  type EquipmentId,
  type EquipmentRow,
} from '../../build';
import { Pill } from '../run/elements';
import { FieldRow } from '../ui/FieldRow';
import { Select } from '../ui/Select';
import { Stepper } from '../ui/Stepper';
import { Toggle } from '../ui/Toggle';

type Sim = ReturnType<typeof useSimulation>;

const FILTER_TYPE_OPTIONS = FILTER_TYPES.map((value) => ({ value, label: FILTER_LABEL[value] }));

function numberOptions(values: number[], suffix: string): { value: string; label: string }[] {
  return values.map((v) => ({ value: String(v), label: `${v}${suffix}` }));
}

function setStart(schedule: DailySchedule, startHour: number): DailySchedule {
  return { ...schedule, startHour };
}

function setDuration(schedule: DailySchedule, duration: number): DailySchedule {
  return { ...schedule, duration };
}

function ReadingRow({ label, value, note }: DeviceReading): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="shrink-0 text-[13px] text-ink-2">{label}</span>
      <span className="min-w-0 text-right">
        <span className="font-mono text-[14px] tabular-nums text-ink">{value}</span>
        {note && <span className="pl-1.5 font-mono text-[11px] text-ink-3">· {note}</span>}
      </span>
    </div>
  );
}

function DeviceSettings({ id, sim }: { id: EquipmentId; sim: Sim }): React.JSX.Element | null {
  const { equipment } = sim.state;
  const { unitSystem, tempUnit, displayTemp, internalTemp } = useUnits();

  switch (id) {
    case 'filter': {
      const f = equipment.filter;
      return (
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
        </>
      );
    }
    case 'heater': {
      const h = equipment.heater;
      const target = Math.round(displayTemp(h.targetTemperature));
      return (
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
              options={numberOptions(HEATER_WATTAGE_OPTIONS, 'W')}
            />
          </FieldRow>
        </>
      );
    }
    case 'light': {
      const l = equipment.light;
      return (
        <>
          <FieldRow label="Enabled">
            <Toggle ariaLabel="Light enabled" checked={l.enabled} onChange={sim.updateLightEnabled} />
          </FieldRow>
          <FieldRow label="Wattage">
            <Select
              ariaLabel="Light wattage"
              value={String(l.wattage)}
              onChange={(v) => sim.updateLightWattage(Number(v))}
              options={numberOptions(LIGHT_WATTAGE_OPTIONS, 'W')}
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
        </>
      );
    }
    case 'airPump':
      return (
        <FieldRow label="Enabled">
          <Toggle
            ariaLabel="Air pump enabled"
            checked={equipment.airPump.enabled}
            onChange={sim.updateAirPumpEnabled}
          />
        </FieldRow>
      );
    case 'ato':
      return (
        <FieldRow label="Enabled">
          <Toggle
            ariaLabel="Auto top-off enabled"
            checked={equipment.ato.enabled}
            onChange={sim.updateAtoEnabled}
          />
        </FieldRow>
      );
    case 'co2Generator': {
      const c = equipment.co2Generator;
      return (
        <>
          <FieldRow label="Enabled">
            <Toggle
              ariaLabel="CO₂ injector enabled"
              checked={c.enabled}
              onChange={sim.updateCo2GeneratorEnabled}
            />
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
        </>
      );
    }
    case 'powerhead': {
      const p = equipment.powerhead;
      return (
        <>
          <FieldRow label="Enabled">
            <Toggle
              ariaLabel="Powerhead enabled"
              checked={p.enabled}
              onChange={sim.updatePowerheadEnabled}
            />
          </FieldRow>
          <FieldRow label="Flow rate">
            <Select
              ariaLabel="Powerhead flow rate"
              value={String(p.flowRateGPH)}
              onChange={(v) => sim.updatePowerheadFlowRate(Number(v) as PowerheadFlowRate)}
              options={POWERHEAD_FLOW_RATES.map((gph) => ({
                value: String(gph),
                label: formatFlowRate(POWERHEAD_FLOW_LPH[gph], unitSystem),
              }))}
            />
          </FieldRow>
        </>
      );
    }
    case 'autoDoser': {
      const d = equipment.autoDoser;
      return (
        <>
          <FieldRow label="Enabled">
            <Toggle
              ariaLabel="Auto doser enabled"
              checked={d.enabled}
              onChange={sim.updateAutoDoserEnabled}
            />
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
        </>
      );
    }
    case 'biofilter':
      return null;
  }
}

interface InspectorProps {
  row: EquipmentRow;
  sim: Sim;
  config: TunableConfig;
}

export function DeviceInspector({
  row,
  sim,
  config,
  showTitle = true,
}: InspectorProps & { showTitle?: boolean }): React.JSX.Element {
  const { unitSystem } = useUnits();
  const readings = useMemo(
    () => deviceReadings(row.id, { state: sim.state, config, units: unitSystem }),
    [row.id, sim.state, config, unitSystem]
  );
  const hint = deviceHint(row.id, sim.state, config);
  const status = row.id === 'biofilter' ? (row.on ? 'cycled' : 'uncycled') : row.on ? 'on' : 'off';

  return (
    <div>
      {showTitle && (
        <div className="flex items-center gap-2.5 pb-1 pt-2">
          <h3 className="text-[17px] font-semibold text-ink">{row.name}</h3>
          <Pill variant={row.on ? 'ok' : 'neutral'}>{status}</Pill>
        </div>
      )}
      <div className="divide-y divide-hairline">
        <DeviceSettings id={row.id} sim={sim} />
        {readings.map((reading) => (
          <ReadingRow key={reading.label} {...reading} />
        ))}
      </div>
      {hint && (
        <p
          className={`pt-3 text-[12px] leading-relaxed ${hint.tone === 'warn' ? 'text-warn-text' : 'text-ink-3'}`}
        >
          {hint.text}
        </p>
      )}
    </div>
  );
}

/**
 * The inspector at phone size: pushed over the list rather than beside it. It is
 * navigation, not a modal — back pops it, and there is no scrim or dismiss on
 * outside click.
 */
export function PushedInspector({ row, sim, config }: InspectorProps): React.JSX.Element {
  const backRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  // Pop when there is something to pop; a deep link opened straight into the
  // editor has nothing behind it, so it goes to the list instead of leaving.
  const back = (): void => {
    if (location.key === 'default') navigate('/equipment', { replace: true });
    else navigate(-1);
  };

  return (
    <div
      role="dialog"
      aria-label={`${row.name} settings`}
      className="animate-push-in fixed inset-0 z-50 flex flex-col bg-surface-2"
    >
      <div
        className="flex items-center gap-1 border-b border-hairline-2 px-2 py-2"
        style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}
      >
        <button
          ref={backRef}
          type="button"
          onClick={back}
          aria-label={`Back from ${row.name} settings`}
          className="flex h-11 items-center gap-0.5 rounded-control pl-1 pr-2 text-[15px] font-medium text-accent transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <ChevronLeft className="h-5 w-5" />
          back
        </button>
        <h2 className="text-[17px] font-semibold text-ink">{row.name}</h2>
      </div>
      <div
        className="flex-1 overflow-y-auto px-4 py-2"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <DeviceInspector row={row} sim={sim} config={config} showTitle={false} />
      </div>
    </div>
  );
}
