import React from 'react';
import type { PassiveResources } from '../../../simulation/index.js';

interface ResourcesPanelProps {
  passiveResources: PassiveResources;
  tankCapacity: number;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function ResourcesPanel({
  passiveResources,
  tankCapacity,
}: ResourcesPanelProps): React.JSX.Element {
  // Calculate turnovers per hour (flow / tank capacity)
  const turnoversPerHour = tankCapacity > 0 ? passiveResources.flow / tankCapacity : 0;

  return (
    <div className="bg-panel rounded-lg border border-border p-4">
      <h3 className="text-sm font-medium text-gray-200 mb-3">Passive Resources</h3>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400">Total Surface</div>
          <div className="text-right">
            <span className="text-sm font-medium text-gray-200">
              {formatNumber(passiveResources.surface)} cm²
            </span>
            <span className="text-xs text-gray-500 ml-2">bacteria colonization</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400">Total Flow</div>
          <div className="text-right">
            <span className="text-sm font-medium text-gray-200">
              {formatNumber(passiveResources.flow)} L/h
            </span>
            <span className="text-xs text-gray-500 ml-2">
              ({turnoversPerHour.toFixed(1)}x/hour)
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400">Light</div>
          <div className="text-right">
            <span className="text-sm font-medium text-gray-200">
              {passiveResources.light > 0 ? `${passiveResources.light}W` : 'Off'}
            </span>
            <span className="text-xs text-gray-500 ml-2">photoperiod</span>
          </div>
        </div>
      </div>
    </div>
  );
}
