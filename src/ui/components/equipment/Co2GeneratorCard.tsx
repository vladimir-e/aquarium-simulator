import React from 'react';
import { Toggle } from '../ui/Toggle';
import { Select } from '../ui/Select';
import { Stepper } from '../ui/Stepper';
import { Sparkles } from 'lucide-react';
import type { DailySchedule } from '../../../simulation/index.js';
import { formatSchedule } from '../../../simulation/index.js';
import {
  formatCo2Rate,
  BUBBLE_RATE_OPTIONS,
} from '../../../simulation/equipment/co2-generator.js';

export interface Co2GeneratorState {
  enabled: boolean;
  bubbleRate: number;
  isOn: boolean;
  schedule: DailySchedule;
}

interface Co2GeneratorCardProps {
  co2Generator: Co2GeneratorState;
  tankCapacity: number;
  onEnabledChange: (enabled: boolean) => void;
  onBubbleRateChange: (bubbleRate: number) => void;
  onScheduleChange: (schedule: DailySchedule) => void;
}

export function Co2GeneratorCard({
  co2Generator,
  tankCapacity,
  onEnabledChange,
  onBubbleRateChange,
  onScheduleChange,
}: Co2GeneratorCardProps): React.JSX.Element {
  const handleStartHourChange = (startHour: number): void => {
    onScheduleChange({ ...co2Generator.schedule, startHour });
  };

  const handleDurationChange = (duration: number): void => {
    onScheduleChange({ ...co2Generator.schedule, duration });
  };

  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0 self-stretch flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-green" />
          <h4 className="text-sm font-medium text-gray-200">CO2</h4>
        </div>
        {co2Generator.enabled && (
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              co2Generator.isOn
                ? 'bg-green-500 text-black'
                : 'bg-gray-600 text-gray-300'
            }`}
          >
            {co2Generator.isOn ? 'ON' : 'OFF'}
          </span>
        )}
      </div>

      <div className="space-y-3 flex-1">
        <Toggle
          label="Enabled"
          checked={co2Generator.enabled}
          onChange={onEnabledChange}
        />

        {co2Generator.enabled && (
          <>
            <Select
              label="Bubble Rate"
              value={co2Generator.bubbleRate}
              onChange={(e) => onBubbleRateChange(Number(e.target.value))}
            >
              {BUBBLE_RATE_OPTIONS.map((rate) => (
                <option key={rate} value={rate}>
                  {rate.toFixed(1)} bps
                </option>
              ))}
            </Select>

            <div className="text-xs text-gray-400 -mt-1">
              Rate: {formatCo2Rate(co2Generator.bubbleRate, tankCapacity)}
            </div>

            <div className="text-xs text-gray-400 border-t border-border pt-2">
              Schedule: {formatSchedule(co2Generator.schedule)}
            </div>

            <Stepper
              label="Start Hour"
              value={co2Generator.schedule.startHour}
              onChange={handleStartHourChange}
              min={0}
              max={23}
              suffix=":00"
            />

            <Stepper
              label="Duration"
              value={co2Generator.schedule.duration}
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
