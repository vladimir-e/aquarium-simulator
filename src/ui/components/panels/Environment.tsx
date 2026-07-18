import React from 'react';
import { Panel } from '../layout/Panel';
import { Stepper } from '../ui/Stepper';
import { useUnits } from '../../hooks/useUnits';

interface EnvironmentProps {
  roomTemperature: number;
  waterTemperature: number;
  tapWaterTemperature: number;
  tapWaterPH: number;
  onRoomTemperatureChange: (temp: number) => void;
  onTapWaterTemperatureChange: (temp: number) => void;
  onTapWaterPHChange: (ph: number) => void;
}

export function Environment({
  roomTemperature,
  waterTemperature,
  tapWaterTemperature,
  tapWaterPH,
  onRoomTemperatureChange,
  onTapWaterTemperatureChange,
  onTapWaterPHChange,
}: EnvironmentProps): React.JSX.Element {
  const { unitSystem, tempUnit, formatTemp, displayTemp, internalTemp } = useUnits();

  // Convert internal Celsius to display value (rounded for imperial)
  const roomDisplayValue = Math.round(displayTemp(roomTemperature));
  const tapDisplayValue = Math.round(displayTemp(tapWaterTemperature));

  // Min/max in display units
  const minTemp = unitSystem === 'imperial' ? 50 : 10; // 10°C = 50°F
  const maxTemp = unitSystem === 'imperial' ? 104 : 40; // 40°C = 104°F
  const minTapTemp = unitSystem === 'imperial' ? 41 : 5; // 5°C = 41°F

  const handleRoomTemperatureChange = (newDisplayValue: number): void => {
    onRoomTemperatureChange(internalTemp(newDisplayValue));
  };

  const handleTapTemperatureChange = (newDisplayValue: number): void => {
    onTapWaterTemperatureChange(internalTemp(newDisplayValue));
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
          <div className="text-sm text-gray-200">{formatTemp(waterTemperature)}</div>
        </div>

        <Stepper
          label="Tap Water Temp"
          value={tapDisplayValue}
          onChange={handleTapTemperatureChange}
          min={minTapTemp}
          max={maxTemp}
          suffix={tempUnit}
        />

        <Stepper
          label="Tap Water pH"
          value={tapWaterPH}
          onChange={onTapWaterPHChange}
          min={5.5}
          max={8.5}
          step={0.1}
        />
      </div>
    </Panel>
  );
}
