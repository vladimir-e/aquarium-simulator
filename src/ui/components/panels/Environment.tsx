import React from 'react';
import { Panel } from '../layout/Panel';
import { Stepper } from '../ui/Stepper';
import { TemperatureResource } from '../../../simulation/resources/index.js';

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
  return (
    <Panel title="Environment">
      <div className="space-y-4">
        <Stepper
          label="Room Temp"
          value={roomTemperature}
          onChange={onRoomTemperatureChange}
          min={10}
          max={40}
          suffix="°C"
        />

        <div>
          <div className="text-xs text-gray-400 mb-1">Water Temp</div>
          <div className="text-sm text-gray-200">
            {TemperatureResource.format(waterTemperature)}
          </div>
        </div>
      </div>
    </Panel>
  );
}
