import { useState } from 'react';
import type { Equipment } from '@/simulation';
import { HeaterCard } from '../equipment/HeaterCard';

interface EquipmentBarProps {
  equipment: Equipment;
  onHeaterEnabledChange: (enabled: boolean) => void;
  onHeaterTargetTempChange: (temp: number) => void;
  onHeaterWattageChange: (wattage: number) => void;
}

interface EquipmentIconProps {
  icon: string;
  label: string;
  isOn: boolean;
  isEnabled: boolean;
}

function EquipmentIcon({ icon, label, isOn, isEnabled }: EquipmentIconProps) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 text-sm text-text-secondary"
      title={label}
    >
      <span>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
      <div
        className={`w-1.5 h-1.5 rounded-full ${
          !isEnabled
            ? 'bg-status-off'
            : isOn
              ? 'bg-status-on'
              : 'bg-accent-orange'
        }`}
      />
    </div>
  );
}

export function EquipmentBar({
  equipment,
  onHeaterEnabledChange,
  onHeaterTargetTempChange,
  onHeaterWattageChange,
}: EquipmentBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="sticky top-[49px] z-40 bg-bg-primary border-b border-border">
      {/* Collapsed bar */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider mr-3">
            Equipment
          </span>
          <EquipmentIcon
            icon="🔥"
            label="Heater"
            isOn={equipment.heater.isOn}
            isEnabled={equipment.heater.enabled}
          />
          {/* Placeholder icons for future equipment */}
          <EquipmentIcon icon="💡" label="Light" isOn={false} isEnabled={false} />
          <EquipmentIcon icon="🌡" label="Substrate" isOn={false} isEnabled={false} />
          <EquipmentIcon icon="🚰" label="Filter" isOn={false} isEnabled={false} />
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-text-secondary hover:text-text-primary transition-colors"
          aria-label={isExpanded ? 'Collapse equipment bar' : 'Expand equipment bar'}
        >
          {isExpanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-3 flex flex-wrap gap-3">
          <HeaterCard
            heater={equipment.heater}
            onEnabledChange={onHeaterEnabledChange}
            onTargetTempChange={onHeaterTargetTempChange}
            onWattageChange={onHeaterWattageChange}
          />
        </div>
      )}
    </div>
  );
}
