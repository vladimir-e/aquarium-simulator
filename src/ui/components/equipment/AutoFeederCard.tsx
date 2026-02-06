import React from 'react';
import { Toggle } from '../ui/Toggle';
import { Select } from '../ui/Select';
import { Stepper } from '../ui/Stepper';
import { Cookie } from 'lucide-react';
import type { DailySchedule } from '../../../simulation/index.js';
import {
  formatFeedPreview,
  FEED_AMOUNT_OPTIONS,
} from '../../../simulation/equipment/auto-feeder.js';

export interface AutoFeederState {
  enabled: boolean;
  feedAmountGrams: number;
  schedule: DailySchedule;
  fedToday: boolean;
}

interface AutoFeederCardProps {
  autoFeeder: AutoFeederState;
  onEnabledChange: (enabled: boolean) => void;
  onFeedAmountChange: (amountGrams: number) => void;
  onScheduleChange: (schedule: DailySchedule) => void;
}

export function AutoFeederCard({
  autoFeeder,
  onEnabledChange,
  onFeedAmountChange,
  onScheduleChange,
}: AutoFeederCardProps): React.JSX.Element {
  const handleStartHourChange = (startHour: number): void => {
    onScheduleChange({ ...autoFeeder.schedule, startHour });
  };

  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0 self-stretch flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Cookie className="w-4 h-4 text-accent-orange" />
        <h4 className="text-sm font-medium text-gray-200">Auto Feeder</h4>
      </div>

      <div className="space-y-3 flex-1">
        <Toggle
          label="Enabled"
          checked={autoFeeder.enabled}
          onChange={onEnabledChange}
        />

        {autoFeeder.enabled && (
          <>
            <Select
              label="Feed Amount"
              value={autoFeeder.feedAmountGrams}
              onChange={(e) => onFeedAmountChange(Number(e.target.value))}
            >
              {FEED_AMOUNT_OPTIONS.map((amount) => (
                <option key={amount} value={amount}>
                  {amount.toFixed(2)}g
                </option>
              ))}
            </Select>

            <div className="text-xs text-gray-400 -mt-1">
              {formatFeedPreview(autoFeeder.feedAmountGrams)}
            </div>

            <Stepper
              label="Feed Hour"
              value={autoFeeder.schedule.startHour}
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
