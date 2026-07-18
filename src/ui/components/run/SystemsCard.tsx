import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Action, DailySchedule, SimulationState } from '../../../simulation/index.js';
import { getFilterFlow, WATER_CHANGE_AMOUNTS } from '../../../simulation/index.js';
import { lphToGph } from '../../utils/units';
import { useUnits } from '../../hooks/useUnits';
import { Card, CardBody, CardFooter, CardHeader } from './Card';
import { RunButton, StatusDot } from './elements';
import { SplitButton, type SplitOption } from './SplitButton';

function scheduleRange(schedule: DailySchedule): string {
  const end = (schedule.startHour + schedule.duration) % 24;
  return `${schedule.startHour}:00–${end}:00`;
}

interface Device {
  id: string;
  name: string;
  on: boolean;
  detail: string;
}

interface SystemsCardProps {
  state: SimulationState;
  executeAction: (action: Action) => void;
  onOpenDeviceInBuild: (deviceId: string) => void;
}

export function SystemsCard({
  state,
  executeAction,
  onOpenDeviceInBuild,
}: SystemsCardProps): React.JSX.Element {
  const { formatTemp } = useUnits();
  const [waterPct, setWaterPct] = useState(0.25);

  const { equipment, tank, resources } = state;
  const filterGph = Math.round(lphToGph(getFilterFlow(equipment.filter.type, tank.capacity)));

  const devices: Device[] = [
    { id: 'filter', name: 'Filter', on: equipment.filter.enabled, detail: `${equipment.filter.type} · ${filterGph} GPH` },
    ...(equipment.powerhead.enabled
      ? [{ id: 'powerhead', name: 'Powerhead', on: true, detail: `${equipment.powerhead.flowRateGPH} GPH` }]
      : []),
    { id: 'heater', name: 'Heater', on: equipment.heater.enabled, detail: `${equipment.heater.enabled ? 'on' : 'off'} · target ${formatTemp(equipment.heater.targetTemperature, 0)}` },
    { id: 'light', name: 'Light', on: equipment.light.enabled, detail: `${equipment.light.wattage}W · ${scheduleRange(equipment.light.schedule)}` },
    { id: 'airPump', name: 'Air pump', on: equipment.airPump.enabled, detail: equipment.airPump.enabled ? 'on' : 'off' },
    { id: 'ato', name: 'ATO', on: equipment.ato.enabled, detail: equipment.ato.enabled ? 'on · RO water' : 'off' },
    { id: 'co2Generator', name: 'CO₂ injector', on: equipment.co2Generator.enabled, detail: equipment.co2Generator.enabled ? `on · ${equipment.co2Generator.bubbleRate} bps` : 'off' },
  ];

  const waterOptions: SplitOption[] = WATER_CHANGE_AMOUNTS.map((amount) => ({
    key: String(amount),
    label: `${Math.round(amount * 100)}%`,
    onSelect: (): void => {
      setWaterPct(amount);
      executeAction({ type: 'waterChange', amount });
    },
  }));

  return (
    <Card className="lg:min-h-[520px]">
      <CardHeader title="Systems" meta={<span>glance</span>} />
      <CardBody>
        <div className="divide-y divide-hairline">
          {devices.map((device) => (
            <button
              key={device.id}
              type="button"
              onClick={() => onOpenDeviceInBuild(device.id)}
              className="flex w-full items-center gap-3 rounded py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <StatusDot on={device.on} />
              <span className="text-[15px] text-ink">{device.name}</span>
              <span className="ml-auto flex items-center gap-2">
                <span className="font-mono tabular-nums text-[12px] text-ink-2">{device.detail}</span>
                <ChevronRight className="h-4 w-4 text-ink-3" aria-hidden />
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-4">
          <SplitButton
            label={`Water Δ ${Math.round(waterPct * 100)}%`}
            options={waterOptions}
            ariaLabel="Change water"
          />
          <RunButton
            onClick={() => executeAction({ type: 'topOff' })}
            disabled={resources.water >= tank.capacity}
          >
            Top-off
          </RunButton>
        </div>
      </CardBody>

      <CardFooter>
        <span className="text-[12px] text-ink-3">tap device → opens its editor in Build ↗</span>
      </CardFooter>
    </Card>
  );
}
