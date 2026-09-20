import React, { useMemo } from 'react';
import {
  BUBBLE_RATE_OPTIONS,
  DOSE_AMOUNT_OPTIONS,
  FILTER_TYPES,
  HEATER_WATTAGE_OPTIONS,
  LIGHT_PAR_OPTIONS,
  POWERHEAD_FLOW_LPH,
  POWERHEAD_FLOW_RATES,
  type DailySchedule,
  type FilterType,
  type PowerheadFlowRate,
} from '../../../simulation/index.js';
import type { TunableConfig } from '../../../simulation/config/index.js';
import type { useSimulation } from '../../hooks/useSimulation';
import { useUnits } from '../../hooks/useUnits';
import { formatFlowRate } from '../../utils/units';
import {
  deviceHint,
  deviceReadings,
  hourLabel,
  scheduleEnd,
  scheduleSpans,
  scheduleWithEnd,
  scheduleWithStart,
  FILTER_LABEL,
  type DeviceId,
  type DeviceReading,
} from '../../build';
import { Drawer } from '../ui/Drawer';
import { FieldRow } from '../ui/FieldRow';
import { Select } from '../ui/Select';
import { Stepper } from '../ui/Stepper';
import { Toggle } from '../ui/Toggle';
import { Ribbon, type RackEntry } from './rack';

type Sim = ReturnType<typeof useSimulation>;

const FILTER_TYPE_OPTIONS = FILTER_TYPES.map((value) => ({ value, label: FILTER_LABEL[value] }));

const AXIS = ['00', '06', '12', '18', '24'];

function numberOptions(
  values: readonly number[],
  label: (value: number) => string
): { value: string; label: string }[] {
  return values.map((v) => ({ value: String(v), label: label(v) }));
}

/** One derived figure, in the engine's own terms. */
function Figure({ label, value, note }: DeviceReading): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="shrink-0 text-[13px] text-ink-2">{label}</span>
      <span className="min-w-0 text-right">
        <span className="text-[14px] font-medium tabular-nums text-ink">{value}</span>
        {note && <span className="block text-[12px] leading-4 text-ink-3">{note}</span>}
      </span>
    </div>
  );
}

/**
 * The day a device keeps, edited on the two ends it is stated by — both of
 * which walk through midnight, so neither end is a wall the other one isn't.
 */
