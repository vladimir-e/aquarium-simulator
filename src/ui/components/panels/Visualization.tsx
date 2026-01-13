import React from 'react';
import { Panel } from '../layout/Panel';
import { calculateEvaporationRatePerDay, type LidType } from '../../../simulation/index.js';

const LID_LABELS: Record<LidType, string> = {
  none: 'no lid',
  mesh: 'mesh lid',
  full: 'full lid',
  sealed: 'sealed',
};

interface VisualizationProps {
  waterLevel: number;
  capacity: number;
  waterTemperature: number;
  roomTemperature: number;
  lidType: LidType;
}

export function Visualization({
  waterLevel,
  capacity,
  waterTemperature,
  roomTemperature,
  lidType,
}: VisualizationProps): React.JSX.Element {
  const percentage = (waterLevel / capacity) * 100;
  const evaporationRate = calculateEvaporationRatePerDay(
    waterTemperature,
    roomTemperature,
    lidType
  );

  return (
    <Panel title="Visualization">
      <div className="space-y-3">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-200">
            {percentage.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-400">Water Level</div>
        </div>

        <div className="w-full bg-border rounded-full h-2 overflow-hidden">
          <div
            className="bg-accent-blue h-full transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="text-xs text-gray-400 text-center">
          {waterLevel.toFixed(1)}L / {capacity}L
        </div>

        <div className="text-xs text-gray-500 text-center">
          Evaporation {evaporationRate.toFixed(2)}%/day ({LID_LABELS[lidType]})
        </div>
      </div>
    </Panel>
  );
}
