import React from 'react';
import { Toggle } from '../ui/Toggle';
import { Stepper } from '../ui/Stepper';
import { Select } from '../ui/Select';
import { Sun } from 'lucide-react';
import type { DailySchedule } from '../../../simulation/index.js';
import { formatSchedule } from '../../../simulation/index.js';

export interface LightState {
  enabled: boolean;
  wattage: number;
  schedule: DailySchedule;
}

interface LightCardProps {
  light: LightState;
  isCurrentlyOn: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onWattageChange: (wattage: number) => void;
  onScheduleChange: (schedule: DailySchedule) => void;
}

export function LightCard({
  light,
  isCurrentlyOn,
  onEnabledChange,
  onWattageChange,
  onScheduleChange,
}: LightCardProps): React.JSX.Element {
  const handleStartHourChange = (startHour: number): void => {
    onScheduleChange({ ...light.schedule, startHour });
  };

  const handleDurationChange = (duration: number): void => {
    onScheduleChange({ ...light.schedule, duration });
  };

  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0 self-stretch flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sun className="w-4 h-4 text-accent-yellow" />
          <h4 className="text-sm font-medium text-gray-200">Light</h4>
        </div>
        {light.enabled && (
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              isCurrentlyOn
                ? 'bg-yellow-500 text-black'
                : 'bg-gray-600 text-gray-300'
            }`}
          >
            {isCurrentlyOn ? 'ON' : 'OFF'}
          </span>
        )}
      </div>

      <div className="space-y-3 flex-1">
        <Toggle
          label="Enabled"
          checked={light.enabled}
          onChange={onEnabledChange}
        />

        <Select
          label="Wattage"
          value={light.wattage}
          onChange={(e) => onWattageChange(Number(e.target.value))}
        >
          <option value={50}>50W</option>
          <option value={100}>100W</option>
          <option value={150}>150W</option>
          <option value={200}>200W</option>
        </Select>

        {light.enabled && (
          <>
            <div className="text-xs text-gray-400 border-t border-border pt-2">
              Schedule: {formatSchedule(light.schedule)}
            </div>

            <Stepper
              label="Start Hour"
              value={light.schedule.startHour}
              onChange={handleStartHourChange}
              min={0}
              max={23}
              suffix=":00"
            />

            <Stepper
              label="Duration"
              value={light.schedule.duration}
              onChange={handleDurationChange}
              min={1}
              max={24}
              suffix="h"
            />
          </>
        )}
      </div>
    </div>
  );
}
