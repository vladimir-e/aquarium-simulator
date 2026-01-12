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
}: HeaterCardProps) {
  return (
    <div className="bg-background rounded-lg border border-border p-4 min-w-[200px]">
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-2 h-2 rounded-full ${
            heater.isOn ? 'bg-accent-green' : 'bg-gray-600'
          }`}
        />
        <h4 className="text-sm font-medium text-gray-200">Heater</h4>
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
