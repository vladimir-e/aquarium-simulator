import React, { useState } from 'react';
import { HeaterCard, HeaterState } from '../equipment/HeaterCard';

interface EquipmentBarProps {
  heater: HeaterState;
  onHeaterEnabledChange: (enabled: boolean) => void;
  onHeaterTargetTemperatureChange: (temp: number) => void;
  onHeaterWattageChange: (wattage: number) => void;
}

export function EquipmentBar({
  heater,
  onHeaterEnabledChange,
  onHeaterTargetTemperatureChange,
  onHeaterWattageChange,
}: EquipmentBarProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="sticky top-[57px] z-10 bg-panel border-b border-border">
      <div className="px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-300">Equipment</span>
          {!isExpanded && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div
                  className={`w-2 h-2 rounded-full ${
                    heater.isOn ? 'bg-accent-green' : 'bg-gray-600'
                  }`}
                />
                <span className="text-xs text-gray-400">Heater</span>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-400 hover:text-gray-200"
        >
          {isExpanded ? '▲' : '▼'}
        </button>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4">
          <HeaterCard
            heater={heater}
            onEnabledChange={onHeaterEnabledChange}
            onTargetTemperatureChange={onHeaterTargetTemperatureChange}
            onWattageChange={onHeaterWattageChange}
          />
        </div>
      )}
    </div>
  );
}
