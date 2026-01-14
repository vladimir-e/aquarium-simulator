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

      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-gray-400 mb-1">Total Surface</div>
          <div className="text-lg font-medium text-gray-200">
            {formatNumber(passiveResources.surface)} cm²
          </div>
          <div className="text-xs text-gray-500">Bacteria colonization area</div>
        </div>

        <div>
          <div className="text-xs text-gray-400 mb-1">Total Flow</div>
          <div className="text-lg font-medium text-gray-200">
            {formatNumber(passiveResources.flow)} L/h
          </div>
          <div className="text-xs text-gray-500">
            {turnoversPerHour.toFixed(1)}x turnover/hour
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-400 mb-1">Light</div>
          <div className="text-lg font-medium text-gray-200">
            {passiveResources.light > 0 ? `${passiveResources.light}W` : 'Off'}
          </div>
          <div className="text-xs text-gray-500">Photoperiod lighting</div>
        </div>
      </div>
    </div>
  );
}
