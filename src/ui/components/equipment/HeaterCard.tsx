import type { Heater } from '@/simulation';
import { Toggle, Stepper, Select } from '../ui';

interface HeaterCardProps {
  heater: Heater;
  onEnabledChange: (enabled: boolean) => void;
  onTargetTempChange: (temp: number) => void;
  onWattageChange: (wattage: number) => void;
}

const WATTAGE_OPTIONS = [
  { value: 50, label: '50W' },
  { value: 100, label: '100W' },
  { value: 200, label: '200W' },
  { value: 300, label: '300W' },
  { value: 500, label: '500W' },
  { value: 1000, label: '1000W' },
];

export function HeaterCard({
  heater,
  onEnabledChange,
  onTargetTempChange,
  onWattageChange,
}: HeaterCardProps) {
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-lg p-3 min-w-[200px]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔥</span>
          <span className="text-sm font-medium text-text-primary">Heater</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Status indicator */}
          <div
            className={`w-2 h-2 rounded-full ${
              heater.isOn ? 'bg-status-on animate-pulse' : 'bg-status-off'
            }`}
            title={heater.isOn ? 'Heating' : 'Idle'}
          />
          <Toggle
            checked={heater.enabled}
            onChange={onEnabledChange}
          />
        </div>
      </div>

      {heater.enabled && (
        <div className="space-y-3">
          <Stepper
            label="Target Temperature"
            value={heater.targetTemperature}
            onChange={onTargetTempChange}
            min={18}
            max={34}
            step={0.5}
            unit="°C"
          />

          <Select
            label="Wattage"
            options={WATTAGE_OPTIONS}
            value={heater.wattage}
            onChange={(v) => onWattageChange(Number(v))}
          />
        </div>
      )}
    </div>
  );
}
