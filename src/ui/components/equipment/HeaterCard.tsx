import React from 'react';
import { Toggle } from '../ui/Toggle';
import { Stepper } from '../ui/Stepper';
import { Select } from '../ui/Select';

export interface HeaterState {
  enabled: boolean;
  targetTemperature: number;
  wattage: number;
  isOn: boolean;
}

interface HeaterCardProps {
  heater: HeaterState;
  onEnabledChange: (enabled: boolean) => void;
  onTargetTemperatureChange: (temp: number) => void;
  onWattageChange: (wattage: number) => void;
}

export function HeaterCard({
  heater,
  onEnabledChange,
  onTargetTemperatureChange,
  onWattageChange,
}: HeaterCardProps): React.JSX.Element {
  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🌡️</span>
          <h4 className="text-sm font-medium text-gray-200">Heater</h4>
        </div>
        {heater.isOn && (
          <span className="text-xs px-2 py-0.5 bg-red-500 text-white rounded">
            HEATING
          </span>
        )}
      </div>

      <div className="space-y-3">
        <Toggle
          label="Enabled"
          checked={heater.enabled}
          onChange={onEnabledChange}
        />

        <Stepper
          label="Target Temp"
          value={heater.targetTemperature}
          onChange={onTargetTemperatureChange}
          min={15}
          max={35}
          suffix="°C"
        />

        <Select
          label="Wattage"
          value={heater.wattage}
          onChange={(e) => onWattageChange(Number(e.target.value))}
        >
          <option value={50}>50W</option>
          <option value={100}>100W</option>
          <option value={200}>200W</option>
          <option value={300}>300W</option>
          <option value={500}>500W</option>
          <option value={1000}>1000W</option>
        </Select>
      </div>
    </div>
  );
}
