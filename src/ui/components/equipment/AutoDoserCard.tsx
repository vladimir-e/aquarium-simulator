import React from 'react';
import { Toggle } from '../ui/Toggle';
import { Select } from '../ui/Select';
import { Stepper } from '../ui/Stepper';
import { Droplets } from 'lucide-react';
import type { DailySchedule } from '../../../simulation/index.js';
import {
  formatDosePreview,
  DOSE_AMOUNT_OPTIONS,
} from '../../../simulation/equipment/auto-doser.js';

export interface AutoDoserState {
  enabled: boolean;
  doseAmountMl: number;
  schedule: DailySchedule;
  dosedToday: boolean;
}

interface AutoDoserCardProps {
  autoDoser: AutoDoserState;
  waterVolume: number;
  onEnabledChange: (enabled: boolean) => void;
  onDoseAmountChange: (amountMl: number) => void;
  onScheduleChange: (schedule: DailySchedule) => void;
}

export function AutoDoserCard({
  autoDoser,
  waterVolume,
  onEnabledChange,
  onDoseAmountChange,
  onScheduleChange,
}: AutoDoserCardProps): React.JSX.Element {
  const handleStartHourChange = (startHour: number): void => {
    onScheduleChange({ ...autoDoser.schedule, startHour });
  };

  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0 self-stretch flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Droplets className="w-4 h-4 text-accent-blue" />
        <h4 className="text-sm font-medium text-gray-200">Auto Doser</h4>
      </div>

      <div className="space-y-3 flex-1">
        <Toggle
          label="Enabled"
          checked={autoDoser.enabled}
          onChange={onEnabledChange}
        />

        {autoDoser.enabled && (
          <>
            <Select
              label="Dose Amount"
              value={autoDoser.doseAmountMl}
              onChange={(e) => onDoseAmountChange(Number(e.target.value))}
            >
              {DOSE_AMOUNT_OPTIONS.map((amount) => (
                <option key={amount} value={amount}>
                  {amount.toFixed(1)} ml
                </option>
              ))}
            </Select>

            <div className="text-xs text-gray-400 -mt-1">
              {formatDosePreview(autoDoser.doseAmountMl, waterVolume)}
            </div>

            <Stepper
              label="Dose Hour"
              value={autoDoser.schedule.startHour}
              onChange={handleStartHourChange}
              min={0}
              max={23}
              suffix=":00"
            />
          </>
        )}
      </div>
    </div>
  );
}