function ScheduleField({
  schedule,
  hour,
  active,
  onChange,
}: {
  schedule: DailySchedule;
  hour: number;
  active: boolean;
  onChange: (schedule: DailySchedule) => void;
}): React.JSX.Element {
  const end = scheduleEnd(schedule);

  return (
    <div className="py-2">
      <Ribbon spans={scheduleSpans(schedule)} hour={hour} active={active} />
      <div className="flex justify-between pt-1 text-[11px] tabular-nums text-ink-3">
        {AXIS.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
      <FieldRow label="Start">
        <Stepper
          ariaLabel="Start hour"
          value={schedule.startHour}
          display={hourLabel(schedule.startHour)}
          onChange={(next) => onChange(scheduleWithStart(schedule, next))}
        />
      </FieldRow>
      <FieldRow label="End" note="onto Start is all day">
        <Stepper
          ariaLabel="End hour"
          value={end}
          display={hourLabel(end)}
          onChange={(next) => onChange(scheduleWithEnd(schedule, next))}
        />
      </FieldRow>
    </div>
  );
}

function DeviceFields({
  id,
  sim,
  hour,
  active,
}: {
  id: DeviceId;
  sim: Sim;
  hour: number;
  active: boolean;
}): React.JSX.Element | null {
  const { equipment } = sim.state;
  const { unitSystem, tempUnit, displayTemp, internalTemp } = useUnits();

  switch (id) {
    case 'filter':
      return (
        <FieldRow label="Type">
          <Select
            ariaLabel="Filter type"
            value={equipment.filter.type}
            onChange={(v) => sim.updateFilterType(v as FilterType)}
            options={FILTER_TYPE_OPTIONS}
          />
        </FieldRow>
      );
    case 'heater': {
      const target = Math.round(displayTemp(equipment.heater.targetTemperature));
      return (
        <>
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
              value={String(equipment.heater.wattage)}
              onChange={(v) => sim.updateHeaterWattage(Number(v))}
              options={numberOptions(HEATER_WATTAGE_OPTIONS, (w) => `${w} W`)}
            />
          </FieldRow>
        </>
      );
    }
    case 'light':
      return (
        <>
          <FieldRow label="Output">
            <Select
              ariaLabel="Light output"
              value={String(equipment.light.par)}
              onChange={(v) => sim.updateLightPar(Number(v))}
              options={numberOptions(LIGHT_PAR_OPTIONS, (par) => `${par} PAR`)}
            />
          </FieldRow>
          <ScheduleField
            schedule={equipment.light.schedule}
            hour={hour}
            active={active}
            onChange={sim.updateLightSchedule}
          />
        </>
      );
    case 'co2Generator':
      return (
        <>
          <FieldRow label="Bubble rate">
            <Select
              ariaLabel="CO₂ bubble rate"
              value={String(equipment.co2Generator.bubbleRate)}
              onChange={(v) => sim.updateCo2GeneratorBubbleRate(Number(v))}
              options={numberOptions(BUBBLE_RATE_OPTIONS, (r) => `${r.toFixed(1)} bps`)}
            />
          </FieldRow>
          <ScheduleField
            schedule={equipment.co2Generator.schedule}
            hour={hour}
            active={active}
            onChange={sim.updateCo2GeneratorSchedule}
          />
        </>
      );
    case 'powerhead':
      return (
        <FieldRow label="Flow rate">
          <Select
            ariaLabel="Powerhead flow rate"
            value={String(equipment.powerhead.flowRateGPH)}
            onChange={(v) => sim.updatePowerheadFlowRate(Number(v) as PowerheadFlowRate)}
            options={POWERHEAD_FLOW_RATES.map((gph) => ({
              value: String(gph),
              label: formatFlowRate(POWERHEAD_FLOW_LPH[gph], unitSystem),
            }))}
          />
        </FieldRow>
      );
    case 'autoDoser': {
      const doser = equipment.autoDoser;
      return (
        <>
          <FieldRow label="Dose">
            <Select
              ariaLabel="Auto doser amount"
              value={String(doser.doseAmountMl)}
              onChange={(v) => sim.updateAutoDoserAmount(Number(v))}
              options={numberOptions(DOSE_AMOUNT_OPTIONS, (ml) => `${ml.toFixed(1)} ml`)}
            />
          </FieldRow>
          <div className="py-2">
            <Ribbon
              spans={scheduleSpans({ startHour: doser.schedule.startHour, duration: 1 })}
              hour={hour}
              active={active}
            />
            <div className="flex justify-between pt-1 text-[11px] tabular-nums text-ink-3">
              {AXIS.map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
            <FieldRow label="Dose hour">
              <Stepper
                ariaLabel="Auto doser hour"
                value={doser.schedule.startHour}
                min={0}
                max={23}
                display={hourLabel(doser.schedule.startHour)}
                onChange={(startHour) =>
                  sim.updateAutoDoserSchedule({ ...doser.schedule, startHour })
                }
              />
            </FieldRow>
          </div>
        </>
      );
    }
    case 'airPump':
    case 'ato':
      return null;
  }
}

/**
 * One device, opened: its switch beside its name, the settings it takes, and
 * the figures the engine derives from them — every one an engine value, so a
 * device that is off reports being off rather than quoting its rating.
 */
export function DeviceDrawer({
  entry,
  sim,
  config,
  hour,
  onClose,
  onPower,
}: {
  entry: RackEntry | null;
  sim: Sim;
  config: TunableConfig;
  hour: number;
  onClose: () => void;
  onPower: (id: DeviceId, next: boolean) => void;
}): React.JSX.Element | null {
  const { unitSystem } = useUnits();
  const id = entry?.row.id;
  const readings = useMemo(
    () => (id ? deviceReadings(id, { state: sim.state, config, units: unitSystem }) : []),
    [id, sim.state, config, unitSystem]
  );

  if (!entry) return null;

  const { row, schedule } = entry;
  const hint = deviceHint(row.id, sim.state, config, unitSystem);

  return (
    <Drawer
      open
      onClose={onClose}
      title={row.name}
      meta={
        <span className="flex items-center gap-1.5">
          <Toggle
            checked={row.on}
            onChange={(next) => onPower(row.id, next)}
            ariaLabel={`${row.name} power`}
          />
          <span aria-hidden className={`text-[13px] ${row.on ? 'text-accent' : 'text-ink-3'}`}>
            {row.on ? 'on' : 'off'}
          </span>
        </span>
      }
    >
      <div className="p-3">
        <div className="divide-y divide-hairline">
          <DeviceFields
            id={row.id}
            sim={sim}
            hour={hour}
            active={schedule?.active ?? false}
          />
          {readings.map((reading) => (
            <Figure key={reading.label} {...reading} />
          ))}
        </div>
        {hint && (
          <p
            className={`pt-3 text-[13px] leading-relaxed ${hint.tone === 'warn' ? 'text-warn' : 'text-ink-3'}`}
          >
            {hint.text}
          </p>
        )}
      </div>
    </Drawer>
  );
}
