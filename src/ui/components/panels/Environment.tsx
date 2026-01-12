import { Panel } from '../layout/Panel';
import { Stepper } from '../ui';

interface EnvironmentPanelProps {
  roomTemperature: number;
  waterTemperature: number;
  onRoomTemperatureChange: (temp: number) => void;
}

export function EnvironmentPanel({
  roomTemperature,
  waterTemperature,
  onRoomTemperatureChange,
}: EnvironmentPanelProps) {
  return (
    <Panel title="Environment">
      <div className="space-y-4">
        <Stepper
          label="Room Temp"
          value={roomTemperature}
          onChange={onRoomTemperatureChange}
          min={10}
          max={40}
          step={1}
          unit="°C"
        />

        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary">Water Temp</span>
          <div className="text-lg font-medium text-accent-blue">
            {waterTemperature.toFixed(1)}°C
          </div>
        </div>
      </div>
    </Panel>
  );
}
