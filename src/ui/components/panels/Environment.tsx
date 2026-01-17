import React from 'react';
import { Panel } from '../layout/Panel';
import { Stepper } from '../ui/Stepper';
import { useUnits } from '../../hooks/useUnits';

interface EnvironmentProps {
  roomTemperature: number;
  waterTemperature: number;
  onRoomTemperatureChange: (temp: number) => void;
}

export function Environment({
  roomTemperature,
  waterTemperature,
  onRoomTemperatureChange,
}: EnvironmentProps): React.JSX.Element {
  const { unitSystem, tempUnit, formatTemp, displayTemp, internalTemp } = useUnits();

  // Convert internal Celsius to display value (rounded for imperial)
  const roomDisplayValue = Math.round(displayTemp(roomTemperature));

  // Min/max in display units
  const minTemp = unitSystem === 'imperial' ? 50 : 10; // 10°C = 50°F
  const maxTemp = unitSystem === 'imperial' ? 104 : 40; // 40°C = 104°F

  const handleRoomTemperatureChange = (newDisplayValue: number): void => {
    onRoomTemperatureChange(internalTemp(newDisplayValue));
  };

  return (
    <Panel title="Environment">
      <div className="space-y-4">
        <Stepper
          label="Room Temp"
          value={roomDisplayValue}
          onChange={handleRoomTemperatureChange}
          min={minTemp}
          max={maxTemp}
          suffix={tempUnit}
        />

        <div>
          <div className="text-xs text-gray-400 mb-1">Water Temp</div>
          <div className="text-sm text-gray-200">
            {formatTemp(waterTemperature)}
          </div>
        </div>
      </div>
    </Panel>
  );
}
